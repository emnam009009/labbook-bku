/**
 * Research Schema Types — Phase B.5
 *
 * Entity types for the unified research data model. See
 * docs/research-schema.md for the design spec.
 *
 * Round 150a: Material entity only. Sample, Experiment, DataAsset,
 * Instrument types will be added in subsequent R151-R154 rounds.
 *
 * Storage: Firestore default DB (NOT the named DB `labbook` mentioned
 * in spec §2 — Phase B already shipped using default DB; spec is
 * outdated and will be reconciled in R150f).
 */

// ────────────────────────────────────────────────────────────
// Common types
// ────────────────────────────────────────────────────────────

/**
 * Generic timestamp shim. Firestore values may be:
 *   - Timestamp object (`{ seconds, nanoseconds }`) when reading from
 *     the SDK with `serverTimestamp()` writes
 *   - Number (epoch ms) when written explicitly via `Date.now()`
 *   - String (ISO 8601) when serialized through Cloud Functions
 *
 * Concrete services (R150b+) will pick a canonical form per field
 * and document. This union avoids forcing the client bundle to import
 * `firebase/firestore` just to get the `Timestamp` type alias.
 */
export type ResearchTimestamp =
  | number
  | string
  | { seconds: number; nanoseconds: number };

// ────────────────────────────────────────────────────────────
// Material
// ────────────────────────────────────────────────────────────

/**
 * Material category enum. Mirrors spec §3.1.
 * Add new values via PR; do not extend at call sites.
 */
export type MaterialCategory =
  | "TMD"           // Transition Metal Dichalcogenide (MoS2, WS2, ...)
  | "oxide"         // ZnO, TiO2, WO3, ...
  | "perovskite"    // CaTiO3, MAPbI3, ...
  | "MOF"           // Metal-Organic Framework
  | "alloy"
  | "polymer"
  | "carbon"        // graphene, CNT, GO, rGO, ...
  | "salt"          // for precursors
  | "composite"     // explicitly composite
  | "other";

/**
 * External identifiers (cross-database references).
 * All optional — populate what's known, leave the rest off.
 */
export interface MaterialExternalIds {
  /** Materials Project ID, e.g. "mp-1023923" */
  materialsProjectId?: string;
  /** Crystallography Open Database ID */
  cod?: string;
  /** PubChem CID */
  pubchem?: string;
  /** CAS registry number (for chemicals) */
  cas?: string;
}

/**
 * Known properties from literature. All fields optional and additive
 * (extensible via index signature). Do NOT use this for measured
 * values from the lab's own experiments — those go in DataAsset
 * `derivedMetrics`.
 */
export interface MaterialKnownProperties {
  /** "2H" | "1T" | "3R" for TMDs; broader for other categories */
  structure?: string;
  /** "hexagonal" | "cubic" | "tetragonal" | ... */
  crystalSystem?: string;
  /** Bandgap in eV */
  bandgap?: number;
  bandgapType?: "direct" | "indirect";
  /** Density in g/cm³ */
  density?: number;
  /** Molecular mass in g/mol */
  moleculeMass?: number;
  /** Future fields not yet enumerated. Prefer adding named fields
   *  above when promoted from ad-hoc to documented. */
  [key: string]: unknown;
}

/**
 * Material entity.
 *
 * Identity:
 *   - `id` is the Firestore doc ID (auto-generated unless explicitly
 *     set, e.g., "mat-MoS2" for canonical entries).
 *   - `formula` is unique PER TENANT (decided per memory; spec §12
 *     listed this as open). Querying by formula must include
 *     tenantId filter to avoid cross-tenant matches.
 *
 * Permissions (per memory; lab-wide read + role-based write):
 *   - read: any authenticated user with matching tenantId
 *   - create/update: admin or superadmin role
 *   - delete: NEVER (mark deprecated via subcategory or
 *     a future `deprecated: boolean` field)
 *
 * Lineage:
 *   - Materials are reference data, not lineage nodes themselves.
 *     Sample → Material is many-to-one (Sample.materialRef → this.id).
 *
 * See docs/research-schema.md §3.1 for full spec.
 */
export interface Material {
  // ─── Identity ───
  /** Firestore doc ID. Convention: auto-ID, or `mat-{formula}` for
   *  canonical entries seeded at lab onboarding. */
  id: string;
  /** Chemical formula. Unique per tenant. Case-sensitive (Mg ≠ MG). */
  formula: string;
  /** Display name (e.g., "Molybdenum disulfide"). */
  name: string;
  /** Alternate names users might search by (e.g., ["MoS₂", "Molybdenite"]). */
  aliases: string[];

  // ─── Classification ───
  category: MaterialCategory;
  /** Free-text refinement (e.g., "2D-TMD"). Not enumerated. */
  subcategory?: string;

  // ─── Reference data ───
  knownProperties: MaterialKnownProperties;
  /** Linked papers in `aiPapers/_shared/` (RTDB). Array of paperId. */
  references: string[];
  externalIds?: MaterialExternalIds;

  // ─── Audit ───
  /** Tenant scope. All queries on this collection MUST filter by
   *  tenantId to maintain isolation. Lab BKU phase: "default". */
  tenantId: string;
  createdAt: ResearchTimestamp;
  /** Firebase Auth UID of creator. */
  createdBy: string;
  updatedAt: ResearchTimestamp;
  updatedBy: string;
}


// ────────────────────────────────────────────────────────────
// Sample (R151a — Phase B.5)
// ────────────────────────────────────────────────────────────

/**
 * Sample lifecycle status.
 */
export type SampleStatus =
  | "available"   // in storage, can be used
  | "in-use"      // currently in an experiment
  | "consumed"    // used up
  | "archived"    // retired but kept for records
  | "discarded";  // physical sample destroyed

/**
 * Synthesis methods. Free-extension via string but enumerated common
 * cases for autocomplete / validation.
 */
export type SynthesisMethod =
  | "hydrothermal"
  | "sol-gel"
  | "CVD"           // Chemical Vapor Deposition
  | "annealing"
  | "exfoliation"
  | "precipitation"
  | "spin-coating"
  | "other"
  | string;         // allow other strings without breaking type

/**
 * Amount with unit. Used for current and initial amounts.
 */
export interface SampleAmount {
  value: number;
  /** Common: "mg", "g", "mL", "L", "pieces". Free-text. */
  unit: string;
}

/**
 * Sample entity — physical specimen tracked through lab lifecycle.
 *
 * Required for all experiments (synthesis output OR consumed input).
 *
 * Identity:
 *   - id: Firestore auto-ID
 *   - name: human-readable, auto-generated if missing
 *     (convention: "{materialFormula}-batch-{YYYY-MM-DD}-{counter}")
 *   - shortCode: optional user-editable, e.g., "MS-001"
 *
 * Lineage:
 *   - parents=[]       → fresh synthesis from raw materials
 *   - parents=[A]      → derived from sample A (e.g., annealed version)
 *   - parents=[A, B]   → composite (e.g., MoS2/WO3 heterojunction)
 *   - rootMaterials    → denormalized: flatten parent chain to root materials
 *                        for fast "all samples derived from MoS2" queries
 *   - generation       → 0 = fresh, 1 = derived once, N = N-th generation
 *
 * Permissions (enforced by Firestore rules in R151b):
 *   - read: any authenticated user with matching tenantId
 *   - create/update: admin/superadmin role claim
 *   - delete: NEVER (use status="discarded" instead)
 *
 * See docs/research-schema.md §3.2 for full spec.
 */
export interface Sample {
  // ─── Identity ───
  id: string;
  /** Auto-generated if missing: "{materialFormula}-batch-{YYYY-MM-DD}-{counter}" */
  name: string;
  /** Optional user-editable short code, e.g., "MS-001" */
  shortCode?: string;

  // ─── Composition ───
  /** FK → materials/{id} (preferred). Optional if pure-string composition. */
  materialRef?: string;
  /** Denormalized for display, fallback if no materialRef. e.g., "MoS2" */
  composition: string;
  /** True if heterostructure / composite material */
  isComposite: boolean;

  // ─── Lineage ───
  /** Parent sampleIds. [] = fresh, [A] = derived, [A,B] = composite */
  parents: string[];
  /** Denormalized: flatten parent chain to root materials. */
  rootMaterials: string[];
  /** 0 = fresh synthesis, N = N-th derived generation */
  generation: number;

  // ─── Origin ───
  /** FK → experiments/{id} — the experiment that created this sample. */
  synthesisExperimentRef?: string;
  synthesisMethod?: SynthesisMethod;
  synthesisDate?: ResearchTimestamp;

  // ─── Lifecycle ───
  status: SampleStatus;
  /** Current amount in storage. */
  amount?: SampleAmount;
  /** Amount at creation (immutable history). */
  initialAmount?: SampleAmount;
  /** Storage location, e.g., "Tủ A1, ngăn 3" */
  storageLocation?: string;

  // ─── Annotations ───
  notes?: string;
  /** Free tags, e.g., ["catalyst-test", "publish-2026"] */
  tags: string[];

  // ─── Audit ───
  tenantId: string;
  createdAt: ResearchTimestamp;
  createdBy: string;
  updatedAt: ResearchTimestamp;
  updatedBy: string;
}
