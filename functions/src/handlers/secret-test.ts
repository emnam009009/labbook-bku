/**
 * Secret Test function — verify pipeline secrets work end-to-end.
 *
 * Reads all 4 AI provider secrets and returns MASKED versions to confirm
 * they're loaded correctly. NEVER logs or returns full secret values.
 *
 * Requires Firebase Auth + superadmin role.
 *
 * Endpoint: GET https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/secretTest
 *
 * Usage:
 *   curl -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
 *     https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/secretTest
 *
 * @see /AI_ARCHITECTURE.md Section 15 (Security & Privacy)
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";

// Declare secret dependencies (deploy-time)
const anthropicKey = defineSecret("ANTHROPIC_API_KEY");
const geminiKey = defineSecret("GEMINI_API_KEY");
const voyageKey = defineSecret("VOYAGE_API_KEY");
const chandraKey = defineSecret("CHANDRA_API_KEY");

/**
 * Mask a secret to show only first 8 chars + length info.
 * Example: "sk-ant-api03-XXXXX..." → "sk-ant-a... (108 chars)"
 */
function mask(value: string | undefined): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "(too short)";
  return `${value.substring(0, 8)}... (${value.length} chars)`;
}

export const secretTest = onRequest(
  {
    region: "asia-southeast1",
    cors: true,
    maxInstances: 5,
    secrets: [anthropicKey, geminiKey, voyageKey, chandraKey],
  },
  async (req, res) => {
    try {
      // Verify auth + role
      const auth = await verifyAuth(req, "superadmin");

      logger.info("Secret test invoked", {
        uid: auth.uid,
        email: auth.email,
      });

      // Access secrets at runtime
      const anthropicValue = anthropicKey.value();
      const geminiValue = geminiKey.value();
      const voyageValue = voyageKey.value();
      const chandraValue = chandraKey.value();

      // Return masked values
      res.status(200).json({
        message: "All secrets loaded successfully",
        timestamp: new Date().toISOString(),
        user: { uid: auth.uid, email: auth.email, role: auth.role },
        secrets: {
          ANTHROPIC_API_KEY: mask(anthropicValue),
          GEMINI_API_KEY: mask(geminiValue),
          VOYAGE_API_KEY: mask(voyageValue),
          CHANDRA_API_KEY: mask(chandraValue),
        },
        runtime: {
          node: process.version,
          region: "asia-southeast1",
        },
      });
    } catch (e) {
      if (e instanceof AuthError) {
        logger.warn("Auth failed for secretTest", {
          status: e.statusCode,
          message: e.message,
        });
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      logger.error("Unexpected error in secretTest", e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
