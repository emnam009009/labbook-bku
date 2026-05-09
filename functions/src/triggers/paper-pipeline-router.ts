/**
 * Paper Pipeline Router — Round 134b
 *
 * Subscribe Pub/Sub topic "paper-pipeline".
 * Route message theo stage:
 *   - "extracted" → trigger chunkPaper
 *   - "chunked" → trigger embedPaper (R135+)
 *   - "embedded" → trigger indexPaper (R136+)
 *
 * Pattern: chunkPaper logic được tách ra function shared (chunkPaperCore)
 * để cả HTTP endpoint và Pub/Sub trigger đều gọi được.
 */
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import * as admin from "firebase-admin";
import { logger } from "../utils/logger";
import { chunkPaperCore } from "../handlers/chunk-paper";
import { embedChunksCore } from "../handlers/embed-chunks";
import { indexPaperCore } from "../handlers/index-paper";
import { defineSecret } from "firebase-functions/params";

const voyageKey = defineSecret("VOYAGE_API_KEY");

interface PaperEvent {
  paperId: string;
  stage: "extracted" | "chunked" | "embedded" | "indexed";
  timestamp: string;
}

export const paperPipelineRouter = onMessagePublished(
  {
    topic: "paper-pipeline",
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "512MiB",
    retry: false,  // Manual retry nếu fail (tránh loop bug)
    secrets: [voyageKey],  // R135: cho embedChunksCore
  },
  async (event) => {
    let payload: PaperEvent;
    try {
      const dataStr = event.data.message.data
        ? Buffer.from(event.data.message.data, "base64").toString()
        : "{}";
      payload = JSON.parse(dataStr) as PaperEvent;
    } catch (e: any) {
      logger.error("[router] Invalid message payload", { error: String(e) });
      return;
    }

    const { paperId, stage } = payload;
    if (!paperId || !stage) {
      logger.warn("[router] Missing paperId or stage", { payload });
      return;
    }

    logger.info(`[router] Received stage=${stage} paperId=${paperId}`);

    try {
      switch (stage) {
        case "extracted":
          // Trigger chunking
          await chunkPaperCore(paperId);
          break;
        case "chunked":
          // R135: trigger embedding
          await embedChunksCore(paperId);
          break;
        case "embedded":
          // R142: trigger BM25 indexing (final pipeline stage)
          await indexPaperCore(paperId);
          break;
        case "indexed":
          // Pipeline complete
          logger.info(`[router] Pipeline complete for paperId=${paperId}`);
          break;
        default:
          logger.warn(`[router] Unknown stage: ${stage}`);
      }
    } catch (e: any) {
      logger.error(`[router] Stage handler failed paperId=${paperId} stage=${stage}`, {
        error: String(e),
        stack: e?.stack,
      });
      // Update RTDB error status
      try {
        await admin.database().ref(`aiPapers/_shared/${paperId}`).update({
          processingStatus: "error",
          errorMessage: `Pipeline ${stage} failed: ${String(e?.message || e).slice(0, 300)}`,
        });
      } catch {}
    }
  }
);
