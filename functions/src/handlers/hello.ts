/**
 * Hello-world function — used to verify Cloud Functions deployment pipeline.
 *
 * Round 106b: Skeleton only. Round 106c will deploy and verify.
 *
 * Endpoint: GET https://[region]-lab-manager-268a6.cloudfunctions.net/hello
 *
 * @see /AI_ARCHITECTURE.md
 */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "../utils/logger";

export const hello = onRequest(
  {
    region: "asia-southeast1",
    cors: true,
    maxInstances: 10,
  },
  (req, res) => {
    logger.info("Hello function invoked", {
      method: req.method,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.status(200).json({
      message: "Hello from LabBook BKU Cloud Functions!",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      round: "106b",
    });
  }
);
