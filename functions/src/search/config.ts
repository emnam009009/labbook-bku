/**
 * Search engine config — Round 137b
 *
 * Centralized hyperparams for hybrid retrieval. Single source of truth
 * to avoid scattered magic numbers. Tune here, deploy.
 *
 * For SaaS fork: this becomes per-tenant config in Firestore.
 */

export interface SearchConfig {
  // BM25 hyperparams
  bm25K1: number;
  bm25B: number;

  // BM25 retrieval strategy
  // Firestore array-contains-any limit is 30 values per query
  bm25MaxQueryTokens: number;

  // Per-engine retrieval depth (top-N before merge)
  vectorTopN: number;
  bm25TopN: number;

  // RRF (Reciprocal Rank Fusion) constant
  // k=60 is the well-established default from Cormack et al. 2009
  rrfK: number;

  // Final result count default
  defaultLimit: number;
  maxLimit: number;
  maxRetrievalDepth: number;

  // R137c1: Reranker config
  rerankerEnabled: boolean;       // global default; per-request can override
  rerankerModel: string;          // "rerank-2.5" | "rerank-2.5-lite" | future providers
  rerankerCandidates: number;     // how many candidates to send to reranker (~30)

  // Multi-tenancy (SaaS-ready, not enforced for lab)
  defaultTenantId: string;
}

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  bm25K1: 1.5,
  bm25B: 0.75,
  bm25MaxQueryTokens: 30,
  vectorTopN: 30,
  bm25TopN: 30,
  rrfK: 60,
  defaultLimit: 10,
  maxLimit: 50,
  maxRetrievalDepth: 100,
  // R137c1: Reranker
  rerankerEnabled: true,
  rerankerModel: "rerank-2.5",
  rerankerCandidates: 30,
  defaultTenantId: "default",
};
