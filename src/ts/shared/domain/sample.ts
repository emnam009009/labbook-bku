/**
 * Sample entity types — extracted from src/ts/types/research.ts
 * in R158a Phase 1 as part of shared/domain restructure.
 *
 * Phase B.5 R151a.
 */

import type { ResearchTimestamp } from "./timestamp.js";

// ────────────────────────────────────────────────────────────
// Sample
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
 * Permissions (enforced by Firestore rules R151b):
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
