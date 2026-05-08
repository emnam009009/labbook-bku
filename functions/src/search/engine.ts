/**
 * Search engine factory — Round 137b
 *
 * Single entry point for selecting an engine by mode.
 * For SaaS fork: this is where multi-tenant / per-tier engine selection lives.
 */

import type { SearchEngine, SearchMode } from "./types";
import type { SearchConfig } from "./config";
import { VectorEngine } from "./vector-engine";
import { BM25Engine } from "./bm25-engine";
import { HybridEngine } from "./hybrid-engine";

export function createSearchEngine(mode: SearchMode, config: SearchConfig): SearchEngine {
  switch (mode) {
    case "vector":
      return new VectorEngine(config);
    case "bm25":
      return new BM25Engine(config);
    case "hybrid":
      return new HybridEngine(config);
    default:
      // Exhaustiveness check at compile time
      const _exhaustive: never = mode;
      throw new Error(`Unknown search mode: ${_exhaustive}`);
  }
}

export type { SearchEngine, SearchMode } from "./types";
