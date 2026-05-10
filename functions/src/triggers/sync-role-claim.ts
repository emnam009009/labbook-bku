/**
 * R150c-followup — Auto-sync role claim from RTDB users/{uid}/role.
 *
 * RTDB v2 onValueWritten trigger. Gen2, runs on Node 24, no GCIP needed.
 *
 * Whenever an admin updates a user's role in RTDB users/{uid}/role,
 * this trigger updates the corresponding Firebase Auth custom claim.
 * User must sign out + back in for the new claim to appear in their
 * token, but the underlying claim is updated immediately.
 *
 * Preserves tenantId claim (set by R150c migration + future GCIP trigger).
 *
 * Use case for commercial: admin promotes user → role claim auto-syncs
 * → next token refresh has new role → rules apply correctly.
 */
import * as admin from "firebase-admin";
import { onValueWritten } from "firebase-functions/v2/database";
import { logger } from "../utils/logger";

export const syncRoleClaim = onValueWritten(
  {
    ref: "/users/{uid}/role",
    region: "asia-southeast1",
    instance: "lab-manager-268a6-default-rtdb",
  },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data.after.val();
    const before = event.data.before.val();

    // Skip if no actual change
    if (before === after) {
      logger.debug(`[syncRoleClaim] uid=${uid} no change, skip`);
      return;
    }

    try {
      // Get current claims to preserve tenantId
      const user = await admin.auth().getUser(uid);
      const currentClaims = user.customClaims || {};

      const newClaims: Record<string, any> = { ...currentClaims };
      if (after) {
        newClaims.role = after;
      } else {
        // Role deleted in RTDB → remove from claim
        delete newClaims.role;
      }

      await admin.auth().setCustomUserClaims(uid, newClaims);
      logger.info(
        `[syncRoleClaim] uid=${uid} role: "${before || "(none)"}" → "${after || "(deleted)"}"`,
      );
    } catch (err) {
      logger.error(`[syncRoleClaim] uid=${uid} failed:`, err);
      // Don't rethrow — trigger fail shouldn't block RTDB write
    }
  },
);
