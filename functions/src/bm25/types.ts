/**
 * BM25 — Type definitions
 * Round 137a — Hybrid retrieval foundation
 */

export type Language = "en" | "vi" | "mixed";

/**
 * BM25 fields added to each aiChunks document.
 * Bumped tokenizerVersion → re-tokenize required.
 */
export interface ChunkBM25Fields {
  bm25Tokens: string[];                  // unique tokens (for array-contains-any)
  bm25TokenFreq: Record<string, number>; // token → count (for TF scoring)
  bm25DocLength: number;                 // total tokens incl. duplicates
  bm25Language: Language;
  bm25TokenizerVersion: number;          // current = 1
  bm25TokenizedAt: number;               // epoch ms
}

/**
 * Result returned by tokenize() — caller maps to ChunkBM25Fields.
 */
export interface TokenizeResult {
  tokens: string[];                      // unique
  tokenFreq: Record<string, number>;
  docLength: number;
  language: Language;
}

/**
 * Corpus-wide BM25 stats — stored at aiCorpusStats/global.
 * If documentFrequency map exceeds 800KB, sharded into df-shard-{N} docs.
 */
export interface CorpusStats {
  totalDocs: number;
  totalDocsByLanguage: Record<Language, number>;
  avgDocLength: number;
  avgDocLengthByLanguage: Record<Language, number>;
  vocabularySize: number;
  documentFrequency: Record<string, number>;
  // BM25 hyperparams (tunable in R137b)
  k1: number;
  b: number;
  lastUpdatedAt: number;
  tokenizerVersion: number;
  // Sharding metadata (set when DF map split across docs)
  dfSharded: boolean;
  dfShardCount: number;
  // Reserved for R137c synonyms
  synonymDictVersion: number;
}

export const TOKENIZER_VERSION = 2;  // R137a-fix: noise filtering
export const DEFAULT_K1 = 1.5;
export const DEFAULT_B = 0.75;
export const CORPUS_STATS_DOC = "global";
export const CORPUS_STATS_COLLECTION = "aiCorpusStats";
