/**
 * LLM Router — chọn provider theo tier + handle fallback.
 *
 * Tier 1 = Gemini Flash (rẻ, default)
 * Tier 2 = Claude Sonnet (Round 113+)
 * Tier 3 = Claude Opus (Round 115+)
 *
 * Fallback: nếu real LLM fail → fallback to mock với toast warning.
 *
 * @see /AI_ARCHITECTURE.md Section 4 (LLM Tiering)
 */
// @ts-nocheck

import { LlmClient, LlmRequest, StreamingCallbacks, Tier } from "./types";
import { geminiClient } from "./gemini-client";
import { mockClient } from "./mock-client";

/** Get client cho tier */
function getClientForTier(tier: Tier): LlmClient {
  switch (tier) {
    case 1:
      return geminiClient;
    case 2:
    case 3:
      // Tier 2/3 sẽ thêm Claude clients sau (Round 113+, 115+)
      console.warn(`[LLM Router] Tier ${tier} chưa được implement, fallback Tier 1`);
      return geminiClient;
    default:
      return geminiClient;
  }
}

/**
 * Stream response with automatic fallback to mock if primary fails.
 *
 * Errors during initial connection → fallback to mock + toast warning.
 * Errors mid-stream → don't fallback (partial response is valid).
 */
export async function streamLlm(
  req: LlmRequest,
  cb: StreamingCallbacks
): Promise<void> {
  const tier = req.tier || 1;
  const client = getClientForTier(tier);

  let chunkReceived = false;
  let fallbackTriggered = false;

  // Wrap callbacks: track if we got at least 1 chunk before deciding to fallback
  const wrappedCb: StreamingCallbacks = {
    onChunk: (accumulated) => {
      chunkReceived = true;
      cb.onChunk(accumulated);
    },
    onComplete: (fullText) => cb.onComplete(fullText),
    onError: (error) => {
      // Only fallback if we never got a chunk (initial connection failure)
      if (chunkReceived) {
        cb.onError?.(error);
        return;
      }

      if (fallbackTriggered) {
        cb.onError?.(error);
        return;
      }

      fallbackTriggered = true;
      console.warn(`[LLM Router] ${client.name} failed, falling back to mock:`, error);

      // Toast warning (Vietnamese)
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(
          `Real LLM lỗi (${error.message.slice(0, 50)}...) — dùng mock response`,
          "warning"
        );
      }

      // Fallback to mock
      mockClient.stream(req, cb).catch((e) => cb.onError?.(e));
    },
  };

  try {
    await client.stream(req, wrappedCb);
  } catch (e) {
    // Sync errors (rare) — fallback if not already triggered
    if (!chunkReceived && !fallbackTriggered) {
      fallbackTriggered = true;
      console.warn(`[LLM Router] ${client.name} threw, falling back:`, e);
      await mockClient.stream(req, cb);
    } else {
      cb.onError?.(e as Error);
    }
  }
}

/**
 * Force mock mode (dev/debug).
 */
export async function streamMock(
  req: LlmRequest,
  cb: StreamingCallbacks
): Promise<void> {
  await mockClient.stream(req, cb);
}
