/**
 * Reranker — Round 137c1
 *
 * Re-scores a candidate list of search results using a cross-encoder
 * (Voyage rerank-2.5 by default). Improves ranking quality vs raw
 * vector/BM25/hybrid scores by considering query-document interaction
 * directly rather than independent embedding distances.
 *
 * Architectural notes:
 * - Reranker is a separate concern from SearchEngine (orchestrated by handler).
 * - Interface allows future provider swap (Cohere, self-hosted cross-encoder).
 * - All implementations should be graceful: never throw on API failure;
 *   instead log and return inputs unchanged so handler can fall back.
 */

import type { SearchResult } from "./types";

export interface RerankerInput {
  query: string;
  candidates: SearchResult[];
  topK: number;            // how many to return after rerank
}

export interface Reranker {
  readonly model: string;
  /**
   * Re-score and re-order candidates. Returns top-K results with
   * `rerankScore` populated. On failure, returns first `topK` of input
   * unchanged (caller's responsibility to log degraded path).
   */
  rerank(input: RerankerInput): Promise<SearchResult[]>;
}

/**
 * Voyage rerank-2.5 implementation.
 *
 * API docs: https://docs.voyageai.com/docs/reranker
 * Endpoint: POST https://api.voyageai.com/v1/rerank
 * Pricing: $0.05/1M tokens (rerank-2.5), $0.02/1M (rerank-2.5-lite)
 */
const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";

export interface VoyageRerankerOptions {
  apiKey: string;
  model?: string;
  // Optional callback to track tokens for cost attribution (tracer integration)
  onTokensUsed?: (totalTokens: number) => void;
}

export class VoyageReranker implements Reranker {
  readonly model: string;

  constructor(private opts: VoyageRerankerOptions) {
    this.model = opts.model || "rerank-2.5";
  }

  async rerank(input: RerankerInput): Promise<SearchResult[]> {
    const { query, candidates, topK } = input;
    if (candidates.length === 0) return [];
    if (candidates.length === 1) {
      return [{ ...candidates[0], rerankScore: 1 }];
    }

    // Build documents array — one string per candidate
    const documents = candidates.map((c) => c.text);

    let resp: Response;
    try {
      resp = await fetch(VOYAGE_RERANK_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          documents,
          model: this.model,
          top_k: Math.min(topK, candidates.length),
          return_documents: false,
          truncation: true,        // truncate long docs to model max
        }),
      });
    } catch (e) {
      // Network failure — graceful fallback
      // eslint-disable-next-line no-console
      console.warn(`[reranker] network error: ${String(e)}`);
      return candidates.slice(0, topK);
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "<no body>");
      // eslint-disable-next-line no-console
      console.warn(`[reranker] Voyage error ${resp.status}: ${errText.slice(0, 200)}`);
      return candidates.slice(0, topK);
    }

    let data: any;
    try {
      data = await resp.json();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[reranker] JSON parse failed: ${String(e)}`);
      return candidates.slice(0, topK);
    }

    // Track token usage if callback provided
    if (this.opts.onTokensUsed && typeof data.usage?.total_tokens === "number") {
      try { this.opts.onTokensUsed(data.usage.total_tokens); } catch { /* swallow */ }
    }

    // Voyage response: { data: [{ index, relevance_score }, ...] }
    // `index` references the position in the input documents array.
    const rerankedItems = data.data;
    if (!Array.isArray(rerankedItems)) {
      // eslint-disable-next-line no-console
      console.warn(`[reranker] unexpected response shape, falling back to input order`);
      return candidates.slice(0, topK);
    }

    const results: SearchResult[] = [];
    for (const item of rerankedItems) {
      const idx = item.index as number;
      const score = item.relevance_score as number;
      if (typeof idx !== "number" || idx < 0 || idx >= candidates.length) continue;
      results.push({
        ...candidates[idx],
        rerankScore: score,
      });
    }
    return results.slice(0, topK);
  }
}

/**
 * No-op reranker for when reranking is disabled.
 * Returns candidates unchanged (just trims to topK).
 */
export class NoopReranker implements Reranker {
  readonly model = "noop";
  async rerank(input: RerankerInput): Promise<SearchResult[]> {
    return input.candidates.slice(0, input.topK);
  }
}
