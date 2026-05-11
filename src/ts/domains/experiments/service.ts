/**
 * Experiments CRUD service — Phase B.5 R152b
 *
 * Spec: docs/research-schema.md §3.3 + §6 (migration)
 *
 * Storage:
 *   - Firestore named DB "labbook", collection "experiments" (new writes)
 *   - RTDB hydro/, electrode/, electrochem/ (legacy, read-only)
 *
 * Adapter pattern (§6.1):
 *   getExperimentMerged(id) tries Firestore first, falls back to legacy
 *   RTDB and synthesizes Experiment shape.
 *
 * Permission model (Firestore rules R152b):
 *   - read: any authed + tenant
 *   - create: member/admin/superadmin role + createdBy=auth.uid
 *   - update: creator OR admin/superadmin
 *   - delete: admin/superadmin (rare; prefer status="abandoned")
 */


import {
  fdb,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  fsQuery,
  where,
  orderBy,
  fsLimit,
  fsServerTimestamp,
  fbGet,
} from "@/firebase";
import type {
  Experiment,
  ExperimentType,
  ExperimentStatus,
  ExperimentConditions,
} from "@/shared/domain";

const COLLECTION = "experiments";
const DEFAULT_TENANT = "default";
const DEFAULT_LIST_LIMIT = 100;

// ────────────────────────────────────────────────────────────
// Read operations (Firestore primary)
// ────────────────────────────────────────────────────────────

export async function getExperiment(
  id: string,
  tenantId: string = DEFAULT_TENANT,
): Promise<Experiment | null> {
  if (!id) return null;
  const ref = doc(fdb, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Experiment;
  if (data.tenantId !== tenantId) return null;
  return { ...data, id: snap.id };
}

export async function listExperiments(opts: {
  tenantId?: string;
  type?: ExperimentType;
  status?: ExperimentStatus;
  operatorId?: string;
  limit?: number;
} = {}): Promise<Experiment[]> {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT;
  const limitN = opts.limit ?? DEFAULT_LIST_LIMIT;

  const constraints: any[] = [where("tenantId", "==", tenantId)];
  if (opts.type) constraints.push(where("type", "==", opts.type));
  if (opts.status) constraints.push(where("status", "==", opts.status));
  if (opts.operatorId) constraints.push(where("operatorId", "==", opts.operatorId));
  constraints.push(orderBy("performedAt", "desc"));
  constraints.push(fsLimit(limitN));

  const q = fsQuery(collection(fdb, COLLECTION), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d: any) => ({ ...d.data(), id: d.id })) as Experiment[];
}

/**
 * Find experiments that consumed or produced a given sample.
 */
export async function listExperimentsBySample(
  sampleId: string,
  tenantId: string = DEFAULT_TENANT,
  limit: number = DEFAULT_LIST_LIMIT,
): Promise<Experiment[]> {
  if (!sampleId) return [];

  // Two queries needed (Firestore can't OR across fields without composite hack)
  const [inputs, outputs] = await Promise.all([
    getDocs(fsQuery(
      collection(fdb, COLLECTION),
      where("tenantId", "==", tenantId),
      where("inputSamples", "array-contains", sampleId),
      fsLimit(limit),
    )),
    getDocs(fsQuery(
      collection(fdb, COLLECTION),
      where("tenantId", "==", tenantId),
      where("outputSamples", "array-contains", sampleId),
      fsLimit(limit),
    )),
  ]);

  // Deduplicate by id
  const seen = new Set<string>();
  const merged: Experiment[] = [];
  for (const snap of [inputs, outputs]) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      merged.push({ ...(d.data() as any), id: d.id });
    }
  }
  return merged.slice(0, limit);
}

// ────────────────────────────────────────────────────────────
// Adapter: read both legacy + new (R152b §6.1)
// ────────────────────────────────────────────────────────────

/**
 * Synthesize an Experiment shape from legacy RTDB data.
 * Best-effort mapping — fields not present in legacy stay undefined/empty.
 */
function adaptLegacyExperiment(
  legacyCol: "hydro" | "electrode" | "electrochem",
  id: string,
  data: any,
): Experiment {
  const typeMap: Record<string, ExperimentType> = {
    hydro: "hydrothermal",
    electrode: "electrode-prep",
    electrochem: "electrochemistry",
  };
  return {
    id,
    code: data.code || id,
    type: typeMap[legacyCol],
    inputSamples: [],
    outputSamples: [],
    conditions: {} as ExperimentConditions,
    operatorId: data.uid || data.person || "",
    performedAt: data.date || data.createdAt || 0,
    status: "completed",
    legacyRef: { collection: legacyCol, id },
    notes: data.note || data.notes || "",
    tags: [],
    tenantId: data.tenantId || "default",
    createdAt: data.createdAt || 0,
    createdBy: data.uid || "",
    updatedAt: data.updatedAt || data.createdAt || 0,
    updatedBy: data.uid || "",
  };
}

/**
 * Try Firestore first, fall back to legacy RTDB.
 * Returns Experiment shape regardless of source.
 *
 * Note: this is defensive code path. Tests cover Firestore branch only;
 * legacy fallback is manually verified in browser.
 */
export async function getExperimentMerged(
  id: string,
  tenantId: string = DEFAULT_TENANT,
): Promise<Experiment | null> {
  // Try Firestore first
  const newOne = await getExperiment(id, tenantId);
  if (newOne) return newOne;

  // Fall back to legacy RTDB across 3 collections
  for (const legacyCol of ["hydro", "electrode", "electrochem"] as const) {
    try {
      const data = await fbGet(`${legacyCol}/${id}`);
      if (data) return adaptLegacyExperiment(legacyCol, id, data);
    } catch (err) {
      console.warn(`[getExperimentMerged] legacy ${legacyCol} read failed:`, err);
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// Write operations (Firestore only)
// ────────────────────────────────────────────────────────────

export interface CreateExperimentInput {
  code?: string;            // auto-gen if missing
  type: ExperimentType;
  inputSamples?: string[];
  outputSamples?: string[];
  parentExperiment?: string;
  conditions?: ExperimentConditions;
  operatorId?: string;       // defaults to creator uid
  collaborators?: string[];
  performedAt?: any;          // defaults to now
  duration?: number;
  status?: ExperimentStatus;
  derivedMetrics?: any;
  conclusion?: string;
  notes?: string;
  tags?: string[];
}

/**
 * Generate experiment code with type prefix.
 * Pattern: "{prefix}-{YYYY-MM-DD}-{counter}"
 */
function generateExperimentCode(type: ExperimentType): string {
  const prefixMap: Record<string, string> = {
    hydrothermal: "HT",
    "electrode-prep": "E",
    electrochemistry: "EC",
    "ink-formulation": "INK",
    synthesis: "SYN",
    "sol-gel": "SG",
    cvd: "CVD",
    annealing: "ANN",
    measurement: "MEAS",
    characterization: "CHAR",
    photocatalysis: "PC",
    photoelectrochemistry: "PEC",
    compute: "COMP",
    other: "EXP",
  };
  const prefix = prefixMap[type] || "EXP";
  const date = new Date().toISOString().slice(0, 10);
  const counter = String(Date.now()).slice(-3);
  return `${prefix}-${date}-${counter}`;
}

export async function createExperiment(
  input: CreateExperimentInput,
  uid: string,
  tenantId: string = DEFAULT_TENANT,
): Promise<string> {
  if (!input.type) throw new Error("Experiment requires type");
  if (!uid) throw new Error("createExperiment requires authenticated uid");

  const code = input.code?.trim() || generateExperimentCode(input.type);
  const id = `exp-${code.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}`;
  const ref = doc(fdb, COLLECTION, id);

  const payload: any = {
    code,
    type: input.type,
    inputSamples: input.inputSamples ?? [],
    outputSamples: input.outputSamples ?? [],
    conditions: input.conditions ?? {},
    operatorId: input.operatorId || uid,
    performedAt: input.performedAt ?? fsServerTimestamp(),
    status: input.status ?? "completed",
    tags: input.tags ?? [],
    tenantId,
    createdAt: fsServerTimestamp(),
    createdBy: uid,
    updatedAt: fsServerTimestamp(),
    updatedBy: uid,
  };
  // Skip undefined optional (Firestore rejects)
  if (input.parentExperiment !== undefined) payload.parentExperiment = input.parentExperiment;
  if (input.collaborators !== undefined) payload.collaborators = input.collaborators;
  if (input.duration !== undefined) payload.duration = input.duration;
  if (input.derivedMetrics !== undefined) payload.derivedMetrics = input.derivedMetrics;
  if (input.conclusion !== undefined) payload.conclusion = input.conclusion;
  if (input.notes !== undefined) payload.notes = input.notes;

  await setDoc(ref, payload);
  return id;
}

export async function updateExperiment(
  id: string,
  patch: Partial<Omit<Experiment, "id" | "tenantId" | "createdAt" | "createdBy" | "legacyRef">>,
  uid: string,
): Promise<void> {
  if (!id) throw new Error("updateExperiment requires id");
  if (!uid) throw new Error("updateExperiment requires authenticated uid");
  const ref = doc(fdb, COLLECTION, id);
  await updateDoc(ref, {
    ...patch,
    updatedAt: fsServerTimestamp(),
    updatedBy: uid,
  } as any);
}

export async function setExperimentStatus(
  id: string,
  status: ExperimentStatus,
  uid: string,
): Promise<void> {
  await updateExperiment(id, { status }, uid);
}

// NOTE: deleteExperiment intentionally NOT exported.
// Use setExperimentStatus(..., "abandoned") instead. Spec §3.3 design.
