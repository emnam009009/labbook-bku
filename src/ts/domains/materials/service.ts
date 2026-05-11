/**
 * Materials CRUD service — Phase B.5 R150b
 *
 * Source of truth: docs/research-schema.md §3.1
 *
 * Storage: Firestore default DB, collection "materials".
 *
 * Permission model (enforced by Firestore rules in R150c):
 *   - read: any authenticated user with matching tenantId
 *   - create/update: admin/superadmin role
 *   - delete: NEVER (mark deprecated instead)
 *
 * Tenant scoping:
 *   ALL queries filter by tenantId. Lab BKU phase: "default".
 *   Future commercial fork uses real tenant IDs.
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
} from "@/firebase";
import type { Material, MaterialCategory } from "@/shared/domain";

const COLLECTION = "materials";
const DEFAULT_TENANT = "default";
const DEFAULT_LIST_LIMIT = 100;

// ────────────────────────────────────────────────────────────
// Read operations
// ────────────────────────────────────────────────────────────

/**
 * Get a single material by Firestore doc ID.
 * Returns null if not found OR if tenantId doesn't match.
 */
export async function getMaterial(
  id: string,
  tenantId: string = DEFAULT_TENANT,
): Promise<Material | null> {
  if (!id) return null;
  const ref = doc(fdb, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Material;
  // Tenant isolation enforced at app layer too (defense-in-depth with rules)
  if (data.tenantId !== tenantId) return null;
  return { ...data, id: snap.id };
}

/**
 * List materials for a tenant, optionally filtered by category.
 * Sorted by formula ascending. Default limit 100.
 */
export async function listMaterials(opts: {
  tenantId?: string;
  category?: MaterialCategory;
  limit?: number;
} = {}): Promise<Material[]> {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT;
  const limitN = opts.limit ?? DEFAULT_LIST_LIMIT;

  const constraints: any[] = [where("tenantId", "==", tenantId)];
  if (opts.category) {
    constraints.push(where("category", "==", opts.category));
  }
  constraints.push(orderBy("formula", "asc"));
  constraints.push(fsLimit(limitN));

  const q = fsQuery(collection(fdb, COLLECTION), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d: any) => ({ ...d.data(), id: d.id })) as Material[];
}

/**
 * Search materials by formula or name (substring match, case-insensitive).
 *
 * Note: Firestore doesn't support arbitrary substring search natively.
 * This implementation does a tenant-wide list then filters in-memory.
 * Acceptable for ~thousands of materials per tenant; if collection
 * grows large, switch to Algolia or denormalized search index.
 */
export async function searchMaterials(
  queryStr: string,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<Material[]> {
  const q = (queryStr ?? "").trim().toLowerCase();
  if (!q) return [];

  // Pull a wider set, then filter
  const all = await listMaterials({
    tenantId: opts.tenantId,
    limit: 500,
  });

  const matches = all.filter((m) => {
    if (m.formula.toLowerCase().includes(q)) return true;
    if (m.name.toLowerCase().includes(q)) return true;
    if (m.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  });

  return matches.slice(0, opts.limit ?? DEFAULT_LIST_LIMIT);
}

// ────────────────────────────────────────────────────────────
// Write operations (admin/superadmin per rules R150c)
// ────────────────────────────────────────────────────────────

export interface CreateMaterialInput {
  formula: string;
  name: string;
  aliases?: string[];
  category: MaterialCategory;
  subcategory?: string;
  knownProperties?: Material["knownProperties"];
  references?: string[];
  externalIds?: Material["externalIds"];
}

/**
 * Create a new material. Returns the doc ID.
 *
 * Caller is responsible for permission check (rules will reject
 * non-admin writes, but UI should hide create button too).
 *
 * Uniqueness: caller must ensure formula doesn't already exist for
 * this tenant. checkFormulaExists() helper provided for pre-check.
 */
export async function createMaterial(
  input: CreateMaterialInput,
  uid: string,
  tenantId: string = DEFAULT_TENANT,
): Promise<string> {
  if (!input.formula || !input.name) {
    throw new Error("Material requires formula and name");
  }
  if (!uid) {
    throw new Error("createMaterial requires authenticated uid");
  }

  // Use formula-based ID for canonical entries, else autogen via doc()
  const safeFormula = input.formula.replace(/[^a-zA-Z0-9_-]/g, "_");
  const id = `mat-${safeFormula}-${Date.now()}`;
  const ref = doc(fdb, COLLECTION, id);

  const payload: any = {
    formula: input.formula,
    name: input.name,
    aliases: input.aliases ?? [],
    category: input.category,
    knownProperties: input.knownProperties ?? {},
    references: input.references ?? [],
    tenantId,
    createdAt: fsServerTimestamp(),
    createdBy: uid,
    updatedAt: fsServerTimestamp(),
    updatedBy: uid,
  };
  // R150b-fix2: only include optional fields when defined.
  // Firestore rejects undefined values.
  if (input.subcategory !== undefined) payload.subcategory = input.subcategory;
  if (input.externalIds !== undefined) payload.externalIds = input.externalIds;

  await setDoc(ref, payload);
  return id;
}

/**
 * Update an existing material. Partial update — only specified fields
 * are written. updatedAt + updatedBy always refreshed.
 *
 * Cannot update: id, formula, tenantId, createdAt, createdBy.
 */
export async function updateMaterial(
  id: string,
  patch: Partial<Omit<Material, "id" | "formula" | "tenantId" | "createdAt" | "createdBy">>,
  uid: string,
): Promise<void> {
  if (!id) throw new Error("updateMaterial requires id");
  if (!uid) throw new Error("updateMaterial requires authenticated uid");

  const ref = doc(fdb, COLLECTION, id);
  await updateDoc(ref, {
    ...patch,
    updatedAt: fsServerTimestamp(),
    updatedBy: uid,
  });
}

/**
 * Check if a formula already exists for the given tenant.
 * Used by UI to prevent duplicate creates.
 */
export async function checkFormulaExists(
  formula: string,
  tenantId: string = DEFAULT_TENANT,
): Promise<boolean> {
  if (!formula) return false;
  const q = fsQuery(
    collection(fdb, COLLECTION),
    where("tenantId", "==", tenantId),
    where("formula", "==", formula),
    fsLimit(1),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

// NOTE: deleteMaterial is INTENTIONALLY NOT EXPORTED.
// Per design decision (R150a CHANGELOG): materials are never deleted,
// only marked deprecated via a future `deprecated: boolean` field.
