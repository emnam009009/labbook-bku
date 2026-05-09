/**
 * Tool: searchPapers (R138b1 + R138b1-fix)
 *
 * Hybrid search over the lab's paper corpus, callable as an LLM tool.
 *
 * Reuses R137b search engine + R137c1 reranker directly — no HTTP roundtrip.
 *
 * Output is shaped to be compact and citation-friendly for the LLM:
 * each chunk has a 1-indexed `position` so the model can cite as [1], [2].
 */
import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { logger } from "../utils/logger";
import { createSearchEngine } from "../search/engine";
import { DEFAULT_SEARCH_CONFIG } from "../search/config";
import type {
  SearchMode,
  SearchEngineContext,
  SearchQuery,
} from "../search/types";
import { VoyageReranker } from "../search/reranker";

const FIRESTORE_DB = "labbook";
const VOYAGE_EMBED_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_EMBED_MODEL = "voyage-3-large";

export interface SearchPapersArgs {
  query: string;
  limit?: number;
  paperId?: string;
  mode?: SearchMode;
}

export interface SearchPapersChunk {
  position: number;
  chunkId: string;
  paperId: string;
  paperTitle: string;
  sectionPath: string;
  text: string;
  rerankScore?: number;
  vectorScore?: number;
  bm25Score?: number;
}

export interface SearchPapersResult {
  total: number;
  chunks: SearchPapersChunk[];
  message?: string;
  searchMs: number;
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const CHUNK_TEXT_MAX_CHARS = 800;

/** Create an embed function bound to the Voyage API key. */
function makeEmbedFn(apiKey: string): (text: string) => Promise<number[]> {
  return async (text: string): Promise<number[]> => {
    const res = await fetch(VOYAGE_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: [text],
        model: VOYAGE_EMBED_MODEL,
        input_type: "query",
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Voyage embed failed: ${res.status} ${errBody.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    const vec = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec)) throw new Error("Voyage embed: missing embedding in response");
    return vec;
  };
}

/**
 * Batched paper-title lookup from RTDB.
 *
 * Schema: aiPapers/_shared/{paperId}/title  (matches production R136a / R137b
 * pattern in handlers/search-papers.ts).
 */
async function enrichTitles(
  paperIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(paperIds));
  if (uniqueIds.length === 0) return new Map();

  const titles = new Map<string, string>();
  await Promise.all(
    uniqueIds.map(async (pid) => {
      try {
        const ref = admin.database().ref(`aiPapers/_shared/${pid}/title`);
        const snap = await ref.once("value");
        titles.set(pid, snap.val() || pid);
      } catch {
        titles.set(pid, pid);
      }
    }),
  );
  return titles;
}

export async function searchPapers(
  args: SearchPapersArgs,
): Promise<SearchPapersResult> {
  const startMs = Date.now();

  const queryText = (args.query || "").trim().slice(0, 1000);
  if (!queryText) {
    return {
      total: 0,
      chunks: [],
      message: "Query rỗng — không tìm kiếm được.",
      searchMs: 0,
    };
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, args.limit || DEFAULT_LIMIT));
  const mode: SearchMode = args.mode || "hybrid";
  const config = DEFAULT_SEARCH_CONFIG;

  const apiKey = process.env.VOYAGE_API_KEY || "";
  if (!apiKey) {
    return {
      total: 0,
      chunks: [],
      message: "VOYAGE_API_KEY missing trong env — không thể search.",
      searchMs: Date.now() - startMs,
    };
  }

  const firestore = getFirestore(FIRESTORE_DB);

  const ctx: SearchEngineContext = {
    embed: makeEmbedFn(apiKey),
    firestore,
  };

  const searchQuery: SearchQuery = {
    text: queryText,
    limit: Math.min(MAX_LIMIT, config.rerankerCandidates),
    paperId: args.paperId,
  };

  let results;
  try {
    const engine = createSearchEngine(mode, config);
    results = await engine.search(searchQuery, ctx);
  } catch (e: any) {
    logger.error("[searchPapers tool] engine.search failed", {
      error: String(e?.message || e),
      mode,
    });
    return {
      total: 0,
      chunks: [],
      message: `Lỗi khi tìm kiếm: ${e?.message || String(e)}`,
      searchMs: Date.now() - startMs,
    };
  }

  // Optional rerank — graceful fallback on failure
  if (config.rerankerEnabled && results.length > 1) {
    try {
      const reranker = new VoyageReranker({
        apiKey,
        model: config.rerankerModel,
      });
      results = await reranker.rerank({
        query: queryText,
        candidates: results,
        topK: limit,
      });
    } catch (e) {
      logger.warn("[searchPapers tool] rerank failed, returning original ranking", {
        error: String(e),
      });
      results = results.slice(0, limit);
    }
  } else {
    results = results.slice(0, limit);
  }

  const titles = await enrichTitles(
    results.map((r) => r.paperId),
  );

  const chunks: SearchPapersChunk[] = results.map((r, i) => {
    const text = (r.text || "").length > CHUNK_TEXT_MAX_CHARS
      ? r.text.slice(0, CHUNK_TEXT_MAX_CHARS) + "…"
      : r.text || "";
    const out: SearchPapersChunk = {
      position: i + 1,
      chunkId: r.chunkId,
      paperId: r.paperId,
      paperTitle: titles.get(r.paperId) || r.paperId,
      sectionPath: r.sectionPath || "",
      text,
    };
    if (typeof r.rerankScore === "number") out.rerankScore = r.rerankScore;
    if (typeof r.vectorScore === "number") out.vectorScore = r.vectorScore;
    if (typeof r.bm25Score === "number") out.bm25Score = r.bm25Score;
    return out;
  });

  const searchMs = Date.now() - startMs;
  let message: string | undefined;
  if (chunks.length === 0) {
    message =
      "Không tìm thấy đoạn nào liên quan trong corpus papers. Có thể corpus chưa có paper về chủ đề này, hoặc query cần cụ thể hơn.";
  }

  logger.info("[searchPapers tool] completed", {
    query: queryText.slice(0, 80),
    mode,
    limit,
    returned: chunks.length,
    searchMs,
  });

  return {
    total: chunks.length,
    chunks,
    message,
    searchMs,
  };
}
