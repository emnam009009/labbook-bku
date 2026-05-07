/**
 * Gemini Proxy — Cloud Function wraps Google Generative Language API.
 *
 * Tier 1 LLM routing (default for low-cost queries).
 * Stream response via SSE chunked transfer back to frontend.
 *
 * Round 111: Initial Tier 1 wiring.
 * Round 111b: Manual CORS handling.
 * Round 112: Tool calling support — inject tool definitions, support
 *            multi-turn conversations with functionCall/functionResponse.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";
import { getGeminiToolDefinitions } from "../tools/registry";

const geminiKey = defineSecret("GEMINI_API_KEY");

const DEFAULT_MODEL = "gemini-2.5-flash";
const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
]);

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: any };
  functionResponse?: { name: string; response: any };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiRequest {
  systemInstruction?: { parts: { text: string }[] };
  contents: GeminiContent[];
  tools?: any[];
  toolConfig?: any;
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
  },
  async (req, res) => {
    // ── 0. Manual CORS handling ──
    const origin = req.headers.origin || "";
    const allowedOrigins = [
      "https://lab-manager-268a6.web.app",
      "https://lab-manager-268a6.firebaseapp.com",
      "http://localhost:5173",
      "http://localhost:3000",
    ];
    const allowOrigin = allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0];

    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "3600");
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    // ── 1. Auth check (allow admin || superadmin) ──
    let auth;
    try {
      auth =
        (await verifyAuth(req, "admin").catch(() => null)) ??
        (await verifyAuth(req, "superadmin"));
    } catch (e) {
      const error = e as AuthError;
      res.status(error.statusCode || 500).json({ error: error.message });
      return;
    }

    // ── 2. Validate body ──
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = req.body || {};
    const messages = body.messages;
    const systemPrompt = body.systemPrompt || "";
    const model = body.model || DEFAULT_MODEL;
    const enableTools = body.enableTools !== false; // Default true (Round 112+)
    const rawContents = body.rawContents; // Round 112: support raw multi-turn (with functionCall/Response)

    if (!ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: `Model not allowed: ${model}` });
      return;
    }

    // ── 3. Build Gemini request ──
    let contents: GeminiContent[];

    if (rawContents && Array.isArray(rawContents) && rawContents.length > 0) {
      // Round 112: Multi-turn with tools — frontend sends raw contents
      contents = rawContents;
    } else {
      // Standard: convert flat messages → Gemini contents
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages must be a non-empty array" });
        return;
      }
      contents = messages
        .filter(
          (m: any) => typeof m?.text === "string" && m.text.trim().length > 0
        )
        .map((m: any) => ({
          role:
            m.role === "assistant" || m.role === "model" ? "model" : "user",
          parts: [{ text: String(m.text) }],
        }));

      if (contents.length === 0) {
        res.status(400).json({ error: "No valid messages" });
        return;
      }
    }

    const geminiReq: GeminiRequest = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        topP: 0.9,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_ONLY_HIGH",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH",
        },
      ],
    };

    if (systemPrompt) {
      geminiReq.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    // Round 112: inject tool definitions
    if (enableTools) {
      geminiReq.tools = getGeminiToolDefinitions();
      // Optional: AUTO mode — Gemini decides when to call tools
      geminiReq.toolConfig = {
        functionCallingConfig: { mode: "AUTO" },
      };
    }

    // ── 4. Call Gemini API with streaming ──
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

    // ── 5. Stream SSE response back to client ──
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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

          try {
            const json = JSON.parse(data);
            const parts = json?.candidates?.[0]?.content?.parts || [];

            for (const part of parts) {
              // Text chunk (streaming text)
              if (typeof part.text === "string" && part.text) {
                res.write(
                  `data: ${JSON.stringify({ text: part.text })}\n\n`
                );
              }
              // Function call (Round 112)
              if (part.functionCall) {
                res.write(
                  `data: ${JSON.stringify({
                    functionCall: part.functionCall,
                  })}\n\n`
                );
              }
            }

            const finishReason = json?.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== "STOP") {
              logger.warn("Gemini finish reason", {
                uid: auth.uid,
                finishReason,
              });
            }
          } catch {
            // Ignore malformed chunks
          }
        }
      }

      res.write(`data: [DONE]\n\n`);
      res.end();

      logger.info("Gemini stream completed", {
        uid: auth.uid,
        model,
        turns: contents.length,
        toolsEnabled: enableTools,
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
