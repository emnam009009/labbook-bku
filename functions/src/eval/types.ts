/**
 * Eval — Type definitions
 * Round 137b-eval+obs
 */

import type { SearchMode } from "../search/types";

/**
 * One ground-truth query in the eval dataset.
 *
 * `expectedPapers` ranks papers by relevance:
 *   - "high":     this paper directly answers the query
 *   - "medium":   this paper has supporting context
 *   - "low":      tangentially related
 *
 * NDCG uses these grades (high=3, medium=2, low=1, absent=0).
 * Precision/MRR treats high+medium as relevant (binary).
 */
export interface GroundTruthQuery {
  id: string;                    // stable identifier, e.g. "q001"
  query: string;
  language: "en" | "vi" | "mixed";
  expectedPapers: ExpectedPaper[];
  notes?: string;                // why these papers, what to look for
}

export interface ExpectedPaper {
  paperId: string;
  relevance: "high" | "medium" | "low";
}

export interface GroundTruthDataset {
  version: string;               // e.g. "v1.0"
  description: string;
  queries: GroundTruthQuery[];
}

/**
 * Per-query metric result (one row in eval run).
 */
export interface QueryEvalResult {
  queryId: string;
  query: string;
  mode: SearchMode;
  retrievedPaperIds: string[];   // ordered by rank
  expectedPaperIds: string[];    // ordered by relevance grade desc
  // Metrics
  mrr: number;
  precisionAt10: number;
  ndcgAt10: number;
  // Search performance
  searchMs: number;
  resultCount: number;
}

/**
 * Aggregated summary across all queries in a run.
 */
export interface EvalRunSummary {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  // Averaged metrics
  avgMrr: number;
  avgPrecisionAt10: number;
  avgNdcgAt10: number;
  avgSearchMs: number;
  // Per-mode breakdown if multi-mode run
  byMode?: Record<SearchMode, {
    avgMrr: number;
    avgPrecisionAt10: number;
    avgNdcgAt10: number;
    avgSearchMs: number;
  }>;
}

export interface EvalRun {
  runId: string;
  datasetVersion: string;
  modes: SearchMode[];
  totalQueries: number;
  summary: EvalRunSummary;
  startedAt: number;
  completedAt: number;
  totalMs: number;
  status: "ok" | "partial" | "failed";
  errorMessage?: string;
}
