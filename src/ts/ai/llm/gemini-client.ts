/**
 * Gemini Client — SSE consumer for streaming response from geminiProxy.
 *
 * Calls Cloud Function geminiProxy (which proxies to Google API).
 * Auth: Firebase ID token in Bearer header.
 *
 * @see /AI_ARCHITECTURE.md Section 5
 */
// @ts-nocheck

import { LlmClient, LlmRequest, StreamingCallbacks } from "./types";

const PROXY_URL = "https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/geminiProxy";

/**
 * Get Firebase ID token of current user.
 * Returns null if not authenticated.
 */
async function getIdToken(): Promise<string | null> {
  try {
    const auth = (window as any).currentAuth;
    const user = auth?.user;
    if (!user) return null;

    // Firebase modular SDK: user.getIdToken() returns Promise<string>
    if (typeof user.getIdToken === "function") {
      return await user.getIdToken();
    }

    // Fallback: accessToken property
    if (typeof user.accessToken === "string") {
      return user.accessToken;
    }
    return null;
  } catch (e) {
    console.error("[Gemini] Failed to get ID token", e);
    return null;
  }
}

/**
 * Map our role names → Gemini role names ("user" | "model").
 */
function normalizeRole(role: string): "user" | "model" {
  if (role === "assistant" || role === "model") return "model";
  return "user";
}

export const geminiClient: LlmClient = {
  name: "gemini",

  async stream(req: LlmRequest, cb: StreamingCallbacks): Promise<void> {
    const idToken = await getIdToken();
    if (!idToken) {
      cb.onError?.(new Error("Not authenticated"));
      return;
    }

    // Build payload
    const payload = {
      messages: req.messages.map((m) => ({
        role: normalizeRole(m.role),
        text: m.text,
      })),
      systemPrompt: req.systemPrompt,
      model: req.model || "gemini-2.5-flash",
    };

    let response: Response;
    try {
      response = await fetch(PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
        signal: req.signal,
      });
    } catch (e) {
      cb.onError?.(e as Error);
      return;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      cb.onError?.(new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`));
      return;
    }

    if (!response.body) {
      cb.onError?.(new Error("No response body"));
      return;
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.substring(6).trim();
          if (!data) continue;
          if (data === "[DONE]") {
            cb.onComplete(accumulated);
            return;
          }

          try {
            const json = JSON.parse(data);
            if (json.error) {
              cb.onError?.(new Error(json.error));
              return;
            }
            if (typeof json.text === "string") {
              accumulated += json.text;
              cb.onChunk(accumulated);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Stream ended without [DONE]
      cb.onComplete(accumulated);
    } catch (e) {
      if ((e as any)?.name === "AbortError") {
        // User cancelled — call onComplete with what we have
        cb.onComplete(accumulated);
      } else {
        cb.onError?.(e as Error);
      }
    }
  },
};
