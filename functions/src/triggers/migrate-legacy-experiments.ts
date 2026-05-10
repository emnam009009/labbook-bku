/**
 * R152d-1 — Bulk migration: legacy RTDB → Firestore experiments.
 *
 * Reads hydro/, electrode/, electrochem/ from RTDB and writes synthesized
 * Experiment docs to Firestore "labbook" DB experiments/ collection.
 *
 * Adapter pattern (spec §6.1): legacyRef immutable for audit trail.
 * Idempotent: skips entries already migrated (queries Firestore by
 * legacyRef.collection + legacyRef.id).
 * Backup-first: dumps legacy JSON to migrationBackups/{timestamp} subcollection
 * BEFORE any writes (recovery point if migration corrupts data).
 *
 * Auth: requires role=superadmin custom claim.
 * Tenant: writes to tenantId="default" (lab BKU).
 *
 * Test invocation (after deploy):
 *   curl -X POST https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/migrateLegacyExperiments \
 *        -H "Authorization: Bearer ${ID_TOKEN}" \
 *        -H "Content-Type: application/json" \
 *        -d '{"mode":"dry-run","legacyCollection":"hydro"}'
 *
 * Or use Firebase Console > Functions > migrateLegacyExperiments > Test
 *
 * Out of scope (R152d-2): UI invocation, progress streaming.
 */
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "../utils/logger";

// Lazy-init Firestore named DB "labbook" — same DB used by R150c+ rules
const FIRESTORE_DB_ID = "labbook";
const TENANT_ID = "default";
const FIRESTORE_BATCH_LIMIT = 500; // Firestore max batch ops

type LegacyCollection = "hydro" | "electrode" | "electrochem";
const LEGACY_COLLECTIONS: LegacyCollection[] = ["hydro", "electrode", "electrochem"];

const TYPE_MAP: Record<LegacyCollection, string> = {
  hydro: "hydrothermal",
  electrode: "electrode-prep",
  electrochem: "electrochemistry",
};

interface MigrationRequest {
  mode: "dry-run" | "confirm";
  legacyCollection: LegacyCollection | "all";
  batchLimit?: number;
}

interface PerCollectionResult {
  collection: LegacyCollection;
  totalRead: number;
  alreadyMigrated: number;
  willMigrate: number;
  migrated: number;
  errors: number;
  errorSamples: string[];
}

interface MigrationResponse {
  mode: "dry-run" | "confirm";
  legacyCollectionRequested: string;
  totals: {
    totalRead: number;
    alreadyMigrated: number;
    willMigrate: number;
    migrated: number;
    errors: number;
  };
  perCollection: PerCollectionResult[];
  backupId?: string;
  durationMs: number;
}

/**
 * Synthesize Experiment shape from legacy RTDB entry.
 * Mirror of adaptLegacyExperiment in src/ts/services/experiments.ts but
 * adapted for server-side (admin SDK) usage.
 */
function adaptLegacyEntry(
  legacyCol: LegacyCollection,
  legacyId: string,
  data: any,
): Record<string, any> {
  const docId = `exp-legacy-${legacyCol}-${legacyId}`;
  return {
    code: data.code || legacyId,
    type: TYPE_MAP[legacyCol],
    inputSamples: [],
    outputSamples: [],
    conditions: {},
    operatorId: data.uid || data.person || "",
    performedAt: data.date || data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    status: data.locked ? "completed" : (data.status || "completed"),
    legacyRef: { collection: legacyCol, id: legacyId },
    notes: data.note || data.notes || "",
    tags: [],
    tenantId: TENANT_ID,
    createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    createdBy: data.uid || data.person || "system-migration",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: "system-migration",
    _docId: docId, // private, stripped before write
  };
}

export const migrateLegacyExperiments = onRequest(
  {
    region: "asia-southeast1",
    timeoutSeconds: 540,  // Gen2 max for HTTP
    memory: "512MiB",
    cors: true,
  },
  async (req, res): Promise<void> => {
    const startMs = Date.now();

    // ── Auth ──
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!idToken) {
      res.status(401).json({ error: "Missing Authorization Bearer token" });
      return;
    }

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err: any) {
      logger.warn("[migrateLegacyExperiments] auth failed:", err?.message);
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    if (decoded.role !== "superadmin") {
      logger.warn(`[migrateLegacyExperiments] forbidden uid=${decoded.uid} role=${decoded.role}`);
      res.status(403).json({ error: "Requires role=superadmin claim" });
      return;
    }

    // ── Parse request ──
    const body: MigrationRequest = req.body || {};
    const mode = body.mode === "confirm" ? "confirm" : "dry-run";
    const requested = body.legacyCollection || "all";
    const batchLimit = Math.min(
      Math.max(50, body.batchLimit || FIRESTORE_BATCH_LIMIT),
      FIRESTORE_BATCH_LIMIT,
    );

    const collectionsToProcess: LegacyCollection[] =
      requested === "all" ? LEGACY_COLLECTIONS : [requested as LegacyCollection];

    if (!collectionsToProcess.every((c) => LEGACY_COLLECTIONS.includes(c))) {
      res.status(400).json({ error: `Invalid legacyCollection: ${requested}` });
      return;
    }

    logger.info(
      `[migrateLegacyExperiments] start mode=${mode} collections=${collectionsToProcess.join(",")} ` +
        `uid=${decoded.uid}`,
    );

    // ── Get Firestore named DB handle ──
    // firebase-admin v12+ exports getFirestore(app, databaseId) for
    // accessing named (non-default) databases.
    const db = getFirestore(admin.app(), FIRESTORE_DB_ID);

    const rtdb = admin.database();

    const perCollection: PerCollectionResult[] = [];
    const totals = {
      totalRead: 0,
      alreadyMigrated: 0,
      willMigrate: 0,
      migrated: 0,
      errors: 0,
    };

    // ── Backup phase: dump legacy data to migrationBackups/{ts} ──
    // Each collection serialized as JSON string to avoid Firestore field
    // name restrictions (dots, undefined, deeply nested arrays) that
    // RTDB allows but Firestore rejects.
    let backupId: string | undefined;
    if (mode === "confirm") {
      backupId = `R152d-${Date.now()}`;
      const backupRef = db.collection("migrationBackups").doc(backupId);
      const backupData: Record<string, any> = {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: decoded.uid,
        round: "R152d-1",
        collectionsRequested: collectionsToProcess,
      };
      try {
        for (const col of collectionsToProcess) {
          const snap = await rtdb.ref(col).once("value");
          const raw = snap.val() || {};
          backupData[`${col}_json`] = JSON.stringify(raw);
          backupData[`${col}_count`] = Object.keys(raw).length;
        }
        await backupRef.set(backupData);
        logger.info(`[migrateLegacyExperiments] backup written: migrationBackups/${backupId}`);
      } catch (err: any) {
        logger.error(`[migrateLegacyExperiments] backup write failed:`, err?.message || err);
        res.status(500).json({
          error: "Backup write failed; aborted before any migration writes",
          details: err?.message || String(err),
        });
        return;
      }
    }

    // ── Process each collection ──
    for (const col of collectionsToProcess) {
      const result: PerCollectionResult = {
        collection: col,
        totalRead: 0,
        alreadyMigrated: 0,
        willMigrate: 0,
        migrated: 0,
        errors: 0,
        errorSamples: [],
      };

      try {
        const snap = await rtdb.ref(col).once("value");
        const data = snap.val() || {};
        const legacyEntries = Object.entries<any>(data);
        result.totalRead = legacyEntries.length;
        totals.totalRead += result.totalRead;

        // Find already-migrated docs. Catch NOT_FOUND for empty collection
        // (Firestore throws when collection has no docs yet).
        const existingLegacyIds = new Set<string>();
        try {
          const existingSnap = await db.collection("experiments")
            .where("tenantId", "==", TENANT_ID)
            .get();
          existingSnap.docs.forEach((d) => {
            const data = d.data();
            const legacyRef = data?.legacyRef;
            if (legacyRef?.collection === col && legacyRef?.id) {
              existingLegacyIds.add(legacyRef.id);
            }
          });
        } catch (err: any) {
          const msg = String(err?.message || err);
          if (msg.includes("NOT_FOUND") || msg.includes("5 NOT_FOUND")) {
            logger.info(`[migrateLegacyExperiments] ${col}: experiments collection empty or not yet created — treating as 0 existing migrations`);
          } else {
            throw err;
          }
        }

        const toMigrate = legacyEntries.filter(([legacyId]) => {
          if (existingLegacyIds.has(legacyId)) {
            result.alreadyMigrated += 1;
            totals.alreadyMigrated += 1;
            return false;
          }
          return true;
        });

        result.willMigrate = toMigrate.length;
        totals.willMigrate += toMigrate.length;

        if (mode === "dry-run") {
          logger.info(
            `[migrateLegacyExperiments] ${col}: read=${result.totalRead} ` +
              `alreadyMigrated=${result.alreadyMigrated} willMigrate=${result.willMigrate}`,
          );
          perCollection.push(result);
          continue;
        }

        // ── Batched writes (500 ops/batch) ──
        for (let i = 0; i < toMigrate.length; i += batchLimit) {
          const chunk = toMigrate.slice(i, i + batchLimit);
          const batch = db.batch();
          for (const [legacyId, legacyData] of chunk) {
            try {
              const adapted = adaptLegacyEntry(col, legacyId, legacyData);
              const docId = adapted._docId as string;
              delete adapted._docId;
              const ref = db.collection("experiments").doc(docId);
              batch.set(ref, adapted);
            } catch (err: any) {
              result.errors += 1;
              totals.errors += 1;
              if (result.errorSamples.length < 5) {
                result.errorSamples.push(`${legacyId}: ${err?.message || err}`);
              }
            }
          }
          try {
            await batch.commit();
            result.migrated += chunk.length - (chunk.length - (chunk.length - result.errors));
            // Simpler: count successful writes = chunk.length - errors-this-batch
            result.migrated = result.willMigrate - result.errors;
          } catch (err: any) {
            result.errors += chunk.length;
            totals.errors += chunk.length;
            if (result.errorSamples.length < 5) {
              result.errorSamples.push(`batch commit failed: ${err?.message || err}`);
            }
          }
        }
        totals.migrated += result.migrated;

        logger.info(
          `[migrateLegacyExperiments] ${col}: migrated=${result.migrated}/${result.willMigrate} ` +
            `errors=${result.errors}`,
        );
      } catch (err: any) {
        logger.error(`[migrateLegacyExperiments] ${col} failed:`, err);
        result.errors += 1;
        totals.errors += 1;
        if (result.errorSamples.length < 5) {
          result.errorSamples.push(`collection-level error: ${err?.message || err}`);
        }
      }

      perCollection.push(result);
    }

    const response: MigrationResponse = {
      mode,
      legacyCollectionRequested: requested,
      totals,
      perCollection,
      backupId,
      durationMs: Date.now() - startMs,
    };
    logger.info(`[migrateLegacyExperiments] done in ${response.durationMs}ms`, response.totals);
    res.status(200).json(response);
  },
);
