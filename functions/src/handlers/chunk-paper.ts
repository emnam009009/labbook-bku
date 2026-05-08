/**
 * Chunk Paper — Round 134a
 *
 * Section-aware chunking algorithm:
 * 1. Parse markdown headings → sections
 * 2. Mỗi section, nếu ≤500 tokens → 1 chunk
 *    Nếu >500 tokens → split by paragraph với overlap 50 tokens
 * 3. Batch write Firestore aiChunks/{auto-id}
 *
 * Token estimation: chars/4 (rough, đủ cho RAG).
 */
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";
import { publishPaperEvent } from "../utils/pubsub-publisher";
import { tokenize } from "../bm25/tokenizer";
import { updateCorpusStats } from "../bm25/corpus-stats";
import { TOKENIZER_VERSION } from "../bm25/types";
import type { TokenizeResult } from "../bm25/types";

const SHARED_PATH = "aiPapers/_shared";
const FIRESTORE_DB = "labbook";
const COLLECTION = "aiChunks";
const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const TOKENS_PER_CHAR = 0.25;  // ~chars/4

// Estimate tokens (rough approximation)
function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

// Get last N tokens worth of text (approx)
function lastNTokens(text: string, nTokens: number): string {
  const charCount = Math.ceil(nTokens / TOKENS_PER_CHAR);
  if (text.length <= charCount) return text;
  // Cut on word boundary
  const slice = text.slice(-charCount);
  const firstSpace = slice.indexOf(" ");
  return firstSpace > 0 ? slice.slice(firstSpace + 1) : slice;
}

interface Section {
  path: string;       // "Introduction > Methods > CV"
  level: number;      // 1 for #, 2 for ##, etc
  content: string;    // section body
}

interface Chunk {
  paperId: string;
  chunkIndex: number;
  sectionPath: string;
  text: string;
  tokenCount: number;
  charCount: number;
}

/**
 * Parse markdown vào sections theo headings.
 * Hierarchical path tracking: # → ## → ### tạo path "L1 > L2 > L3".
 */
function parseSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  const headingStack: { level: number; title: string }[] = [];
  let currentContent: string[] = [];
  let currentPath = "";
  let currentLevel = 0;

  const flush = () => {
    const content = currentContent.join("\n").trim();
    if (content) {
      sections.push({ path: currentPath || "(intro)", level: currentLevel, content });
    }
    currentContent = [];
  };

  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) {
      flush();
      const level = m[1].length;
      const title = m[2].trim();
      // Pop stack to current level - 1
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, title });
      currentPath = headingStack.map((h) => h.title).join(" > ");
      currentLevel = level;
    } else {
      currentContent.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Split section thành chunks với overlap.
 */
function chunkSection(section: Section, paperId: string, startIndex: number): Chunk[] {
  const chunks: Chunk[] = [];
  const tokens = estimateTokens(section.content);

  if (tokens <= TARGET_TOKENS) {
    chunks.push({
      paperId,
      chunkIndex: startIndex,
      sectionPath: section.path,
      text: section.content,
      tokenCount: tokens,
      charCount: section.content.length,
    });
    return chunks;
  }

  // Split by paragraph (double newline)
  const paragraphs = section.content.split(/\n\n+/).filter((p) => p.trim());
  let buffer = "";
  let bufferTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (bufferTokens + paraTokens > TARGET_TOKENS && buffer) {
      // Flush current buffer
      chunks.push({
        paperId,
        chunkIndex: startIndex + chunks.length,
        sectionPath: section.path,
        text: buffer.trim(),
        tokenCount: bufferTokens,
        charCount: buffer.length,
      });
      // Start new buffer with overlap
      const overlap = lastNTokens(buffer, OVERLAP_TOKENS);
      buffer = overlap + "\n\n" + para;
      bufferTokens = estimateTokens(buffer);
    } else {
      buffer = buffer ? buffer + "\n\n" + para : para;
      bufferTokens += paraTokens;
    }

    // Edge case: single paragraph >TARGET_TOKENS → split bằng cách chấp nhận quá size
    if (paraTokens > TARGET_TOKENS && buffer === para) {
      chunks.push({
        paperId,
        chunkIndex: startIndex + chunks.length,
        sectionPath: section.path,
        text: buffer.trim(),
        tokenCount: bufferTokens,
        charCount: buffer.length,
      });
      buffer = "";
      bufferTokens = 0;
    }
  }
  if (buffer.trim()) {
    chunks.push({
      paperId,
      chunkIndex: startIndex + chunks.length,
      sectionPath: section.path,
      text: buffer.trim(),
      tokenCount: bufferTokens,
      charCount: buffer.length,
    });
  }
  return chunks;
}

interface ChunkRequest {
  paperId: string;
}

/**
 * Core chunking logic — callable from both HTTP handler and Pub/Sub trigger.
 * No auth check (caller responsibility), no HTTP response.
 *
 * Returns { numChunks, numSections } on success.
 * Throws on error (caller handles error reporting).
 */
export async function chunkPaperCore(paperId: string): Promise<{ numChunks: number; numSections: number }> {
  const paperRef = admin.database().ref(`${SHARED_PATH}/${paperId}`);
  const paperSnap = await paperRef.once("value");
  const paper = paperSnap.val();
  if (!paper) throw new Error("Paper not found");
  if (paper.processingStatus !== "extracted") {
    throw new Error(`Paper status='${paper.processingStatus}', need 'extracted'`);
  }

  await paperRef.update({ processingStatus: "chunking" });

  const bucket = admin.storage().bucket();
  const mdFile = bucket.file(paper.textPath);
  const [exists] = await mdFile.exists();
  if (!exists) {
    await paperRef.update({ processingStatus: "error", errorMessage: "extracted.md missing" });
    throw new Error("extracted.md not found in Storage");
  }
  const [mdBuffer] = await mdFile.download();
  const markdown = mdBuffer.toString("utf-8");
  logger.info(`[chunkPaperCore] markdown ${markdown.length} chars`);

  const sections = parseSections(markdown);
  logger.info(`[chunkPaperCore] ${sections.length} sections`);

  const allChunks: Chunk[] = [];
  let chunkIdx = 0;
  for (const section of sections) {
    const chunks = chunkSection(section, paperId, chunkIdx);
    allChunks.push(...chunks);
    chunkIdx += chunks.length;
  }
  logger.info(`[chunkPaperCore] ${allChunks.length} chunks generated`);

  // Firestore batch write (named DB "labbook")
  // R134b-fix: dùng getFirestore từ firebase-admin/firestore với dbId param
  const { getFirestore } = await import("firebase-admin/firestore");
  const dbInstance = getFirestore(FIRESTORE_DB);

  // Delete existing chunks (idempotent)
  const existing = await dbInstance.collection(COLLECTION).where("paperId", "==", paperId).get();
  if (!existing.empty) {
    const delBatch = dbInstance.batch();
    existing.docs.forEach((d) => delBatch.delete(d.ref));
    await delBatch.commit();
  }

  // R137a: Tokenize each chunk for BM25 inverted index
  const tokenizeResults: TokenizeResult[] = [];
  for (const chunk of allChunks) {
    tokenizeResults.push(tokenize(chunk.text));
  }
  logger.info(`[chunkPaperCore] tokenized ${tokenizeResults.length} chunks for BM25`);

  const BATCH_SIZE = 500;
  const nowMs = Date.now();
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = dbInstance.batch();
    for (let j = 0; j < allChunks.slice(i, i + BATCH_SIZE).length; j++) {
      const chunk = allChunks[i + j];
      const tk = tokenizeResults[i + j];
      const docRef = dbInstance.collection(COLLECTION).doc();
      batch.set(docRef, {
        ...chunk,
        embedding: null,
        embeddingModel: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        // R137a BM25 fields
        bm25Tokens: tk.tokens,
        bm25TokenFreq: tk.tokenFreq,
        bm25DocLength: tk.docLength,
        bm25Language: tk.language,
        bm25TokenizerVersion: TOKENIZER_VERSION,
        bm25TokenizedAt: nowMs,
      });
    }
    await batch.commit();
  }

  // R137a: Update corpus stats incrementally (after all chunk writes succeeded)
  try {
    await updateCorpusStats(dbInstance, tokenizeResults, "add");
    logger.info(`[chunkPaperCore] corpus stats updated +${tokenizeResults.length} docs`);
  } catch (e) {
    logger.error(`[chunkPaperCore] corpus stats update failed`, { error: String(e) });
    // Non-fatal: chunks are written, stats can be rebuilt via backfill
  }

  await paperRef.update({
    processingStatus: "chunked",
    numChunks: allChunks.length,
    chunkedAt: new Date().toISOString(),
    errorMessage: null,
  });

  // R134b: Publish "chunked" event để trigger embed (R135+)
  await publishPaperEvent(paperId, "chunked");

  return { numChunks: allChunks.length, numSections: sections.length };
}


export const chunkPaper = onRequest(
  {
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "512MiB",
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
        res.status(403).json({ error: "Chỉ superadmin được phép chunk" });
        return;
      }
    } catch (e) {
      if (e instanceof AuthError) { res.status(401).json({ error: e.message }); return; }
      res.status(500).json({ error: "Auth verification failed" });
      return;
    }

    const body = req.body as ChunkRequest;
    if (!body?.paperId || typeof body.paperId !== "string") {
      res.status(400).json({ error: "Missing paperId" });
      return;
    }
    const { paperId } = body;
    logger.info(`[chunkPaper] uid=${uid} paperId=${paperId} START`);

    try {
      const result = await chunkPaperCore(paperId);
      res.status(200).json({
        success: true,
        paperId,
        ...result,
      });
    } catch (e: any) {
      logger.error(`[chunkPaper] Exception paperId=${paperId}`, { error: String(e), stack: e?.stack });
      try {
        await admin.database().ref(`${SHARED_PATH}/${paperId}`).update({
          processingStatus: "error",
          errorMessage: String(e?.message || e).slice(0, 500),
        });
      } catch {}
      res.status(500).json({ error: e?.message || "Internal error" });
    }
  }
);
