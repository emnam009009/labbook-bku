/**
 * tests/search/rrf.test.ts
 * Round 144 — Pure logic tests for Reciprocal Rank Fusion.
 *
 * Source under test: functions/src/search/rrf.ts (R137b)
 *
 * Why these tests matter:
 *   RRF fuses ranked lists from vector + BM25 retrieval into the final
 *   hybrid ranking shown to users (and to the AI tool searchPapers).
 *   Math errors here = silent ranking corruption: top result wrong,
 *   user gets stale/irrelevant chunks, AI cites wrong papers.
 *   No exception, no log — just degraded research output.
 *
 * Formula under test:
 *   RRF_score(d) = Σ_i 1 / (k + rank_i(d))
 *   k = 60 canonical default
 *   rank is 1-based; absent doc contributes 0.
 */

import { describe, it, expect } from "vitest";
import { rrfMerge } from "../../functions/src/search/rrf";
import type { SearchResult } from "../../functions/src/search/types";

// Helper: build a minimal SearchResult with optional scores.
function mkResult(
  chunkId: string,
  overrides: Partial<SearchResult> = {},
): SearchResult {
  return {
    chunkId,
    paperId: "paper-1",
    chunkIndex: 0,
    sectionPath: "abstract",
    text: `text-${chunkId}`,
    ...overrides,
  };
}

describe("rrfMerge — single list", () => {
  it("preserves order when fed a single ranked list", () => {
    const list = [mkResult("a"), mkResult("b"), mkResult("c")];
    const merged = rrfMerge([list], 60, 10);
    expect(merged.map((r) => r.chunkId)).toEqual(["a", "b", "c"]);
  });

  it("computes RRF score = 1 / (k + rank) for each doc", () => {
    const list = [mkResult("a"), mkResult("b")];
    const merged = rrfMerge([list], 60, 10);
    expect(merged[0].rrfScore).toBeCloseTo(1 / 61, 10);  // rank 1
    expect(merged[1].rrfScore).toBeCloseTo(1 / 62, 10);  // rank 2
  });

  it("respects topK truncation", () => {
    const list = [mkResult("a"), mkResult("b"), mkResult("c"), mkResult("d")];
    const merged = rrfMerge([list], 60, 2);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.chunkId)).toEqual(["a", "b"]);
  });
});

describe("rrfMerge — two lists (vector + BM25 hybrid)", () => {
  it("doc appearing top of both lists gets highest combined score", () => {
    const vectorList = [mkResult("a"), mkResult("b"), mkResult("c")];
    const bm25List = [mkResult("a"), mkResult("d"), mkResult("e")];
    const merged = rrfMerge([vectorList, bm25List], 60, 10);

    expect(merged[0].chunkId).toBe("a");
    // a appears at rank 1 in both → 1/61 + 1/61 = 2/61
    expect(merged[0].rrfScore).toBeCloseTo(2 / 61, 10);
  });

  it("doc appearing in only one list still gets ranked", () => {
    const vectorList = [mkResult("a"), mkResult("b")];
    const bm25List = [mkResult("c")];
    const merged = rrfMerge([vectorList, bm25List], 60, 10);

    const ids = merged.map((r) => r.chunkId);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    expect(merged).toHaveLength(3);
  });

  it("ranks doc-in-both above doc-in-one", () => {
    const vectorList = [mkResult("a"), mkResult("uniqueV")];
    const bm25List = [mkResult("a"), mkResult("uniqueB")];
    const merged = rrfMerge([vectorList, bm25List], 60, 10);

    // a should rank first (in both)
    expect(merged[0].chunkId).toBe("a");
    // uniqueV and uniqueB both at rank 2 in their list, score 1/62 each
    expect(merged[1].rrfScore).toBeCloseTo(1 / 62, 10);
    expect(merged[2].rrfScore).toBeCloseTo(1 / 62, 10);
  });

  it("preserves vectorScore and bm25Score from source lists", () => {
    const vectorList = [mkResult("a", { vectorScore: 0.95 })];
    const bm25List = [mkResult("a", { bm25Score: 12.3 })];
    const merged = rrfMerge([vectorList, bm25List], 60, 10);

    expect(merged[0].vectorScore).toBe(0.95);
    expect(merged[0].bm25Score).toBe(12.3);
  });
});

describe("rrfMerge — k parameter sensitivity", () => {
  it("smaller k amplifies rank differences", () => {
    const list = [mkResult("a"), mkResult("b")];
    const mergedSmallK = rrfMerge([list], 1, 10);
    const mergedLargeK = rrfMerge([list], 1000, 10);

    const ratioSmall = (mergedSmallK[0].rrfScore || 0) / (mergedSmallK[1].rrfScore || 1);
    const ratioLarge = (mergedLargeK[0].rrfScore || 0) / (mergedLargeK[1].rrfScore || 1);

    // k=1: ratio = (1/2) / (1/3) = 1.5
    // k=1000: ratio = (1/1001) / (1/1002) ≈ 1.001
    expect(ratioSmall).toBeGreaterThan(ratioLarge);
  });

  it("uses the k value passed in (no hidden default)", () => {
    const list = [mkResult("a")];
    const merged = rrfMerge([list], 100, 10);
    expect(merged[0].rrfScore).toBeCloseTo(1 / 101, 10);
  });
});

describe("rrfMerge — edge cases", () => {
  it("returns empty array for empty input lists", () => {
    expect(rrfMerge([], 60, 10)).toEqual([]);
    expect(rrfMerge([[]], 60, 10)).toEqual([]);
    expect(rrfMerge([[], []], 60, 10)).toEqual([]);
  });

  it("handles topK larger than total unique docs", () => {
    const list = [mkResult("a"), mkResult("b")];
    const merged = rrfMerge([list], 60, 100);
    expect(merged).toHaveLength(2);
  });

  it("handles topK = 0 → returns empty", () => {
    const list = [mkResult("a")];
    const merged = rrfMerge([list], 60, 0);
    expect(merged).toEqual([]);
  });

  it("preserves chunk metadata from first occurrence", () => {
    const r1 = mkResult("a", { paperId: "p1", sectionPath: "intro" });
    const r2 = mkResult("a", { paperId: "p1", sectionPath: "intro" });
    const merged = rrfMerge([[r1], [r2]], 60, 10);

    expect(merged[0].paperId).toBe("p1");
    expect(merged[0].sectionPath).toBe("intro");
  });

  it("output sorted by rrfScore descending (strict)", () => {
    const vectorList = [mkResult("a"), mkResult("b"), mkResult("c")];
    const bm25List = [mkResult("c"), mkResult("a")];
    const merged = rrfMerge([vectorList, bm25List], 60, 10);

    for (let i = 0; i < merged.length - 1; i++) {
      const cur = merged[i].rrfScore || 0;
      const nxt = merged[i + 1].rrfScore || 0;
      expect(cur).toBeGreaterThanOrEqual(nxt);
    }
  });
});
