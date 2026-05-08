/**
 * Hybrid Search Engine — Round 137b
 *
 * Runs vector + BM25 in parallel, merges via RRF.
 * Falls back gracefully if one engine fails (logs warning, uses the other).
 */

import type { SearchEngine, SearchQuery, SearchResult, SearchEngineContext } from "./types";
import type { SearchConfig } from "./config";
import { VectorEngine } from "./vector-engine";
import { BM25Engine } from "./bm25-engine";
import { rrfMerge } from "./rrf";

export class HybridEngine implements SearchEngine {
  readonly mode = "hybrid" as const;
  private vector: VectorEngine;
  private bm25: BM25Engine;

  constructor(private config: SearchConfig) {
    this.vector = new VectorEngine(config);
    this.bm25 = new BM25Engine(config);
  }

  async search(query: SearchQuery, ctx: SearchEngineContext): Promise<SearchResult[]> {
    // Run both engines in parallel — independent failures don't block
    const [vectorRes, bm25Res] = await Promise.allSettled([
      this.vector.search(query, ctx),
      this.bm25.search(query, ctx),
    ]);

    const lists: SearchResult[][] = [];
    if (vectorRes.status === "fulfilled") {
      lists.push(vectorRes.value);
    } else {
      // eslint-disable-next-line no-console
      console.warn("[hybrid] vector engine failed:", String(vectorRes.reason));
    }
    if (bm25Res.status === "fulfilled") {
      lists.push(bm25Res.value);
    } else {
      // eslint-disable-next-line no-console
      console.warn("[hybrid] bm25 engine failed:", String(bm25Res.reason));
    }

    if (lists.length === 0) return [];
    if (lists.length === 1) return lists[0].slice(0, query.limit);

    return rrfMerge(lists, this.config.rrfK, query.limit);
  }
}
