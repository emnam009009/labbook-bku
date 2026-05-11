/**
 * Compat shim — DEPRECATED, will be removed when all imports migrate
 * to `@/shared/domain`.
 *
 * Original location: src/ts/types/research.ts (R150a-R153, ~539 LOC)
 * R158a Phase 1: split into src/ts/shared/domain/*.ts
 *
 * This file re-exports for backward compatibility. New code should
 * import from `@/shared/domain` directly.
 *
 * @deprecated Import from `@/shared/domain` instead.
 */

export type {
  ResearchTimestamp,
  Material,
  MaterialCategory,
  MaterialExternalIds,
  MaterialKnownProperties,
  Sample,
  SampleStatus,
  SynthesisMethod,
  SampleAmount,
  Experiment,
  ExperimentType,
  ExperimentStatus,
  ExperimentConditions,
  ExperimentConditionValue,
  ExperimentLegacyRef,
  ExperimentDerivedMetrics,
  DataAsset,
  DataAssetType,
  DataAssetAnalysisStatus,
  CreateDataAssetInput,
  UpdateDataAssetInput,
  Instrument,
} from "@/shared/domain";
