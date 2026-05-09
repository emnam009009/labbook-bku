/**
 * Claude Proxy — Cloud Function wraps Anthropic Messages API.
 *
 * Tier 2 (Sonnet 4.6) + Tier 3 (Opus 4.7) LLM routing.
 * Stream response via SSE chunks normalized to Gemini-like format so
 * frontend can consume the same wire protocol regardless of tier.
 *
 * Round 138a — initial wiring; tool calling support included.
 *
 * Wire format (output to frontend):
 *   data: {"text": "..."}\n\n
 *   data: {"toolUse": {"id":..., "name":..., "input":{...}}}\n\n
 *   data: [DONE]\n\n
 *
 * Note: Anthropic uses "tool_use" blocks; we expose them as `toolUse` in our
 * normalized chunks (distinct from Gemini\'s `functionCall` so frontend can
 * tell which LLM produced what).
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";
import { getAnthropicToolDefinitions } from "../tools/registry";

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

const DEFAULT_MODEL = "claude-sonnet-4-6";
const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5",
]);

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Models on which temperature/top_p/top_k are forbidden (returns 400 if set).
// Per docs: Opus 4.7 specifically forbids these. Future models may join.
const NO_SAMPLING_PARAMS_MODELS = new Set(["claude-opus-4-7"]);

// ── Anthropic message types ──
interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  tools?: any[];
  temperature?: number;
  // Note: top_p intentionally omitted (R138a-fix).
  // Anthropic now rejects requests that set both temperature and top_p.
  stream: true;
}

// ── Frontend request shape (mirror geminiProxy where possible) ──
interface ClaudeProxyRequest {
  model?: string;
  messages?: Array<{ role: "user" | "assistant" | "model"; text?: string }>;
  // Round 138a: caller may send pre-shaped Anthropic messages for multi-turn
  // tool conversations (analogous to geminiProxy.rawContents)
  rawMessages?: AnthropicMessage[];
  systemPrompt?: string;
  enableTools?: boolean;
  maxTokens?: number;
}

// ────────────────────────────────────────────────────────────
// Build Anthropic request from caller body
// ────────────────────────────────────────────────────────────
function buildAnthropicRequest(
  body: ClaudeProxyRequest,
  model: string,
): AnthropicRequest | { error: string } {
  // Resolve messages: rawMessages wins for multi-turn tool flow
  let messages: AnthropicMessage[];
  if (body.rawMessages && Array.isArray(body.rawMessages) && body.rawMessages.length > 0) {
    messages = body.rawMessages;
  } else if (Array.isArray(body.messages) && body.messages.length > 0) {
    messages = body.messages
      .filter((m) => typeof m?.text === "string" && m.text.trim().length > 0)
      .map((m): AnthropicMessage => ({
        role: m.role === "assistant" || m.role === "model" ? "assistant" : "user",
        content: String(m.text),
      }));
    if (messages.length === 0) {
      return { error: "No valid messages" };
    }
  } else {
    return { error: "messages or rawMessages must be a non-empty array" };
  }

  // Anthropic requires alternating user/assistant turns and first message must be user
  if (messages[0].role !== "user") {
    return { error: "First message must be from user" };
  }

  // Sensible default: 4096 output tokens (matches Gemini default).
  // Caller can override; we cap at model max (64k for Sonnet 4.6, 128k for Opus 4.7).
  const maxTokensCap = model === "claude-opus-4-7" ? 128_000 : 64_000;
  const maxTokens = Math.min(
    Math.max(1, body.maxTokens || 4096),
    maxTokensCap,
  );

  const req: AnthropicRequest = {
    model,
    max_tokens: maxTokens,
    messages,
    stream: true,
  };

  if (body.systemPrompt) {
    req.system = body.systemPrompt;
  }

  if (body.enableTools !== false) {
    // Default ON, mirroring geminiProxy behavior
    req.tools = getAnthropicToolDefinitions();
  }

  // Sampling params — forbidden on Opus 4.7. Anthropic also disallows
  // temperature AND top_p together on Sonnet 4.6 / Haiku 4.5 (returns 400).
  // We keep temperature; drop top_p (R138a-fix).
  if (!NO_SAMPLING_PARAMS_MODELS.has(model)) {
    req.temperature = 0.7;
  }

  return req;
}

// ────────────────────────────────────────────────────────────
// SSE normalizer — translate Anthropic events to our wire format
// ────────────────────────────────────────────────────────────
//
// Anthropic SSE event types we care about:
//   message_start          — message metadata (model, usage)
//   content_block_start    — begin a content block (text or tool_use)
//   content_block_delta    — incremental update (text_delta, input_json_delta)
//   content_block_stop     — end of block
//   message_delta          — top-level delta (stop_reason, usage)
//   message_stop           — terminal
//
// Each SSE message has shape:
//   event: <type>\n
//   data: <json>\n\n
//
// Tool-use blocks: input arrives as input_json_delta with `partial_json` strings
// that must be concatenated. Once content_block_stop arrives, we parse the
// concatenated JSON and emit a single normalized {toolUse} chunk.
interface PartialToolUse {
  id: string;
  name: string;
  jsonBuffer: string;
}

interface NormalizerState {
  // Active tool_use blocks indexed by content block index
  toolBlocks: Map<number, PartialToolUse>;
  // Track usage info from message_start and message_delta
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

function makeNormalizerState(): NormalizerState {
  return {
    toolBlocks: new Map(),
    inputTokens: 0,
    outputTokens: 0,
    stopReason: null,
  };
}

/**
 * Process one Anthropic SSE event.
 * Writes 0+ normalized chunks to res.
 * Mutates state.
 */
function handleAnthropicEvent(
  event: string,
  data: any,
  state: NormalizerState,
  res: any,
): void {
  switch (event) {
    case "message_start": {
      const usage = data?.message?.usage;
      if (usage) {
        state.inputTokens = usage.input_tokens || 0;
        // output_tokens is updated as stream progresses
      }
      break;
    }
    case "content_block_start": {
      const block = data?.content_block;
      const idx = data?.index;
      if (block?.type === "tool_use" && typeof idx === "number") {
        state.toolBlocks.set(idx, {
          id: block.id,
          name: block.name,
          jsonBuffer: "",
        });
      }
      break;
    }
    case "content_block_delta": {
      const delta = data?.delta;
      const idx = data?.index;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        // Stream text directly
        res.write(`data: ${JSON.stringify({ text: delta.text })}\n\n`);
      } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
        // Accumulate tool_use JSON
        const tb = state.toolBlocks.get(idx);
        if (tb) tb.jsonBuffer += delta.partial_json;
      }
      break;
    }
    case "content_block_stop": {
      const idx = data?.index;
      const tb = typeof idx === "number" ? state.toolBlocks.get(idx) : undefined;
      if (tb) {
        // Parse accumulated JSON and emit a single toolUse chunk
        let input: Record<string, unknown> = {};
        try {
          input = tb.jsonBuffer ? JSON.parse(tb.jsonBuffer) : {};
        } catch (e) {
          logger.warn("[claudeProxy] failed to parse tool_use input JSON", {
            toolName: tb.name,
            jsonBuffer: tb.jsonBuffer.slice(0, 200),
          });
        }
        res.write(
          `data: ${JSON.stringify({
            toolUse: { id: tb.id, name: tb.name, input },
          })}\n\n`,
        );
        state.toolBlocks.delete(idx);
      }
      break;
    }
    case "message_delta": {
      const usage = data?.usage;
      if (usage?.output_tokens) state.outputTokens = usage.output_tokens;
      const stop = data?.delta?.stop_reason;
      if (stop) state.stopReason = stop;
      break;
    }
    case "message_stop": {
      // Terminal — caller writes [DONE]
      break;
    }
    default: {
      // Ignore unknown events (forward compat)
      break;
    }
  }
}

// ────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────
export const claudeProxy = onRequest(
  {
    region: "asia-southeast1",
    secrets: [anthropicKey],
    timeoutSeconds: 540,    // higher than gemini (Sonnet/Opus can take longer)
    memory: "512MiB",
  },
  async (req, res) => {
    // ── 0. CORS (same allowlist as geminiProxy) ──
    const origin = req.headers.origin || "";
    const allowedOrigins = [
      "https://lab-manager-268a6.web.app",
      "https://lab-manager-268a6.firebaseapp.com",
      "http://localhost:5173",
      "http://localhost:3000",
    ];
    const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "3600");
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    // ── 1. Auth (admin || superadmin) ──
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

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // ── 2. Validate model ──
    const body = (req.body || {}) as ClaudeProxyRequest;
    const model = body.model || DEFAULT_MODEL;
    if (!ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: `Model not allowed: ${model}` });
      return;
    }

    // ── 3. Build Anthropic request ──
    const built = buildAnthropicRequest(body, model);
    if ("error" in built) {
      res.status(400).json({ error: built.error });
      return;
    }
    const anthropicReq = built;

    logger.info("[claudeProxy] request", {
      uid: auth.uid,
      model,
      messageCount: anthropicReq.messages.length,
      enableTools: body.enableTools !== false,
      maxTokens: anthropicReq.max_tokens,
    });

    // ── 4. Call Anthropic API with streaming ──
    const apiKey = anthropicKey.value();
    let upstream: Response;
    try {
      upstream = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(anthropicReq),
      });
    } catch (e) {
      logger.error("[claudeProxy] fetch failed", { uid: auth.uid, error: String(e) });
      res.status(502).json({ error: "Failed to reach Anthropic API" });
      return;
    }

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => "");
      logger.error("[claudeProxy] Anthropic API error", {
        uid: auth.uid,
        status: upstream.status,
        body: errBody.slice(0, 500),
      });
      res.status(upstream.status).json({
        error: `Anthropic API returned ${upstream.status}`,
        details: errBody.slice(0, 200),
      });
      return;
    }

    if (!upstream.body) {
      res.status(502).json({ error: "No response body from Anthropic" });
      return;
    }

    // ── 5. Stream SSE response back to client ──
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const state = makeNormalizerState();
    let buffer = "";
    let currentEvent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Anthropic SSE chunks separated by blank lines (\n\n).
        // Each chunk has lines: "event: <name>" then "data: <json>".
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";  // last (possibly incomplete) goes back to buffer

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let eventName = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventName = line.substring(7).trim();
            } else if (line.startsWith("data: ")) {
              // data may span multi-line per SSE spec, but Anthropic uses single-line
              dataStr += line.substring(6);
            }
          }
          if (!eventName) eventName = currentEvent;
          currentEvent = eventName;
          if (!dataStr) continue;

          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          handleAnthropicEvent(eventName, data, state, res);
        }
      }

      // Flush any leftover partial data (rare but defensive)
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        let eventName = currentEvent;
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) eventName = line.substring(7).trim();
          else if (line.startsWith("data: ")) dataStr += line.substring(6);
        }
        if (eventName && dataStr) {
          try {
            handleAnthropicEvent(eventName, JSON.parse(dataStr), state, res);
          } catch { /* swallow */ }
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();

      logger.info("[claudeProxy] stream completed", {
        uid: auth.uid,
        model,
        messageCount: anthropicReq.messages.length,
        inputTokens: state.inputTokens,
        outputTokens: state.outputTokens,
        stopReason: state.stopReason,
      });
    } catch (e) {
      logger.error("[claudeProxy] stream error", { uid: auth.uid, error: String(e) });
      try {
        res.write(`data: ${JSON.stringify({ error: String(e) })}\n\n`);
        res.end();
      } catch { /* already closed */ }
    }
  },
);
