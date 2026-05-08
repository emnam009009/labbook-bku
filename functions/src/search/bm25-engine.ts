/**
 * BM25 Search Engine — Round 137b
 *
 * Strategy: Option A (see commit message)
 * 1. Tokenize query
 * 2. Sort tokens by IDF descending → take top N (default 30)
 *    (Firestore array-contains-any limit is 30 values per query)
 * 3. Fetch candidates: where('bm25Tokens', 'array-contains-any', topTokens)
 * 4. Score each candidate with BM25 formula in memory
 * 5. Return top-K by score
 *
 * BM25 formula (Robertson/Spärck Jones with default Okapi normalization):
 *   score(D, Q) = Σ_{q in Q} IDF(q) * (f(q,D) * (k1+1)) / (f(q,D) + k1*(1-b + b*|D|/avgDL))
 *
 * IDF(q) = ln((N - df + 0.5) / (df + 0.5) + 1)
 *   N = total docs, df = doc frequency of term q
 */

import type { SearchEngine, SearchQuery, SearchResult, SearchEngineContext } from "./types";
import type { SearchConfig } from "./config";
import type { CorpusStats } from "../bm25/types";
import { CORPUS_STATS_COLLECTION, CORPUS_STATS_DOC } from "../bm25/types";
import { tokenize } from "../bm25/tokenizer";

const COLLECTION = "aiChunks";

export class BM25Engine implements SearchEngine {
  readonly mode = "bm25" as const;

  constructor(private config: SearchConfig) {}

  async search(query: SearchQuery, ctx: SearchEngineContext): Promise<SearchResult[]> {
    // 1. Load corpus stats (cached at instance level — see future R140+)
    const statsSnap = await ctx.firestore
      .collection(CORPUS_STATS_COLLECTION)
      .doc(CORPUS_STATS_DOC)
      .get();
    if (!statsSnap.exists) {
      // Corpus not yet indexed — return empty
      return [];
    }
    const stats = statsSnap.data() as CorpusStats;
    if (stats.totalDocs === 0) return [];

    // 2. Tokenize query (same pipeline as indexing)
    const tokenized = tokenize(query.text);
    if (tokenized.tokens.length === 0) return [];

    // 3. Compute IDF for each query token, sort descending
    //    Tokens absent from corpus → skip (df=0 means meaningless)
    const N = stats.totalDocs;
    interface QueryTerm {
      token: string;
      idf: number;
      qFreq: number;  // freq in query (for boost in BM25 formula)
    }
    const terms: QueryTerm[] = [];
    for (const token of tokenized.tokens) {
      const df = stats.documentFrequency[token] || 0;
      if (df === 0) continue;  // OOV — skip (could match via vector engine)
      const idf = Math.log(((N - df + 0.5) / (df + 0.5)) + 1);
      terms.push({
        token,
        idf,
        qFreq: tokenized.tokenFreq[token] || 1,
      });
    }
    if (terms.length === 0) return [];  // all OOV

    // Sort by IDF desc — rare terms most informative
    terms.sort((a, b) => b.idf - a.idf);
    const topTerms = terms.slice(0, this.config.bm25MaxQueryTokens);
    const topTokens = topTerms.map((t) => t.token);

    // 4. Firestore array-contains-any query
    let baseQuery: any = ctx.firestore.collection(COLLECTION);
    if (query.paperId) {
      baseQuery = baseQuery.where("paperId", "==", query.paperId);
    }
    if (query.tenantId && query.tenantId !== this.config.defaultTenantId) {
      baseQuery = baseQuery.where("tenantId", "==", query.tenantId);
    }
    // Note: array-contains-any can't combine with another inequality, but
    // we only have equality filters above, so this is fine.
    baseQuery = baseQuery.where("bm25Tokens", "array-contains-any", topTokens);

    const snap = await baseQuery.get();
    if (snap.empty) return [];

    // 5. Score every candidate with BM25
    const k1 = this.config.bm25K1;
    const b = this.config.bm25B;
    const avgDL = stats.avgDocLength || 1;

    interface ScoredDoc {
      doc: any;
      score: number;
    }
    const scored: ScoredDoc[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      const docLen = (data.bm25DocLength as number) || 0;
      if (docLen === 0) continue;
      const tokenFreq = (data.bm25TokenFreq as Record<string, number>) || {};

      let score = 0;
      for (const term of topTerms) {
        const f = tokenFreq[term.token] || 0;
        if (f === 0) continue;
        // Okapi BM25 with query frequency multiplier
        // (qFreq is a minor refinement, doesn't change ranking much)
        const norm = f * (k1 + 1) / (f + k1 * (1 - b + b * docLen / avgDL));
        score += term.idf * norm * term.qFreq;
      }
      if (score > 0) {
        scored.push({ doc, score });
      }
    }

    // 6. Sort by score desc, take retrievalDepth (or bm25TopN default)
    const limit = query.retrievalDepth || this.config.bm25TopN;
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);

    return top.map(({ doc, score }): SearchResult => {
      const data = doc.data();
      return {
        chunkId: doc.id,
        paperId: data.paperId,
        chunkIndex: data.chunkIndex,
        sectionPath: data.sectionPath,
        text: data.text,
        bm25Score: score,
      };
    });
  }
}
