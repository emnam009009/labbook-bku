/**
 * LLM types — shared across providers.
 */
// @ts-nocheck

export type Role = "user" | "assistant" | "system" | "model";

export interface LlmMessage {
  role: Role;
  text: string;
}

export type Tier = 1 | 2 | 3;

export interface LlmRequest {
  messages: LlmMessage[];
  systemPrompt?: string;
  tier?: Tier;
  /** Override model name (advanced) */
  model?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface StreamingCallbacks {
  /** Called for each accumulated chunk of text */
  onChunk: (accumulated: string) => void;
  /** Called when stream completes */
  onComplete: (fullText: string) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

export interface LlmClient {
  name: string;
  stream(req: LlmRequest, cb: StreamingCallbacks): Promise<void>;
}
