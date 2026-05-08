/**
 * Eval runner — execute ground truth queries through search pipeline
 * Round 137b-eval+obs
 */

import type { SearchMode } from "../search/types";
import type {
  GroundTruthDataset,
  QueryEvalResult,
  EvalRunSummary,
} from "./types";
import { mrr, precisionAtK, ndcgAtK } from "./metrics";

/**
 * Function signature the runner needs to invoke search.
 * Provided by handler — keeps runner decoupled from Voyage / Firestore details.
 */
export type SearchFn = (params: {
  query: string;
  mode: SearchMode;
  limit: number;
}) => Promise<{ results: Array<{ paperId: string }>; searchMs: number }>;

/**
 * Run all queries in dataset across all requested modes.
 * Returns per-query results (for persistence) + aggregated summary.
 */
export async function runEvalDataset(
  dataset: GroundTruthDataset,
  modes: SearchMode[],
  searchFn: SearchFn,
  limit: number = 10,
): Promise<{
  perQuery: QueryEvalResult[];
  summary: EvalRunSummary;
}> {
  const perQuery: QueryEvalResult[] = [];

  for (const mode of modes) {
    for (const q of dataset.queries) {
      try {
        const { results, searchMs } = await searchFn({
          query: q.query,
          mode,
          limit,
        });
        const retrievedPaperIds = results.map((r) => r.paperId);
        const expectedPaperIds = q.expectedPapers.map((e) => e.paperId);

        perQuery.push({
          queryId: q.id,
          query: q.query,
          mode,
          retrievedPaperIds,
          expectedPaperIds,
          mrr: mrr(retrievedPaperIds, q.expectedPapers),
          precisionAt10: precisionAtK(retrievedPaperIds, q.expectedPapers, 10),
          ndcgAt10: ndcgAtK(retrievedPaperIds, q.expectedPapers, 10),
          searchMs,
          resultCount: results.length,
        });
      } catch (e: any) {
        // Record failure but continue
        perQuery.push({
          queryId: q.id,
          query: q.query,
          mode,
          retrievedPaperIds: [],
          expectedPaperIds: q.expectedPapers.map((e) => e.paperId),
          mrr: 0,
          precisionAt10: 0,
          ndcgAt10: 0,
          searchMs: 0,
          resultCount: 0,
        });
      }
    }
  }

  // Aggregate summary
  const successful = perQuery.filter((r) => r.resultCount > 0);
  const failed = perQuery.length - successful.length;

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const avg = (xs: number[]) => (xs.length > 0 ? sum(xs) / xs.length : 0);

  const allMrr = perQuery.map((r) => r.mrr);
  const allP10 = perQuery.map((r) => r.precisionAt10);
  const allNdcg = perQuery.map((r) => r.ndcgAt10);
  const allMs = successful.map((r) => r.searchMs);

  // Per-mode breakdown
  const byMode: Partial<Record<SearchMode, any>> = {};
  for (const mode of modes) {
    const modeResults = perQuery.filter((r) => r.mode === mode);
    if (modeResults.length === 0) continue;
    const modeSuccessful = modeResults.filter((r) => r.resultCount > 0);
    byMode[mode] = {
      avgMrr: avg(modeResults.map((r) => r.mrr)),
      avgPrecisionAt10: avg(modeResults.map((r) => r.precisionAt10)),
      avgNdcgAt10: avg(modeResults.map((r) => r.ndcgAt10)),
      avgSearchMs: avg(modeSuccessful.map((r) => r.searchMs)),
    };
  }

  const summary: EvalRunSummary = {
    totalQueries: perQuery.length,
    successfulQueries: successful.length,
    failedQueries: failed,
    avgMrr: avg(allMrr),
    avgPrecisionAt10: avg(allP10),
    avgNdcgAt10: avg(allNdcg),
    avgSearchMs: avg(allMs),
    byMode: byMode as any,
  };

  return { perQuery, summary };
}
