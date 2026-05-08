/**
 * Pub/Sub Publisher Helper — Round 134b
 *
 * Single topic "paper-pipeline" với message { paperId, stage }.
 * Stages: extracted → chunked → embedded → indexed
 */
import { PubSub } from "@google-cloud/pubsub";
import { logger } from "./logger";

const TOPIC_NAME = "paper-pipeline";

let _pubsub: PubSub | null = null;
function getPubSub(): PubSub {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

export type PaperStage = "extracted" | "chunked" | "embedded" | "indexed";

export interface PaperEvent {
  paperId: string;
  stage: PaperStage;
  timestamp: string;
}

/**
 * Publish event to paper pipeline topic.
 * Idempotent: subscriber phải handle duplicate messages.
 */
export async function publishPaperEvent(paperId: string, stage: PaperStage): Promise<void> {
  const event: PaperEvent = {
    paperId,
    stage,
    timestamp: new Date().toISOString(),
  };
  try {
    const topic = getPubSub().topic(TOPIC_NAME);
    const messageId = await topic.publishMessage({
      data: Buffer.from(JSON.stringify(event)),
      attributes: { paperId, stage },
    });
    logger.info(`[pubsub] Published ${stage} paperId=${paperId} messageId=${messageId}`);
  } catch (e: any) {
    logger.error(`[pubsub] Publish failed paperId=${paperId} stage=${stage}`, { error: String(e) });
    // KHÔNG throw — pipeline tiếp tục dù publish fail (manual retry)
  }
}
