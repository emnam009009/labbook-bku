/**
 * Observability — Type definitions
 * Round 137b-eval+obs
 */

export type SpanStatus = "ok" | "error" | "skipped";

export interface Span {
  name: string;             // e.g. "embed", "vector_search", "rrf_merge"
  startMs: number;          // ms offset from trace start
  durMs: number;            // duration in ms
  status: SpanStatus;
  metadata?: Record<string, unknown>;  // free-form, e.g. { resultCount: 30 }
  errorMessage?: string;
}

export interface CostBreakdown {
  embedTokens: number;
  embedUsd: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  llmUsd: number;
  rerankTokens: number;
  rerankUsd: number;
  totalUsd: number;
}

export interface Trace {
  traceId: string;          // ULID-style, sortable by time
  endpoint: string;         // "searchPapers", "runEval", etc.
  userId: string;
  // Privacy: log preview + hash, never log full long queries that may contain PII
  queryPreview: string;     // first 100 chars
  queryHash: string;        // sha256 prefix for dedup analysis
  // Per-request metadata (mode, limit, etc.)
  attributes: Record<string, unknown>;
  totalMs: number;
  status: SpanStatus;
  spans: Span[];
  cost: CostBreakdown;
  errorMessage?: string;
  createdAt: number;        // epoch ms
  // Multi-tenant ready (default for lab)
  tenantId: string;
}
