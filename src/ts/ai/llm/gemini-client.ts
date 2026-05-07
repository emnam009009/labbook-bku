/**
 * Gemini Client — SSE consumer + function calling loop.
 *
 * Round 111: Initial SSE wiring.
 * Round 112: Function calling loop — multi-turn with tools.
 */
// @ts-nocheck

import { LlmClient, LlmRequest, StreamingCallbacks } from "./types";
import { executeToolRemote } from "../tools/tool-client";

const PROXY_URL =
  "https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/geminiProxy";

const MAX_TOOL_ITERATIONS = 5; // Prevent infinite loops

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: any };
  functionResponse?: { name: string; response: any };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

async function getIdToken(): Promise<string | null> {
  try {
    const auth = (window as any).currentAuth;
    const user = auth?.user;
    if (!user) return null;
    if (typeof user.getIdToken === "function") {
      return await user.getIdToken();
    }
    return user.accessToken || null;
  } catch (e) {
    console.error("[Gemini] Failed to get ID token", e);
    return null;
  }
}

function normalizeRole(role: string): "user" | "model" {
  if (role === "assistant" || role === "model") return "model";
  return "user";
}

/**
 * Convert flat LlmMessages to Gemini Contents (initial state).
 */
function buildInitialContents(messages: any[]): GeminiContent[] {
  return messages
    .filter((m) => typeof m?.text === "string" && m.text.trim())
    .map((m) => ({
      role: normalizeRole(m.role),
      parts: [{ text: m.text }],
    }));
}

/**
 * Stream one Gemini turn via Cloud Function geminiProxy.
 * Returns: { text, functionCalls, error }
 */
async function streamOneTurn(
  contents: GeminiContent[],
  systemPrompt: string,
  model: string | undefined,
  enableTools: boolean,
  signal: AbortSignal | undefined,
  onTextChunk: (delta: string) => void
): Promise<{
  text: string;
  functionCalls: { name: string; args: any }[];
  error?: string;
}> {
  const idToken = await getIdToken();
  if (!idToken) {
    return { text: "", functionCalls: [], error: "Not authenticated" };
  }

  const payload: any = {
    rawContents: contents,
    systemPrompt,
    enableTools,
  };
  if (model) payload.model = model;

  let response: Response;
  try {
    response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e: any) {
    return {
      text: "",
      functionCalls: [],
      error: e?.message || "Network error",
    };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    return {
      text: "",
      functionCalls: [],
      error: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
    };
  }

  if (!response.body) {
    return { text: "", functionCalls: [], error: "No response body" };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulatedText = "";
  const functionCalls: { name: string; args: any }[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.substring(6).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          return { text: accumulatedText, functionCalls };
        }

        try {
          const json = JSON.parse(data);
          if (json.error) {
            return {
              text: accumulatedText,
              functionCalls,
              error: json.error,
            };
          }
          if (typeof json.text === "string") {
            accumulatedText += json.text;
            onTextChunk(json.text);
          }
          if (json.functionCall) {
            functionCalls.push(json.functionCall);
          }
        } catch {
          // Ignore malformed
        }
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return { text: accumulatedText, functionCalls };
    }
    return {
      text: accumulatedText,
      functionCalls,
      error: e?.message || String(e),
    };
  }

  return { text: accumulatedText, functionCalls };
}

export const geminiClient: LlmClient = {
  name: "gemini",

  async stream(req: LlmRequest, cb: StreamingCallbacks): Promise<void> {
    // Round 112: Function calling loop
    const enableTools = req.enableTools !== false;
    let contents = buildInitialContents(req.messages);
    let allAccumulated = "";
    let iteration = 0;

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      const turnStartIdx = allAccumulated.length;

      const turn = await streamOneTurn(
        contents,
        req.systemPrompt || "",
        req.model,
        enableTools,
        req.signal,
        (delta) => {
          allAccumulated += delta;
          cb.onChunk(allAccumulated);
        }
      );

      if (turn.error) {
        cb.onError?.(new Error(turn.error));
        return;
      }

      // No tool calls → final response
      if (turn.functionCalls.length === 0) {
        cb.onComplete(allAccumulated);
        return;
      }

      // Round 112: Execute tool calls
      // Round 112c: Removed visual marker — show only final result for cleaner UX

      // Append model's functionCall message to history
      contents.push({
        role: "model",
        parts: turn.functionCalls.map((fc) => ({ functionCall: fc })),
      });

      // Execute tools in parallel
      const toolResults = await Promise.all(
        turn.functionCalls.map(async (fc) => {
          const result = await executeToolRemote(fc.name, fc.args);
          return { name: fc.name, result };
        })
      );

      // Append tool results as user message
      contents.push({
        role: "user",
        parts: toolResults.map((tr) => ({
          functionResponse: {
            name: tr.name,
            response: tr.result.ok
              ? tr.result.result
              : { error: tr.result.error },
          },
        })),
      });

      // Continue loop — Gemini will see tool results and respond
    }

    // Hit iteration limit (silent — completes with whatever was accumulated)
    cb.onComplete(allAccumulated);
  },
};
