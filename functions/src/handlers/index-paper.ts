/**
 * Index Paper — Round 142
 *
 * Tokenize all chunks of a paper for BM25 + update corpus stats.
 * Final stage of pipeline: extract → chunk → embed → INDEX.
 *
 * Pattern matches embedChunksCore (R135):
 *   - exported core function for Pub/Sub trigger to call
 *   - HTTP wrapper for manual retry / debugging
 *
 * Idempotent: chunks with current bm25TokenizerVersion are skipped.
 * Re-running on same paper is safe.
 *
 * Workflow (per paper):
 *   1. Verify paper status === "embedded"
 *   2. Set status = "indexing"
 *   3. Read all chunks of this paper (where paperId == X)
 *   4. Filter candidates: chunks missing/stale bm25TokenizerVersion
 *   5. Tokenize text → write bm25* fields (batch 500/commit)
 *   6. Apply tokenize results to corpus stats (incremental, not rebuild)
 *   7. Set status = "indexed", publish "indexed" event
 *
 * Note on corpus stats:
 *   We use INCREMENTAL update here (mode="add") because it's per-paper.
 *   The full rebuild (`resetCorpusStats` + re-accumulate) lives in
 *   backfillBM25 for global drift correction.
 */
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";
import { publishPaperEvent } from "../utils/pubsub-publisher";
import { tokenize } from "../bm25/tokenizer";
import { updateCorpusStats } from "../bm25/corpus-stats";
import { TOKENIZER_VERSION } from "../bm25/types";
import type { TokenizeResult } from "../bm25/types";

const FIRESTORE_DB = "labbook";
const COLLECTION = "aiChunks";
const SHARED_PATH = "aiPapers/_shared";
const FS_BATCH_SIZE = 500;

export interface IndexPaperResult {
  numChunks: number;
  numIndexed: number;     // newly tokenized this run
  numSkipped: number;     // already at current TOKENIZER_VERSION
  numErrors: number;
}

/**
 * Core indexing logic — callable from Pub/Sub router.
 * Throws on fatal errors (caller handles RTDB error status).
 */
export async function indexPaperCore(paperId: string): Promise<IndexPaperResult> {
  const paperRef = admin.database().ref(`${SHARED_PATH}/${paperId}`);
  const paperSnap = await paperRef.once("value");
  const paper = paperSnap.val();
  if (!paper) throw new Error("Paper not found");
  if (paper.processingStatus !== "embedded") {
    throw new Error(`Paper status='${paper.processingStatus}', need 'embedded'`);
  }

  await paperRef.update({ processingStatus: "indexing" });

  const { getFirestore } = await import("firebase-admin/firestore");
  const db = getFirestore(FIRESTORE_DB);

  // 1. Read all chunks for this paper
  const snap = await db.collection(COLLECTION)
    .where("paperId", "==", paperId)
    .get();

  if (snap.empty) {
    throw new Error("No chunks found in Firestore for this paper");
  }

  const totalChunks = snap.size;

  // 2. Filter candidates needing tokenization
  const candidates = snap.docs.filter((d) => {
    const v = d.data().bm25TokenizerVersion as number | undefined;
    return typeof v !== "number" || v < TOKENIZER_VERSION;
  });
  const numSkipped = totalChunks - candidates.length;

  logger.info(`[indexPaperCore] paperId=${paperId} totalChunks=${totalChunks} candidates=${candidates.length} skipped=${numSkipped}`);

  // 3. Tokenize all candidates
  const tokenizeResults: TokenizeResult[] = [];
  const errorIds: string[] = [];
  for (const doc of candidates) {
    const text: string | undefined = doc.data().text;
    if (typeof text !== "string" || !text) {
      errorIds.push(doc.id);
      tokenizeResults.push({ tokens: [], tokenFreq: {}, docLength: 0, language: "en" });
      continue;
    }
    try {
      tokenizeResults.push(tokenize(text));
    } catch (e) {
      errorIds.push(doc.id);
      tokenizeResults.push({ tokens: [], tokenFreq: {}, docLength: 0, language: "en" });
      logger.error(`[indexPaperCore] tokenize failed for chunk=${doc.id}`, { error: String(e) });
    }
  }

  // 4. Batch write bm25 fields
  const nowMs = Date.now();
  let numIndexed = 0;
  for (let i = 0; i < candidates.length; i += FS_BATCH_SIZE) {
    const batch = db.batch();
    const slice = candidates.slice(i, i + FS_BATCH_SIZE);
    for (let j = 0; j < slice.length; j++) {
      const doc = slice[j];
      const tk = tokenizeResults[i + j];
      batch.update(doc.ref, {
        bm25Tokens: tk.tokens,
        bm25TokenFreq: tk.tokenFreq,
        bm25DocLength: tk.docLength,
        bm25Language: tk.language,
        bm25TokenizerVersion: TOKENIZER_VERSION,
        bm25TokenizedAt: nowMs,
      });
    }
    await batch.commit();
    numIndexed += slice.length;
    logger.info(`[indexPaperCore] paperId=${paperId} batch wrote ${slice.length} chunks (cumulative ${numIndexed}/${candidates.length})`);
  }

  // 5. Update corpus stats incrementally
  // Filter out empty results (errors) so they don't pollute DF map
  const validResults = tokenizeResults.filter((tk) => tk.docLength > 0);
  if (validResults.length > 0) {
    // Chunk into transactions to avoid 1MB transaction value limit
    const STATS_BATCH = 500;
    for (let i = 0; i < validResults.length; i += STATS_BATCH) {
      await updateCorpusStats(db, validResults.slice(i, i + STATS_BATCH), "add");
    }
    logger.info(`[indexPaperCore] paperId=${paperId} corpus stats updated with ${validResults.length} docs`);
  }

  // 6. Update RTDB metadata
  await paperRef.update({
    processingStatus: "indexed",
    bm25NumIndexed: numIndexed,
    bm25TokenizerVersion: TOKENIZER_VERSION,
    indexedAt: new Date().toISOString(),
    errorMessage: null,
  });

  // 7. Publish "indexed" event (terminal stage — router logs completion)
  await publishPaperEvent(paperId, "indexed");

  logger.info(`[indexPaperCore] DONE paperId=${paperId} indexed=${numIndexed} skipped=${numSkipped} errors=${errorIds.length}`);

  return {
    numChunks: totalChunks,
    numIndexed,
    numSkipped,
    numErrors: errorIds.length,
  };
}

/**
 * HTTP wrapper for manual retry / debugging.
 * POST { paperId } — superadmin only.
 */
interface IndexPaperRequest {
  paperId: string;
}

export const indexPaper = onRequest(
  {
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "1GiB",
    cors: true,
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    let uid: string;
    try {
      const auth = await verifyAuth(req);
      uid = auth.uid;
      const userSnap = await admin.database().ref(`users/${uid}/role`).once("value");
      if (userSnap.val() !== "superadmin") {
        res.status(403).json({ error: "Chỉ superadmin được phép" });
        return;
      }
    } catch (e) {
      if (e instanceof AuthError) { res.status(401).json({ error: e.message }); return; }
      res.status(500).json({ error: "Auth verification failed" });
      return;
    }

    const body = (req.body || {}) as IndexPaperRequest;
    if (!body?.paperId || typeof body.paperId !== "string") {
      res.status(400).json({ error: "Missing or invalid paperId" });
      return;
    }

    try {
      const result = await indexPaperCore(body.paperId);
      res.status(200).json({ success: true, paperId: body.paperId, ...result });
    } catch (e: any) {
      logger.error(`[indexPaper HTTP] paperId=${body.paperId}`, { error: String(e), stack: e?.stack });
      // Set RTDB error status
      try {
        await admin.database().ref(`${SHARED_PATH}/${body.paperId}`).update({
          processingStatus: "error",
          errorMessage: `Indexing failed: ${String(e?.message || e).slice(0, 300)}`,
        });
      } catch {}
      res.status(500).json({ error: e?.message || "Internal error" });
    }
  }
);
