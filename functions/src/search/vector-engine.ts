/**
 * Vector Search Engine — Round 137b
 *
 * Extracted from R136a search-papers.ts inline logic.
 * Voyage embedding (provided by caller via ctx.embed) +
 * Firestore findNearest with COSINE distance.
 */

import type { SearchEngine, SearchQuery, SearchResult, SearchEngineContext } from "./types";
import type { SearchConfig } from "./config";

const COLLECTION = "aiChunks";

export class VectorEngine implements SearchEngine {
  readonly mode = "vector" as const;

  constructor(private config: SearchConfig) {}

  async search(query: SearchQuery, ctx: SearchEngineContext): Promise<SearchResult[]> {
    const { FieldValue } = await import("firebase-admin/firestore");

    const queryVector = await ctx.embed(query.text);

    let baseQuery: any = ctx.firestore.collection(COLLECTION);
    if (query.paperId) {
      baseQuery = baseQuery.where("paperId", "==", query.paperId);
    }
    // Tenant filter — schema-ready for SaaS. For lab, all chunks should
    // be implicit "default" so no filter applied unless explicitly set.
    if (query.tenantId && query.tenantId !== this.config.defaultTenantId) {
      baseQuery = baseQuery.where("tenantId", "==", query.tenantId);
    }

    const limit = query.retrievalDepth || this.config.vectorTopN;

    const vectorQuery = baseQuery.findNearest({
      vectorField: "embedding",
      queryVector: FieldValue.vector(queryVector),
      limit,
      distanceMeasure: "COSINE",
      distanceResultField: "_distance",
    });

    const snap = await vectorQuery.get();
    return snap.docs.map((d: any): SearchResult => {
      const data = d.data();
      const distance = data._distance as number;
      return {
        chunkId: d.id,
        paperId: data.paperId,
        chunkIndex: data.chunkIndex,
        sectionPath: data.sectionPath,
        text: data.text,
        distance,
        vectorScore: 1 - distance,  // convert distance → similarity
      };
    });
  }
}
