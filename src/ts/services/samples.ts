/**
 * Samples CRUD service — Phase B.5 R151b
 *
 * Source of truth: docs/research-schema.md §3.2
 * Storage: Firestore named DB "labbook", collection "samples".
 *
 * Permission model (Firestore rules R151b):
 *   - read: any authed user with matching tenantId
 *   - create: member/admin/superadmin role + createdBy=auth.uid
 *   - update: creator OR admin/superadmin
 *   - delete: admin/superadmin only (rarely; prefer status=discarded)
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
} from "../firebase";
import type { Sample, SampleStatus, SampleAmount, SynthesisMethod } from "../types/research";

const COLLECTION = "samples";
const DEFAULT_TENANT = "default";
const DEFAULT_LIST_LIMIT = 100;

// ────────────────────────────────────────────────────────────
// Read operations
// ────────────────────────────────────────────────────────────

export async function getSample(
  id: string,
  tenantId: string = DEFAULT_TENANT,
): Promise<Sample | null> {
  if (!id) return null;
  const ref = doc(fdb, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Sample;
  if (data.tenantId !== tenantId) return null;
  return { ...data, id: snap.id };
}

export async function listSamples(opts: {
  tenantId?: string;
  status?: SampleStatus;
  materialRef?: string;
  limit?: number;
} = {}): Promise<Sample[]> {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT;
  const limitN = opts.limit ?? DEFAULT_LIST_LIMIT;

  const constraints: any[] = [where("tenantId", "==", tenantId)];
  if (opts.status) constraints.push(where("status", "==", opts.status));
  if (opts.materialRef) constraints.push(where("materialRef", "==", opts.materialRef));
  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(fsLimit(limitN));

  const q = fsQuery(collection(fdb, COLLECTION), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d: any) => ({ ...d.data(), id: d.id })) as Sample[];
}

/**
 * Find samples derived from a root material (uses denormalized
 * rootMaterials field for fast query).
 */
export async function listSamplesByRootMaterial(
  rootMaterialId: string,
  tenantId: string = DEFAULT_TENANT,
  limit: number = DEFAULT_LIST_LIMIT,
): Promise<Sample[]> {
  if (!rootMaterialId) return [];
  const q = fsQuery(
    collection(fdb, COLLECTION),
    where("tenantId", "==", tenantId),
    where("rootMaterials", "array-contains", rootMaterialId),
    orderBy("createdAt", "desc"),
    fsLimit(limit),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d: any) => ({ ...d.data(), id: d.id })) as Sample[];
}

export async function searchSamples(
  queryStr: string,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<Sample[]> {
  const q = (queryStr ?? "").trim().toLowerCase();
  if (!q) return [];

  const all = await listSamples({
    tenantId: opts.tenantId,
    limit: 500,
  });

  const matches = all.filter((s) => {
    if (s.name.toLowerCase().includes(q)) return true;
    if (s.shortCode?.toLowerCase().includes(q)) return true;
    if (s.composition.toLowerCase().includes(q)) return true;
    if (s.tags?.some((t) => t.toLowerCase().includes(q))) return true;
    return false;
  });

  return matches.slice(0, opts.limit ?? DEFAULT_LIST_LIMIT);
}

// ────────────────────────────────────────────────────────────
// Write operations
// ────────────────────────────────────────────────────────────

export interface CreateSampleInput {
  name?: string;          // auto-gen if missing
  shortCode?: string;
  materialRef?: string;
  composition: string;    // required (display fallback)
  isComposite?: boolean;
  parents?: string[];
  rootMaterials?: string[];
  generation?: number;
  synthesisExperimentRef?: string;
  synthesisMethod?: SynthesisMethod;
  synthesisDate?: any;
  status?: SampleStatus;
  amount?: SampleAmount;
  initialAmount?: SampleAmount;
  storageLocation?: string;
  notes?: string;
  tags?: string[];
}

/**
 * Generate default sample name: "{composition}-batch-{YYYY-MM-DD}-{counter}"
 * Counter is a 3-digit suffix from Date.now() last 3 digits (cheap unique).
 */
function generateSampleName(composition: string): string {
  const safe = composition.replace(/[^a-zA-Z0-9]/g, "_") || "sample";
  const date = new Date().toISOString().slice(0, 10);
  const counter = String(Date.now()).slice(-3);
  return `${safe}-batch-${date}-${counter}`;
}

export async function createSample(
  input: CreateSampleInput,
  uid: string,
  tenantId: string = DEFAULT_TENANT,
): Promise<string> {
  if (!input.composition) throw new Error("Sample requires composition");
  if (!uid) throw new Error("createSample requires authenticated uid");

  const name = input.name?.trim() || generateSampleName(input.composition);
  const id = `smp-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}`;
  const ref = doc(fdb, COLLECTION, id);

  const payload: any = {
    name,
    composition: input.composition,
    isComposite: input.isComposite ?? false,
    parents: input.parents ?? [],
    rootMaterials: input.rootMaterials ?? (input.materialRef ? [input.materialRef] : []),
    generation: input.generation ?? 0,
    status: input.status ?? "available",
    tags: input.tags ?? [],
    tenantId,
    createdAt: fsServerTimestamp(),
    createdBy: uid,
    updatedAt: fsServerTimestamp(),
    updatedBy: uid,
  };
  // Only include optional fields when defined (Firestore rejects undefined)
  if (input.shortCode !== undefined) payload.shortCode = input.shortCode;
  if (input.materialRef !== undefined) payload.materialRef = input.materialRef;
  if (input.synthesisExperimentRef !== undefined) payload.synthesisExperimentRef = input.synthesisExperimentRef;
  if (input.synthesisMethod !== undefined) payload.synthesisMethod = input.synthesisMethod;
  if (input.synthesisDate !== undefined) payload.synthesisDate = input.synthesisDate;
  if (input.amount !== undefined) payload.amount = input.amount;
  if (input.initialAmount !== undefined) payload.initialAmount = input.initialAmount;
  if (input.storageLocation !== undefined) payload.storageLocation = input.storageLocation;
  if (input.notes !== undefined) payload.notes = input.notes;

  await setDoc(ref, payload);
  return id;
}

export async function updateSample(
  id: string,
  patch: Partial<Omit<Sample, "id" | "tenantId" | "createdAt" | "createdBy">>,
  uid: string,
): Promise<void> {
  if (!id) throw new Error("updateSample requires id");
  if (!uid) throw new Error("updateSample requires authenticated uid");

  const ref = doc(fdb, COLLECTION, id);
  await updateDoc(ref, {
    ...patch,
    updatedAt: fsServerTimestamp(),
    updatedBy: uid,
  } as any);
}

/**
 * Convenience: change sample status (available → in-use → consumed etc.)
 */
export async function setSampleStatus(
  id: string,
  status: SampleStatus,
  uid: string,
): Promise<void> {
  await updateSample(id, { status }, uid);
}

// NOTE: deleteSample intentionally not exported.
// Per design: rarely delete, prefer setSampleStatus(..., "discarded").
