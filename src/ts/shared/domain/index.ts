/**
 * Shared domain types — barrel re-export.
 *
 * All core entity types live in this folder. Domain modules
 * (src/ts/domains/*) and shared services import from here via
 * the `@/shared/domain` path alias.
 *
 * Originally consolidated in src/ts/types/research.ts (R150a-R153),
 * extracted to per-entity files in R158a Phase 1.
 */

export type { ResearchTimestamp } from "./timestamp.js";

export type {
  Material,
  MaterialCategory,
  MaterialExternalIds,
  MaterialKnownProperties,
} from "./material.js";

export type {
  Sample,
  SampleStatus,
  SynthesisMethod,
  SampleAmount,
} from "./sample.js";

export type {
  Experiment,
  ExperimentType,
  ExperimentStatus,
  ExperimentConditions,
  ExperimentConditionValue,
  ExperimentLegacyRef,
  ExperimentDerivedMetrics,
} from "./experiment.js";

export type {
  DataAsset,
  DataAssetType,
  DataAssetAnalysisStatus,
  CreateDataAssetInput,
  UpdateDataAssetInput,
} from "./data-asset.js";

export type { Instrument } from "./instrument.js";
