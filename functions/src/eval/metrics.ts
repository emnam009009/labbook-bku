/**
 * IR Metrics — pure functions
 * Round 137b-eval+obs
 *
 * Metrics:
 *   MRR (Mean Reciprocal Rank): 1/rank of first relevant item, or 0 if not in list
 *   Precision@K: |relevant ∩ top-K| / K
 *   NDCG@K: ranking quality with graded relevance
 */

import type { ExpectedPaper } from "./types";

const RELEVANCE_GRADE: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Convert expected papers list to map: paperId → grade.
 * Default 0 for not-listed papers.
 */
function toGradeMap(expected: ExpectedPaper[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of expected) {
    m.set(e.paperId, RELEVANCE_GRADE[e.relevance] || 0);
  }
  return m;
}

/**
 * Mean Reciprocal Rank for a single query.
 * Considers relevance >= medium (grade >= 2) as "relevant" for MRR.
 */
export function mrr(retrievedPaperIds: string[], expected: ExpectedPaper[]): number {
  const grades = toGradeMap(expected);
  for (let i = 0; i < retrievedPaperIds.length; i++) {
    const grade = grades.get(retrievedPaperIds[i]) || 0;
    if (grade >= 2) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Precision@K for a single query.
 * Treats grade >= medium as relevant (binary).
 *
 * Note: De-duplicates papers in retrieved list — multiple chunks from same
 * paper count as 1 hit, not K hits.
 */
export function precisionAtK(
  retrievedPaperIds: string[],
  expected: ExpectedPaper[],
  k: number,
): number {
  const grades = toGradeMap(expected);
  const seen = new Set<string>();
  let hits = 0;
  let counted = 0;
  for (const pid of retrievedPaperIds) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    if ((grades.get(pid) || 0) >= 2) hits += 1;
    counted += 1;
    if (counted >= k) break;
  }
  return counted > 0 ? hits / counted : 0;
}

/**
 * NDCG@K with graded relevance.
 * Higher grade contributes more, position-discounted by log2.
 */
export function ndcgAtK(
  retrievedPaperIds: string[],
  expected: ExpectedPaper[],
  k: number,
): number {
  const grades = toGradeMap(expected);
  const seen = new Set<string>();

  // DCG of retrieved ordering (de-dup papers — keep first occurrence)
  let dcg = 0;
  let counted = 0;
  const dedup: string[] = [];
  for (const pid of retrievedPaperIds) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    dedup.push(pid);
    counted += 1;
    if (counted >= k) break;
  }
  for (let i = 0; i < dedup.length; i++) {
    const grade = grades.get(dedup[i]) || 0;
    if (grade > 0) {
      // Standard DCG formula: (2^grade - 1) / log2(i+2)
      dcg += (Math.pow(2, grade) - 1) / Math.log2(i + 2);
    }
  }

  // Ideal DCG: sort all expected papers by grade desc, take top-K
  const idealOrder = [...expected]
    .map((e) => RELEVANCE_GRADE[e.relevance] || 0)
    .sort((a, b) => b - a)
    .slice(0, k);
  let idcg = 0;
  for (let i = 0; i < idealOrder.length; i++) {
    if (idealOrder[i] > 0) {
      idcg += (Math.pow(2, idealOrder[i]) - 1) / Math.log2(i + 2);
    }
  }

  return idcg > 0 ? dcg / idcg : 0;
}
