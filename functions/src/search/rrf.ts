/**
 * Reciprocal Rank Fusion — Round 137b
 *
 * Combines multiple ranked result lists into a single unified ranking.
 *
 * Formula:
 *   RRF_score(d) = Σ_i 1 / (k + rank_i(d))
 *
 * where rank_i(d) is the 1-based rank of doc d in list i (or absent → 0 contribution).
 *
 * k=60 is the canonical default (Cormack, Clarke, Buettcher 2009).
 *
 * Properties:
 * - No score-scale alignment needed (works on ranks, not raw scores)
 * - Robust to outliers (1/k+rank flattens score distribution)
 * - Industry standard for hybrid lexical+semantic search
 */

import type { SearchResult } from "./types";

/**
 * Merge multiple result lists by RRF score.
 * Preserves all input fields from whichever list saw the doc first.
 */
export function rrfMerge(
  lists: SearchResult[][],
  k: number,
  topK: number,
): SearchResult[] {
  // Map chunkId → { result, rrfScore, vectorScore?, bm25Score? }
  const combined = new Map<string, SearchResult>();

  for (const list of lists) {
    list.forEach((result, idx) => {
      const rank = idx + 1;
      const contribution = 1 / (k + rank);

      const existing = combined.get(result.chunkId);
      if (existing) {
        // Merge — accumulate RRF, prefer non-undefined scores from result
        existing.rrfScore = (existing.rrfScore || 0) + contribution;
        if (result.vectorScore !== undefined) existing.vectorScore = result.vectorScore;
        if (result.bm25Score !== undefined) existing.bm25Score = result.bm25Score;
        if (result.distance !== undefined && existing.distance === undefined) {
          existing.distance = result.distance;
        }
      } else {
        combined.set(result.chunkId, {
          ...result,
          rrfScore: contribution,
        });
      }
    });
  }

  // Sort by RRF score desc, take top-K
  const merged = Array.from(combined.values());
  merged.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
  return merged.slice(0, topK);
}
