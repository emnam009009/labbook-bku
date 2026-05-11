/**
 * Instrument entity types — placeholder.
 *
 * Phase B.5 originally planned Instrument entity for R154+ but not
 * implemented yet. This file is created in R158a Phase 1 to reserve
 * the file path. Concrete types will be added when Instrument
 * collection is implemented (likely R162 or Phase D).
 *
 * Until then, instrument metadata is stored inline in DataAsset.metadata.
 */

import type { ResearchTimestamp } from "./timestamp.js";

/**
 * Instrument entity — placeholder.
 * Will be expanded with model, calibration, maintenance fields.
 */
export interface Instrument {
  id: string;
  tenantId: string;
  /** Display name (e.g., "Bruker D8 Advance XRD") */
  name: string;
  /** Vendor model (e.g., "D8 Advance") */
  model?: string;
  /** Instrument type/technique (e.g., "XRD", "Raman", "UV-Vis") */
  technique?: string;
  createdAt: ResearchTimestamp;
  createdBy: string;
  updatedAt: ResearchTimestamp;
  updatedBy: string;
}
