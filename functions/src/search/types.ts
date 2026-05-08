/**
 * Search engine — Common types
 * Round 137b
 */

export type SearchMode = "vector" | "bm25" | "hybrid";

export interface SearchQuery {
  text: string;
  limit: number;
  // Optional filters
  paperId?: string;
  tenantId?: string;
  // Per-engine retrieval depth (default from config)
  retrievalDepth?: number;
}

export interface SearchResult {
  chunkId: string;
  paperId: string;
  chunkIndex: number;
  sectionPath: string;
  text: string;
  // Scores — populated by engine, all optional
  vectorScore?: number;     // 1 - cosine_distance (higher = more similar)
  bm25Score?: number;       // BM25 score (higher = more relevant)
  rrfScore?: number;        // RRF score (higher = more relevant)
  // R137c1: cross-encoder rerank score (higher = more relevant; range varies by model)
  rerankScore?: number;
  // Distance for backward compat with R136a callers
  distance?: number;
}

export interface SearchEngineContext {
  // Function to embed a query string (provided by caller — engine doesn't
  // own the Voyage API key directly, separation of concerns).
  embed: (text: string) => Promise<number[]>;
  // Firestore instance (named DB)
  firestore: any;  // FirebaseFirestore.Firestore — typed `any` to avoid import
}

export interface SearchEngine {
  readonly mode: SearchMode;
  search(query: SearchQuery, ctx: SearchEngineContext): Promise<SearchResult[]>;
}
