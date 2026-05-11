/**
 * Mock Client — fallback khi real LLM fail (network/rate limit/auth).
 *
 * Cũng dùng cho dev test offline (không tốn API quota).
 *
 * @see streaming-mock.ts (legacy from R110, kept for backward compat)
 */
// @ts-nocheck — AI module — partial typing (R105+ skeleton). Cleanup after RAG/streaming stabilization.

import { LlmClient, LlmRequest, StreamingCallbacks } from "./types";
import { mockStream as legacyMockStream } from "../ui/streaming-mock";

export const mockClient: LlmClient = {
  name: "mock",

  async stream(req: LlmRequest, cb: StreamingCallbacks): Promise<void> {
    // Lấy text từ message cuối user
    const lastUserMsg = [...req.messages].reverse().find((m) => m.role === "user");
    const userText = lastUserMsg?.text || "";

    await legacyMockStream(userText, cb);
  },
};
