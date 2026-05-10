#!/usr/bin/env node
/**
 * R150c — Firestore rules test (emulator).
 *
 * Prereq:
 *   1. Install: npm i -D @firebase/rules-unit-testing
 *      (run from repo root)
 *   2. Start emulator: firebase emulators:start --only firestore
 *   3. Run: node scripts/test-firestore-rules-r150c.mjs
 *
 * Tests:
 *   - aiChunks read still works for any authenticated user
 *   - materials read denied without tenantId claim
 *   - materials read allowed with matching tenantId
 *   - materials read denied for cross-tenant access
 *   - materials create requires admin role + matching tenant
 *   - materials delete always denied
 *   - materials update preserves immutable fields
 */

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(__dirname, "..", "firestore.rules"), "utf8");

const PROJECT_ID = "lab-manager-268a6-test";

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: RULES, host: "127.0.0.1", port: 8080 },
});

// Helpers
function authedAs(uid, claims = {}) {
  return env.authenticatedContext(uid, claims).firestore();
}
function unauthed() {
  return env.unauthenticatedContext().firestore();
}

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass += 1;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    fail += 1;
  }
}

// Seed test data via admin (bypass rules)
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await db.doc("aiChunks/chunk1").set({ text: "hello" });
  await db.doc("materials/mat-default-MoS2").set({
    formula: "MoS2",
    name: "Molybdenum disulfide",
    category: "TMD",
    tenantId: "default",
    createdBy: "uid-seed",
    createdAt: 0,
    updatedAt: 0,
    updatedBy: "uid-seed",
  });
  await db.doc("materials/mat-other-WS2").set({
    formula: "WS2",
    name: "Tungsten disulfide",
    category: "TMD",
    tenantId: "tenant-other",
    createdBy: "uid-seed",
    createdAt: 0,
    updatedAt: 0,
    updatedBy: "uid-seed",
  });
});

console.log("[R150c] Running rules tests...\n");

// ── aiChunks ──
await test("aiChunks: read allowed for any authed user", async () => {
  const db = authedAs("uid-anyone");
  await assertSucceeds(db.doc("aiChunks/chunk1").get());
});

await test("aiChunks: read denied for unauthed", async () => {
  await assertFails(unauthed().doc("aiChunks/chunk1").get());
});

await test("aiChunks: write always denied", async () => {
  const db = authedAs("uid-superadmin", { role: "superadmin", tenantId: "default" });
  await assertFails(db.doc("aiChunks/chunk2").set({ text: "x" }));
});

// ── materials read ──
await test("materials: read denied without tenantId claim", async () => {
  const db = authedAs("uid-no-tenant");
  await assertFails(db.doc("materials/mat-default-MoS2").get());
});

await test("materials: read allowed with matching tenantId", async () => {
  const db = authedAs("uid-member", { tenantId: "default" });
  await assertSucceeds(db.doc("materials/mat-default-MoS2").get());
});

await test("materials: read denied cross-tenant", async () => {
  const db = authedAs("uid-other", { tenantId: "tenant-other" });
  await assertFails(db.doc("materials/mat-default-MoS2").get());
});

// ── materials create ──
await test("materials: create denied for non-admin", async () => {
  const db = authedAs("uid-member", { tenantId: "default", role: "member" });
  await assertFails(
    db.doc("materials/mat-new").set({
      formula: "WO3",
      name: "Tungsten trioxide",
      category: "oxide",
      tenantId: "default",
      createdBy: "uid-member",
      createdAt: 1,
      updatedAt: 1,
      updatedBy: "uid-member",
    }),
  );
});

await test("materials: create allowed for admin with matching tenant", async () => {
  const db = authedAs("uid-admin", { tenantId: "default", role: "admin" });
  await assertSucceeds(
    db.doc("materials/mat-WO3").set({
      formula: "WO3",
      name: "Tungsten trioxide",
      category: "oxide",
      tenantId: "default",
      createdBy: "uid-admin",
      createdAt: 1,
      updatedAt: 1,
      updatedBy: "uid-admin",
    }),
  );
});

await test("materials: create denied if createdBy != auth.uid", async () => {
  const db = authedAs("uid-admin", { tenantId: "default", role: "admin" });
  await assertFails(
    db.doc("materials/mat-imposter").set({
      formula: "X",
      name: "X",
      category: "other",
      tenantId: "default",
      createdBy: "uid-someone-else",
      createdAt: 1,
      updatedAt: 1,
      updatedBy: "uid-admin",
    }),
  );
});

// ── materials update ──
await test("materials: update preserves immutable formula", async () => {
  const db = authedAs("uid-admin", { tenantId: "default", role: "admin" });
  await assertFails(
    db.doc("materials/mat-default-MoS2").update({
      formula: "DIFFERENT",
      updatedAt: 999,
      updatedBy: "uid-admin",
    }),
  );
});

// ── materials delete ──
await test("materials: delete always denied (even superadmin)", async () => {
  const db = authedAs("uid-super", { tenantId: "default", role: "superadmin" });
  await assertFails(db.doc("materials/mat-default-MoS2").delete());
});

console.log(`\n[R150c] Result: ${pass} pass / ${fail} fail`);
await env.cleanup();
process.exit(fail > 0 ? 1 : 0);
