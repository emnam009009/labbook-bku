/**
 * Paper Library types — Round 132a
 */

export interface Paper {
  paperId: string;
  title: string;
  filename: string;
  sha256: string;
  sizeBytes: number;
  uploadedAt: string;     // ISO timestamp
  uploadedBy: string;     // uid
  uploadedByName?: string; // display name (denormalized)
  storagePath: string;    // papers/_shared/{paperId}/{filename}
  processingStatus: ProcessingStatus;

  // Phase B sau (R134+): extracted text, chunks, embeddings
  textExtracted?: boolean;
  numChunks?: number;
  numPages?: number;
}

export type ProcessingStatus =
  | "uploaded"     // Just uploaded, no processing yet
  | "extracting"   // Text extraction in progress
  | "extracted"    // Text extracted, ready for chunking
  | "chunking"     // Smart chunking in progress
  | "chunked"      // Ready for embedding
  | "embedding"    // Generating embeddings
  | "embedded"     // Embeddings done — backend writes this (R135 paperPipelineRouter)
  | "indexed"      // Legacy — kept for backward compat with older docs
  | "error";       // Processing failed

export interface UploadProgress {
  paperId: string;
  filename: string;
  bytesTransferred: number;
  totalBytes: number;
  state: "queued" | "uploading" | "done" | "error";
  errorMessage?: string;
}

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const ACCEPTED_MIME = ["application/pdf"];
export const ACCEPTED_EXT = [".pdf"];
