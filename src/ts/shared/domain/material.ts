/**
 * Material entity types — extracted from src/ts/types/research.ts
 * in R158a Phase 1 as part of shared/domain restructure.
 *
 * Phase B.5 R150a.
 */

import type { ResearchTimestamp } from "./timestamp.js";

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
 *   - `formula` is unique PER TENANT. Querying by formula must include
 *     tenantId filter to avoid cross-tenant matches.
 *
 * Permissions:
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
