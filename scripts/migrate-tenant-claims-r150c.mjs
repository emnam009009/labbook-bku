#!/usr/bin/env node
/**
 * R150c — Bulk migration: set tenantId="default" custom claim
 * for ALL existing Firebase Auth users.
 *
 * Usage:
 *   node scripts/migrate-tenant-claims-r150c.mjs --dry-run   # preview
 *   node scripts/migrate-tenant-claims-r150c.mjs --confirm   # execute
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env pointing to service
 * account key JSON, OR run with `firebase login` + `firebase use`.
 *
 * Idempotent: re-running is safe; users already with tenantId="default"
 * are skipped. Users with different tenantId (future commercial) are
 * also skipped — manual intervention required.
 *
 * Rollback: clear claim by setting tenantId to null.
 */

import admin from "firebase-admin";

const TARGET_TENANT = "default";
const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM = process.argv.includes("--confirm");

if (!DRY_RUN && !CONFIRM) {
  console.error("ERROR: must pass --dry-run or --confirm");
  process.exit(1);
}

// Init admin SDK. Uses GOOGLE_APPLICATION_CREDENTIALS or default.
admin.initializeApp();

async function migrate() {
  const auth = admin.auth();
  let pageToken = undefined;
  let totalUsers = 0;
  let alreadySet = 0;
  let willSet = 0;
  let conflicts = 0;
  let errors = 0;

  console.log(`[R150c] Mode: ${DRY_RUN ? "DRY-RUN" : "CONFIRM"}`);
  console.log(`[R150c] Target tenantId: "${TARGET_TENANT}"`);
  console.log(`[R150c] Starting migration...\n`);

  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const user of result.users) {
      totalUsers += 1;
      const currentTenant = user.customClaims?.tenantId;

      if (currentTenant === TARGET_TENANT) {
        alreadySet += 1;
        continue;
      }

      if (currentTenant !== undefined && currentTenant !== TARGET_TENANT) {
        conflicts += 1;
        console.warn(
          `  [conflict] uid=${user.uid} email=${user.email} ` +
            `currentTenant="${currentTenant}" — SKIP, manual review needed`,
        );
        continue;
      }

      willSet += 1;
      if (DRY_RUN) {
        console.log(`  [will-set] uid=${user.uid} email=${user.email}`);
      } else {
        try {
          await auth.setCustomUserClaims(user.uid, {
            ...user.customClaims,
            tenantId: TARGET_TENANT,
          });
          console.log(`  [set] uid=${user.uid} email=${user.email}`);
        } catch (err) {
          errors += 1;
          console.error(`  [error] uid=${user.uid}: ${err.message}`);
        }
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`\n[R150c] Summary:`);
  console.log(`  Total users:      ${totalUsers}`);
  console.log(`  Already correct:  ${alreadySet}`);
  console.log(`  Will set / set:   ${willSet}`);
  console.log(`  Conflicts:        ${conflicts}`);
  console.log(`  Errors:           ${errors}`);

  if (DRY_RUN) {
    console.log(`\n[R150c] Dry-run only. To execute, re-run with --confirm.`);
  } else {
    console.log(
      `\n[R150c] Done. Users must SIGN OUT and SIGN BACK IN ` +
        `for new claims to take effect in their tokens.`,
    );
  }
}

migrate().catch((err) => {
  console.error("[R150c] FATAL:", err);
  process.exit(1);
});
