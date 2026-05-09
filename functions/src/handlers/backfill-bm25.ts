/**
 * Backfill BM25 — Round 137a
 *
 * One-time + idempotent backfill of bm25* fields for existing aiChunks docs.
 *
 * Idempotency:
 *   Chunks with bm25TokenizerVersion === current TOKENIZER_VERSION are skipped.
 *   Re-running this function is safe.
 *
 * Workflow:
 *   1. Query all aiChunks where bm25TokenizerVersion < current version
 *      (or field missing).
 *   2. For each chunk: tokenize text → write bm25* fields back.
 *   3. After all chunks: REBUILD corpus stats from scratch
 *      (more reliable than incremental on backfill).
 *
 * Modes:
 *   - dryRun: true   → counts only, no writes
 *   - dryRun: false  → write fields + rebuild stats
 *
 * Auth: superadmin only
 *
 * Performance:
 *   ~10ms tokenize/chunk × 678 chunks ≈ 7s
 *   + Firestore batch writes (500/batch) ≈ +2s
 *   Should fit comfortably in 540s timeout for current corpus.
 *   At 50K chunks: ~10 min — fine. At 500K: paginate via Pub/Sub.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";
import { tokenize } from "../bm25/tokenizer";
import { resetCorpusStats, updateCorpusStats } from "../bm25/corpus-stats";
import { TOKENIZER_VERSION } from "../bm25/types";
import type { TokenizeResult } from "../bm25/types";

const FIRESTORE_DB = "labbook";
const COLLECTION = "aiChunks";
const STATS_BATCH_SIZE = 200;  // R142c: was 500, reduced to keep peak memory low during stats rebuild

interface BackfillRequest {
  dryRun?: boolean;
  // Optional: limit how many chunks processed in this call (for paging)
  limit?: number;
  // Optional: force re-tokenize even if version matches
  force?: boolean;
}

interface BackfillResponse {
  success: boolean;
  totalChunks: number;
  candidates: number;     // chunks needing tokenization
  processed: number;      // chunks actually tokenized (0 if dryRun)
  skipped: number;        // chunks with current version
  errors: number;
  durationMs: number;
  dryRun: boolean;
}

export const backfillBM25 = onRequest(
  {
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "2GiB",  // R142c: was 1GiB, OOM during stats rebuild
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
        res.status(403).json({ error: "Chỉ superadmin được phép chạy backfill" });
        return;
      }
    } catch (e) {
      if (e instanceof AuthError) { res.status(401).json({ error: e.message }); return; }
      res.status(500).json({ error: "Auth verification failed" });
      return;
    }

    const startedAt = Date.now();
    const body = (req.body || {}) as BackfillRequest;
    const dryRun = body.dryRun !== false; // default true for safety
    const force = body.force === true;
    const limit = typeof body.limit === "number" ? Math.max(1, Math.min(body.limit, 100000)) : 0;

    logger.info(`[backfillBM25] uid=${uid} dryRun=${dryRun} force=${force} limit=${limit || "none"}`);

    try {
      const { getFirestore } = await import("firebase-admin/firestore");
      const db = getFirestore(FIRESTORE_DB);

      // Read all chunks (paginated by Firestore default 10k page size)
      const snap = await db.collection(COLLECTION).get();
      const totalChunks = snap.size;

      // Filter candidates: missing version OR version < current OR force
      const candidates = snap.docs.filter((d) => {
        const v = (d.data().bm25TokenizerVersion as number | undefined);
        return force || typeof v !== "number" || v < TOKENIZER_VERSION;
      });

      const candidateCount = candidates.length;
      const skipped = totalChunks - candidateCount;
      logger.info(`[backfillBM25] total=${totalChunks} candidates=${candidateCount} skipped=${skipped}`);

      if (dryRun) {
        const resp: BackfillResponse = {
          success: true,
          totalChunks,
          candidates: candidateCount,
          processed: 0,
          skipped,
          errors: 0,
          durationMs: Date.now() - startedAt,
          dryRun: true,
        };
        res.status(200).json(resp);
        return;
      }

      // Apply limit if requested
      const toProcess = limit > 0 ? candidates.slice(0, limit) : candidates;

      // Tokenize all in memory (fast — ~10ms/chunk)
      const tokenizeResults: TokenizeResult[] = [];
      const errorIds: string[] = [];
      for (const doc of toProcess) {
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
          logger.error(`[backfillBM25] tokenize failed for ${doc.id}`, { error: String(e) });
        }
      }
      logger.info(`[backfillBM25] tokenized ${toProcess.length} chunks (${errorIds.length} errors)`);

      // Batch write bm25 fields
      const nowMs = Date.now();
      const FS_BATCH = 500;
      let processed = 0;
      for (let i = 0; i < toProcess.length; i += FS_BATCH) {
        const batch = db.batch();
        const slice = toProcess.slice(i, i + FS_BATCH);
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
        processed += slice.length;
      }
      logger.info(`[backfillBM25] wrote ${processed} chunks`);

      // Rebuild corpus stats from scratch.
      // Strategy: reset, then accumulate ALL chunks (not just processed ones).
      // This catches any drift from prior incremental updates.
      logger.info(`[backfillBM25] rebuilding corpus stats from scratch`);
      await resetCorpusStats(db);

      // Read all chunks again (now with bm25 fields) and recompute stats
      const allSnap = await db.collection(COLLECTION).get();
      const allResults: TokenizeResult[] = [];
      for (const doc of allSnap.docs) {
        const data = doc.data();
        if (Array.isArray(data.bm25Tokens) && typeof data.bm25DocLength === "number") {
          allResults.push({
            tokens: data.bm25Tokens as string[],
            tokenFreq: (data.bm25TokenFreq as Record<string, number>) || {},
            docLength: data.bm25DocLength as number,
            language: (data.bm25Language as "en" | "vi" | "mixed") || "en",
          });
        }
      }
      // Update in batches to avoid 1MB transaction value limit on huge corpora
      for (let i = 0; i < allResults.length; i += STATS_BATCH_SIZE) {
        const slice = allResults.slice(i, i + STATS_BATCH_SIZE);
        await updateCorpusStats(db, slice, "add");
      }
      logger.info(`[backfillBM25] corpus stats rebuilt with ${allResults.length} docs`);

      const resp: BackfillResponse = {
        success: true,
        totalChunks,
        candidates: candidateCount,
        processed,
        skipped,
        errors: errorIds.length,
        durationMs: Date.now() - startedAt,
        dryRun: false,
      };
      res.status(200).json(resp);
    } catch (e: any) {
      logger.error(`[backfillBM25] exception`, { error: String(e), stack: e?.stack });
      res.status(500).json({ error: e?.message || "Internal error" });
    }
  }
);
