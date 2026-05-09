/**
 * Tool Executor — Cloud Function dispatch tools cho AI.
 *
 * Flow:
 *   Frontend (Firebase Auth Bearer token)
 *     → toolExecutor verify auth + role (admin || superadmin)
 *         → executeTool(name, args) — dispatch to handler in tools/registry.ts
 *             → return { ok, result } | { ok: false, error }
 *
 * Endpoint: POST https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/toolExecutor
 *
 * Request body:
 *   {
 *     "name": "searchChemicals",
 *     "args": { "query": "Na2WO4", "low_stock_only": false }
 *   }
 *
 * Response:
 *   { "ok": true, "result": { total, chemicals: [...] } }
 *   { "ok": false, "error": "Tool not found: ..." }
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";
import { executeTool, TOOL_NAMES, ACTION_TOOL_NAMES } from "../tools/registry";

// R138b1: searchPapers tool needs Voyage embeddings + rerank — declare secret
// so it is available via process.env.VOYAGE_API_KEY inside the tool.
const voyageKey = defineSecret("VOYAGE_API_KEY");

export const toolExecutor = onRequest(
  {
    region: "asia-southeast1",
    secrets: [voyageKey],
    timeoutSeconds: 60,
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

    // ── 1. Pre-check: action tools need superadmin ──
    const earlyName = (req.body || {}).name as string | undefined;
    const isActionTool =
      typeof earlyName === "string" && ACTION_TOOL_NAMES.includes(earlyName);

    let auth;
    try {
      if (isActionTool) {
        // Round 115a: Action tools require superadmin
        auth = await verifyAuth(req, "superadmin");
      } else {
        // Read tools: admin OR superadmin
        auth =
          (await verifyAuth(req, "admin").catch(() => null)) ??
          (await verifyAuth(req, "superadmin"));
      }
    } catch (e) {
      const error = e as AuthError;
      res.status(error.statusCode || 500).json({
        ok: false,
        error: error.message,
      });
      return;
    }

    // ── 2. Validate request ──
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const body = req.body || {};
    const name = body.name;
    const args = body.args || {};

    if (!name || typeof name !== "string") {
      res
        .status(400)
        .json({ ok: false, error: "Missing or invalid 'name' field" });
      return;
    }

    if (!TOOL_NAMES.includes(name)) {
      res.status(400).json({
        ok: false,
        error: `Unknown tool: ${name}. Available: ${TOOL_NAMES.join(", ")}`,
      });
      return;
    }

    // ── 3. Execute tool ──
    const startTime = Date.now();
    const result = await executeTool(name, args, { uid: auth.uid });
    const duration = Date.now() - startTime;

    logger.info("Tool executed", {
      uid: auth.uid,
      tool: name,
      ok: result.ok,
      duration_ms: duration,
    });

    res.status(200).json(result);
  }
);
