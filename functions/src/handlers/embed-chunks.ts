/**
 * Embed Chunks — Round 135
 *
 * Generate embeddings cho mỗi chunk via Voyage API (voyage-context-3).
 * Pattern: callable từ Pub/Sub trigger (paperPipelineRouter case "chunked").
 */
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { logger } from "../utils/logger";
import { publishPaperEvent } from "../utils/pubsub-publisher";

const voyageKey = defineSecret("VOYAGE_API_KEY");

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-large";
const VOYAGE_BATCH_SIZE = 128;
const FIRESTORE_DB = "labbook";
const COLLECTION = "aiChunks";
const SHARED_PATH = "aiPapers/_shared";

interface VoyageEmbedRequest {
  input: string[];
  model: string;
  input_type: "document" | "query";
}

interface VoyageEmbedResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

/**
 * Core embedding logic — callable từ Pub/Sub router.
 * Throws on error (caller handles).
 */
export async function embedChunksCore(paperId: string): Promise<{
  numEmbedded: number;
  totalTokens: number;
}> {
  const paperRef = admin.database().ref(`${SHARED_PATH}/${paperId}`);
  const paperSnap = await paperRef.once("value");
  const paper = paperSnap.val();
  if (!paper) throw new Error("Paper not found");
  if (paper.processingStatus !== "chunked") {
    throw new Error(`Paper status='${paper.processingStatus}', need 'chunked'`);
  }

  await paperRef.update({ processingStatus: "embedding" });

  const { getFirestore } = await import("firebase-admin/firestore");
  const db = getFirestore(FIRESTORE_DB);

  // Query chunks sorted by chunkIndex
  const snap = await db.collection(COLLECTION)
    .where("paperId", "==", paperId)
    .orderBy("chunkIndex", "asc")
    .get();

  if (snap.empty) {
    throw new Error("No chunks found in Firestore");
  }
  const chunks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  logger.info(`[embedChunksCore] paperId=${paperId} ${chunks.length} chunks to embed`);

  const apiKey = voyageKey.value();
  let totalTokens = 0;
  let totalEmbedded = 0;

  // Batch process
  for (let i = 0; i < chunks.length; i += VOYAGE_BATCH_SIZE) {
    const batch = chunks.slice(i, i + VOYAGE_BATCH_SIZE);
    const texts = batch.map((c: any) => c.text);

    const reqBody: VoyageEmbedRequest = {
      input: texts,
      model: VOYAGE_MODEL,
      input_type: "document",
    };

    logger.info(`[embedChunksCore] Voyage batch ${i / VOYAGE_BATCH_SIZE + 1} of ${Math.ceil(chunks.length / VOYAGE_BATCH_SIZE)} (${batch.length} chunks)`);

    const resp = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Voyage API error ${resp.status}: ${errText.slice(0, 300)}`);
    }
    const data = (await resp.json()) as VoyageEmbedResponse;
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error(`Voyage response invalid: ${JSON.stringify(data).slice(0, 200)}`);
    }

    totalTokens += data.usage?.total_tokens || 0;

    // Write embeddings back to Firestore (batch write)
    const writeBatch = db.batch();
    for (let j = 0; j < data.data.length; j++) {
      const item = data.data[j];
      const chunk = batch[item.index];
      if (!chunk) continue;
      const docRef = db.collection(COLLECTION).doc(chunk.id);
      // Firestore vector field: array of numbers
      writeBatch.update(docRef, {
        embedding: admin.firestore.FieldValue.vector(item.embedding),
        embeddingModel: VOYAGE_MODEL,
        embeddedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      totalEmbedded++;
    }
    await writeBatch.commit();
    logger.info(`[embedChunksCore] Batch wrote ${data.data.length} embeddings`);
  }

  // Update RTDB
  await paperRef.update({
    processingStatus: "embedded",
    numEmbedded: totalEmbedded,
    embeddingModel: VOYAGE_MODEL,
    embeddedAt: new Date().toISOString(),
    embeddingTokens: totalTokens,
    errorMessage: null,
  });

  // Publish "embedded" event
  await publishPaperEvent(paperId, "embedded");

  logger.info(`[embedChunksCore] DONE paperId=${paperId} embedded=${totalEmbedded} tokens=${totalTokens}`);
  return { numEmbedded: totalEmbedded, totalTokens };
}
