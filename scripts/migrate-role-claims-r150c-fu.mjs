#!/usr/bin/env node
/**
 * R150c-followup — Migrate role custom claim from RTDB users/{uid}/role.
 *
 * Reads role from RTDB users/{uid}, sets as claim alongside existing
 * tenantId. Preserves tenantId set by R150c earlier.
 *
 * Idempotent: re-running OK. If claim already matches RTDB role, skip.
 *
 * Usage:
 *   node scripts/migrate-role-claims-r150c-fu.mjs --dry-run
 *   node scripts/migrate-role-claims-r150c-fu.mjs --confirm
 */

import admin from "firebase-admin";

const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM = process.argv.includes("--confirm");

if (!DRY_RUN && !CONFIRM) {
  console.error("ERROR: must pass --dry-run or --confirm");
  process.exit(1);
}

admin.initializeApp({
  databaseURL: "https://lab-manager-268a6-default-rtdb.asia-southeast1.firebasedatabase.app",
});

async function migrate() {
  const auth = admin.auth();
  const db = admin.database();

  // Read all users from RTDB users/
  const usersSnap = await db.ref("users").once("value");
  const usersMap = usersSnap.val() || {};

  console.log(`[R150c-fu] Mode: ${DRY_RUN ? "DRY-RUN" : "CONFIRM"}`);
  console.log(`[R150c-fu] Found ${Object.keys(usersMap).length} users in RTDB.\n`);

  let totalAuth = 0;
  let updated = 0;
  let alreadyOk = 0;
  let noRoleInRtdb = 0;
  let errors = 0;
  let pageToken = undefined;

  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      totalAuth += 1;
      const rtdbUser = usersMap[user.uid];
      const rtdbRole = rtdbUser?.role;

      if (!rtdbRole) {
        noRoleInRtdb += 1;
        console.warn(`  [no-rtdb-role] uid=${user.uid} email=${user.email} — SKIP`);
        continue;
      }

      const currentClaims = user.customClaims || {};
      const currentRole = currentClaims.role;

      if (currentRole === rtdbRole) {
        alreadyOk += 1;
        continue;
      }

      if (DRY_RUN) {
        updated += 1;
        console.log(
          `  [will-update] uid=${user.uid} email=${user.email} ` +
            `role: "${currentRole || "(none)"}" → "${rtdbRole}"`,
        );
      } else {
        try {
          await auth.setCustomUserClaims(user.uid, {
            ...currentClaims, // preserve tenantId from R150c
            role: rtdbRole,
          });
          updated += 1;
          console.log(
            `  [updated] uid=${user.uid} email=${user.email} ` +
              `role="${rtdbRole}"`,
          );
        } catch (err) {
          errors += 1;
          console.error(`  [error] uid=${user.uid}: ${err.message}`);
        }
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`\n[R150c-fu] Summary:`);
  console.log(`  Total Auth users:       ${totalAuth}`);
  console.log(`  Already correct:        ${alreadyOk}`);
  console.log(`  Updated / will-update:  ${updated}`);
  console.log(`  No role in RTDB:        ${noRoleInRtdb}`);
  console.log(`  Errors:                 ${errors}`);

  if (DRY_RUN) {
    console.log(`\n[R150c-fu] Dry-run only. To execute: --confirm`);
  } else {
    console.log(
      `\n[R150c-fu] Done. Users must SIGN OUT and SIGN BACK IN ` +
        `for new role claim to take effect in their tokens.`,
    );
  }

  await admin.app().delete();
}

migrate().catch((err) => {
  console.error("[R150c-fu] FATAL:", err);
  process.exit(1);
});
