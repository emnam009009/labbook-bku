/**
 * DataAsset entity types — extracted from src/ts/types/research.ts
 * in R158a Phase 1 as part of shared/domain restructure.
 *
 * Phase B.5 R153a.
 */

import type { ResearchTimestamp } from "./timestamp.js";

// ────────────────────────────────────────────────────────────
// DataAsset
// ────────────────────────────────────────────────────────────

/**
 * Type of data asset attached to an experiment.
 * Drives classifier UI and analyzer dispatch.
 */
export type DataAssetType =
  | 'xrd'              // X-ray diffraction
  | 'sem'              // Scanning electron microscopy
  | 'tem'              // Transmission electron microscopy
  | 'raman'            // Raman spectroscopy
  | 'ftir'             // FTIR
  | 'uv-vis'           // UV-Vis absorbance
  | 'uv-vis-drs'       // UV-Vis diffuse reflectance
  | 'pl'               // Photoluminescence
  | 'eds'              // Energy-dispersive X-ray spectroscopy
  | 'xps'              // X-ray photoelectron spectroscopy
  | 'electrochem-csv'  // CV/LSV/EIS/Tafel/Mott-Schottky CSV exports
  | 'image'            // Generic image (substrate photo, etc.)
  | 'document'         // PDF/DOC report
  | 'other';

/**
 * Status of derived analysis (Tauc fit, Scherrer, peak match, etc).
 * Future R153d: classifier auto-detects + analyzers populate.
 */
export type DataAssetAnalysisStatus =
  | 'none'        // No analysis run
  | 'pending'     // Queued for analysis
  | 'analyzed'    // Analysis complete, results in metadata
  | 'failed';     // Analysis attempted but failed

/**
 * File attached to an experiment (or sample). Replaces legacy
 * RTDB /attachments/ system for new experiments.
 *
 * Storage path: dataAssets/{tenantId}/{experimentId}/{fileName}
 *
 * Permissions (Firestore rules):
 *   - read: any authed user with matching tenantId
 *   - create: member/admin/superadmin + uploadedBy=auth.uid
 *   - update: uploader OR admin/superadmin (only metadata, not file)
 *   - delete: uploader OR admin/superadmin
 *
 * Storage rules:
 *   - read: any authed user
 *   - create: member/admin/superadmin, ≤ 25MB, allowed mime types
 *   - delete: uploader OR admin/superadmin
 */
export interface DataAsset {
  // ─── Identity ───
  id: string;
  tenantId: string;

  // ─── Linkage ───
  /** FK to Experiment (required — every DataAsset belongs to one experiment). */
  experimentId: string;
  /** Optional FK to Sample if asset is sample-level (e.g. as-synthesized SEM). */
  sampleId?: string;

  // ─── Classification ───
  type: DataAssetType;
  /** Optional sub-classification (e.g. 'CV' / 'LSV' / 'EIS' for electrochem-csv). */
  subType?: string;

  // ─── File metadata ───
  fileName: string;
  fileSize: number;       // bytes
  mimeType: string;       // e.g. 'application/pdf', 'image/png', 'text/csv'
  storagePath: string;    // Firebase Storage path

  // ─── Annotations ───
  notes?: string;
  tags?: string[];

  // ─── Analysis (R153d future) ───
  analysisStatus?: DataAssetAnalysisStatus;
  /** Type-specific extracted data: e.g. XRD peaks, Tauc bandgap, Scherrer size. */
  metadata?: Record<string, unknown>;

  // ─── Audit ───
  uploadedAt: ResearchTimestamp;
  uploadedBy: string;
  createdAt: ResearchTimestamp;
  createdBy: string;
  updatedAt?: ResearchTimestamp;
  updatedBy?: string;
}

/**
 * Input for creating a new DataAsset (post-upload).
 */
export interface CreateDataAssetInput {
  experimentId: string;
  sampleId?: string;
  type: DataAssetType;
  subType?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  notes?: string;
  tags?: string[];
}

/**
 * Input for updating DataAsset (metadata only — file is immutable).
 */
export interface UpdateDataAssetInput {
  type?: DataAssetType;
  subType?: string;
  notes?: string;
  tags?: string[];
  analysisStatus?: DataAssetAnalysisStatus;
  metadata?: Record<string, unknown>;
}
