/**
 * Experiment entity types — extracted from src/ts/types/research.ts
 * in R158a Phase 1 as part of shared/domain restructure.
 *
 * Phase B.5 R152a.
 */

import type { ResearchTimestamp } from "./timestamp.js";

// ────────────────────────────────────────────────────────────
// Experiment
// ────────────────────────────────────────────────────────────

/**
 * Experiment type. Replaces flat hydro/electrode/electrochem with
 * unified taxonomy. Backward compat via legacyRef.
 */
export type ExperimentType =
  | "synthesis"          // generic synthesis (extensible)
  | "hydrothermal"       // legacy: hydro/
  | "sol-gel"
  | "cvd"
  | "annealing"
  | "electrode-prep"     // legacy: electrode/
  | "ink-formulation"
  | "measurement"        // generic measurement (XRD, Raman, ...)
  | "electrochemistry"   // legacy: electrochem/ (CV/LSV/EIS/Tafel/GCD)
  | "characterization"   // SEM/TEM/XPS/UV-Vis/PL/FTIR
  | "photocatalysis"     // R152c-2: dye degradation under light
  | "photoelectrochemistry" // R152c-2: PEC measurements (LSV, chronoamp, PEIS)
  | "compute"            // simulation (DFT, MD)
  | "other";

export type ExperimentStatus =
  | "planned"
  | "in-progress"
  | "completed"
  | "failed"
  | "abandoned";

/**
 * Common quantitative condition with unit.
 */
export interface ExperimentConditionValue<U extends string = string> {
  value: number;
  unit: U;
}

/**
 * Experiment conditions — common fields enumerated, extensible via
 * index signature for type-specific fields (e.g., voltage range for
 * electrochemistry, scan rate for CV, etc.).
 */
export interface ExperimentConditions {
  temperature?: ExperimentConditionValue<"K" | "°C">;
  duration?: ExperimentConditionValue<"min" | "h">;
  pressure?: ExperimentConditionValue<"Pa" | "atm" | "bar">;
  pH?: number;
  atmosphere?: string;       // "Ar" | "air" | "N2" | "vacuum" | ...
  /** Extensible: type-specific fields */
  [key: string]: any;
}

/**
 * Backward-compat reference to legacy RTDB collection.
 * Set when synthesized from legacy hydro/electrode/electrochem.
 * Existing collections are NOT deleted — read-only forever for audit.
 */
export interface ExperimentLegacyRef {
  collection: "hydro" | "electrode" | "electrochem";
  id: string;
}

/**
 * Derived metrics — loose object for computed values.
 * E.g., { eta10_HER: 280, tafelSlope: 45, bandgap_optical: 1.85 }
 * Full structured metrics live in DataAsset.derivedMetrics (R153).
 */
export interface ExperimentDerivedMetrics {
  [key: string]: any;
}

/**
 * Experiment entity — unified replacement for flat
 * hydro/electrode/electrochem collections.
 *
 * Identity:
 *   - id: Firestore auto-ID
 *   - code: human-readable, prefix-based (HT/E/EC/INK) for backward
 *     compat with existing UI conventions
 *
 * Lineage:
 *   - inputSamples: samples CONSUMED (e.g., precursor for hydrothermal)
 *   - outputSamples: samples PRODUCED (e.g., MoS2 batch from synthesis)
 *   - parentExperiment: optional, for derived experiments
 *     (e.g., annealing of an existing sample's product)
 *
 * Migration:
 *   - legacyRef set when adapted from legacy RTDB collection
 *   - New experiments: legacyRef=undefined
 *   - Both legacy reads + new Firestore writes coexist forever (§6.3)
 *
 * Permissions (rules R152b):
 *   - read: authed + tenant
 *   - create: member/admin/superadmin + createdBy=auth.uid
 *   - update: creator OR admin/superadmin
 *   - delete: admin only (rare; prefer status="abandoned")
 *
 * See docs/research-schema.md §3.3 for full spec.
 */
export interface Experiment {
  // ─── Identity ───
  id: string;
  /** Human-readable code: "HT-2026-05-09-001", "EC-...", etc. */
  code: string;
  type: ExperimentType;

  // ─── Lineage ───
  /** sampleIds consumed by this experiment. */
  inputSamples: string[];
  /** sampleIds produced by this experiment. */
  outputSamples: string[];
  /** Optional FK to parent experiment for derived runs. */
  parentExperiment?: string;

  // ─── Conditions ───
  conditions: ExperimentConditions;

  // ─── Operator ───
  /** Primary operator UID. */
  operatorId: string;
  /** Other UIDs participating. */
  collaborators?: string[];
  /** When experiment ran (not when record was created). */
  performedAt: ResearchTimestamp;
  /** Total duration in milliseconds (denormalized from conditions.duration). */
  duration?: number;

  // ─── Status ───
  status: ExperimentStatus;

  // ─── Results ───
  /** High-level summary metrics. Full structured data → DataAsset (R153). */
  derivedMetrics?: ExperimentDerivedMetrics;
  /** Freeform conclusion text. */
  conclusion?: string;

  // ─── Backward compat ───
  /** Set when adapted from legacy collection. New writes: undefined. */
  legacyRef?: ExperimentLegacyRef;

  // ─── Annotations ───
  notes?: string;
  tags: string[];

  // ─── Audit ───
  tenantId: string;
  createdAt: ResearchTimestamp;
  createdBy: string;
  updatedAt: ResearchTimestamp;
  updatedBy: string;
}
