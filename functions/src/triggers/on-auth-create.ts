/**
 * R150c — Auto-set tenantId claim on user creation
 *
 * Uses Firebase Functions v1 auth trigger because v2
 * `firebase-functions/v2/identity` only exposes blocking
 * `beforeUserCreated`, not a non-blocking onCreate equivalent.
 * v1 + v2 in same codebase is supported pattern.
 *
 * For commercial fork (Phase E): replace "default" with actual tenant
 * resolution (subdomain → tenantId, or invite code lookup).
 */
import * as admin from "firebase-admin";
import * as functionsV1 from "firebase-functions/v1";
import { logger } from "../utils/logger";

const DEFAULT_TENANT = "default";

export const setTenantOnCreate = functionsV1
  .region("asia-southeast1")
  .auth.user()
  .onCreate(async (user) => {
    try {
      await admin.auth().setCustomUserClaims(user.uid, {
        tenantId: DEFAULT_TENANT,
      });
      logger.info(
        `[setTenantOnCreate] uid=${user.uid} email=${user.email} ` +
          `tenantId="${DEFAULT_TENANT}"`,
      );
    } catch (err) {
      logger.error(`[setTenantOnCreate] uid=${user.uid} failed:`, err);
      // Do NOT throw — trigger should not block user creation flow
    }
  });
