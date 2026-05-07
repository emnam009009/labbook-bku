/**
 * Python Bridge — proxies authenticated requests to Python compute service.
 *
 * Flow:
 *   Frontend (Firebase Auth)
 *     → Cloud Function pythonBridge (verify auth + role)
 *         → Python service on Cloud Run (X-Service-Auth header)
 *             → Pymatgen / lmfit / impedance.py / ASE compute
 *
 * Endpoint: POST https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/pythonBridge
 *
 * Request body:
 *   {
 *     "endpoint": "/health" | "/xrd/analyze" | "/raman/deconvolve" | ...,
 *     "method": "GET" | "POST" (default POST),
 *     "payload": {...}  // forwarded to Python as JSON body
 *   }
 *
 * @see /AI_ARCHITECTURE.md Section 3 (Hybrid TS + Python)
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";

// Secret (shared with Python service)
const pythonServiceApiKey = defineSecret("PYTHON_SERVICE_API_KEY");

// Param (URL of Python service — set at deploy time, not secret)
const pythonServiceUrl = defineString("PYTHON_SERVICE_URL", {
  default: "https://placeholder.run.app",
  description: "Cloud Run URL of Python compute service",
});

// Whitelist of allowed Python service endpoints
// Prevents arbitrary URL forwarding (security)
const ALLOWED_ENDPOINTS = new Set([
  "/health",
  "/verify-auth",
  // Future endpoints (Round 131+):
  "/xrd/analyze",
  "/raman/deconvolve",
  "/uvvis/tauc-advanced",
  "/pl/multi-gauss",
  "/ftir/peaks",
  "/eis/fit-nyquist",
  "/ms/flat-band",
  "/ipce/calc",
  "/xps/peak-fit",
  "/eds/quant",
  "/bet/bjh",
  "/tga/steps",
  "/dft/qe-input",
  "/dft/parse-output",
  "/jcpds/match",
  "/cif/visualize",
  "/embed/matscibert",
]);

interface BridgeRequest {
  endpoint?: string;
  method?: "GET" | "POST";
  payload?: unknown;
}

export const pythonBridge = onRequest(
  {
    region: "asia-southeast1",
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [pythonServiceApiKey],
  },
  async (req, res) => {
    try {
      // 1. Verify Firebase Auth + superadmin role
      const auth = await verifyAuth(req, "superadmin");

      // 2. Validate request body
      const body = req.body as BridgeRequest;
      const endpoint = body?.endpoint;
      const method = body?.method ?? "POST";
      const payload = body?.payload;

      if (!endpoint || typeof endpoint !== "string") {
        res.status(400).json({ error: "Missing 'endpoint' in request body" });
        return;
      }

      if (!ALLOWED_ENDPOINTS.has(endpoint)) {
        logger.warn("Endpoint not in whitelist", {
          endpoint,
          uid: auth.uid,
        });
        res.status(403).json({ error: `Endpoint not allowed: ${endpoint}` });
        return;
      }

      // 3. Build URL to Python service
      const baseUrl = pythonServiceUrl.value();
      const targetUrl = new URL(endpoint, baseUrl).toString();

      logger.info("Forwarding to Python service", {
        uid: auth.uid,
        endpoint,
        method,
        targetUrl,
      });

      // 4. Forward request with service auth
      const startTime = Date.now();
      const response = await fetch(targetUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Service-Auth": pythonServiceApiKey.value(),
          "X-Forwarded-User": auth.uid, // For Python-side audit logging
        },
        body: method === "POST" && payload !== undefined
          ? JSON.stringify(payload)
          : undefined,
      });
      const duration = Date.now() - startTime;

      // 5. Forward response back to caller
      const responseText = await response.text();
      let responseData: unknown;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      logger.info("Python service response", {
        uid: auth.uid,
        endpoint,
        status: response.status,
        durationMs: duration,
      });

      res.status(response.status).json({
        endpoint,
        durationMs: duration,
        data: responseData,
      });
    } catch (e) {
      if (e instanceof AuthError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      logger.error("Python bridge error", e);
      res.status(500).json({
        error: "Internal server error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
);
