/**
 * Gemini Proxy — Cloud Function wraps Google Generative Language API.
 *
 * Tier 1 LLM routing (default for low-cost queries).
 * Stream response via SSE chunked transfer back to frontend.
 *
 * Flow:
 *   Frontend (Firebase Auth Bearer token)
 *     → geminiProxy verify auth + role (admin || superadmin)
 *         → Google API streamGenerateContent?alt=sse
 *             → relay chunks back to frontend
 *
 * Endpoint: POST https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/geminiProxy
 *
 * Request body:
 *   {
 *     "messages": [
 *       { "role": "user" | "model", "text": "..." },
 *       ...
 *     ],
 *     "systemPrompt"?: "...",
 *     "model"?: "gemini-2.5-flash" (default)
 *   }
 *
 * Response: SSE stream with chunks like:
 *   data: {"text": "Đang phân tích "}\n\n
 *   data: {"text": "phổ XRD..."}\n\n
 *   data: [DONE]\n\n
 *
 * Round 111: Initial Tier 1 wiring.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";

const geminiKey = defineSecret("GEMINI_API_KEY");

const DEFAULT_MODEL = "gemini-2.5-flash";
const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro", // Tier 2 fallback (Round 113+)
]);

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiPart {
  text: string;
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiRequest {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
  };
  safetySettings?: Array<{ category: string; threshold: string }>;
}

export const geminiProxy = onRequest(
  {
    region: "asia-southeast1",
    secrets: [geminiKey],
    timeoutSeconds: 120,
    memory: "256MiB",
    cors: true, // Allow browser fetch from claude.ai or lab-manager-268a6.web.app
  },
  async (req, res) => {
    // ── 1. Auth check (allow admin || superadmin) ────────────
    let auth;
    try {
      auth = (await verifyAuth(req, "admin").catch(() => null))
        ?? (await verifyAuth(req, "superadmin"));
    } catch (e) {
      const error = e as AuthError;
      res.status(error.statusCode || 500).json({ error: error.message });
      return;
    }

    // ── 2. Validate request body ────────────
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = req.body || {};
    const messages = body.messages;
    const systemPrompt = body.systemPrompt || "";
    const model = body.model || DEFAULT_MODEL;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages must be a non-empty array" });
      return;
    }

    if (!ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: `Model not allowed: ${model}` });
      return;
    }

    // ── 3. Build Gemini request ────────────
    const contents: GeminiContent[] = messages
      .filter((m: any) => typeof m?.text === "string" && m.text.trim().length > 0)
      .map((m: any) => ({
        // Gemini uses "user" and "model" roles
        role: m.role === "assistant" || m.role === "model" ? "model" : "user",
        parts: [{ text: String(m.text) }],
      }));

    if (contents.length === 0) {
      res.status(400).json({ error: "No valid messages" });
      return;
    }

    const geminiReq: GeminiRequest = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        topP: 0.9,
      },
      // Disable safety filtering for scientific content (chemistry, etc.)
      // Adjust if needed for your use case
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    };

    if (systemPrompt) {
      geminiReq.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    // ── 4. Call Gemini API with streaming ────────────
    const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse`;
    const apiKey = geminiKey.value();

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(geminiReq),
      });
    } catch (e) {
      logger.error("Gemini fetch failed", { uid: auth.uid, error: e });
      res.status(502).json({ error: "Failed to reach Gemini API" });
      return;
    }

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => "");
      logger.error("Gemini API error", {
        uid: auth.uid,
        status: upstream.status,
        body: errBody.slice(0, 500),
      });
      res.status(upstream.status).json({
        error: `Gemini API returned ${upstream.status}`,
        details: errBody.slice(0, 200),
      });
      return;
    }

    if (!upstream.body) {
      res.status(502).json({ error: "No response body from Gemini" });
      return;
    }

    // ── 5. Stream SSE response back to client ────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines (each event ends with \n\n)
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.substring(6).trim();
          if (!data) continue;

          try {
            const json = JSON.parse(data);
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            if (text) {
              // Forward as simplified SSE chunk
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }

            // Check finish reason
            const finishReason = json?.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== "STOP") {
              logger.warn("Gemini finish reason", {
                uid: auth.uid,
                finishReason,
              });
            }
          } catch {
            // Ignore JSON parse errors (heartbeat, malformed chunks)
          }
        }
      }

      // End of stream
      res.write(`data: [DONE]\n\n`);
      res.end();

      logger.info("Gemini stream completed", {
        uid: auth.uid,
        model,
        messageCount: contents.length,
      });
    } catch (e) {
      logger.error("Gemini stream error", { uid: auth.uid, error: e });
      try {
        res.write(`data: ${JSON.stringify({ error: String(e) })}\n\n`);
        res.end();
      } catch {
        // Already closed
      }
    }
  }
);
