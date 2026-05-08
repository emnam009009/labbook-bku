/**
 * Search Papers — Round 137b (Hybrid retrieval)
 *
 * Pipeline:
 *   query → SearchEngine (vector | bm25 | hybrid) → top-K chunks → enrich titles
 *
 * Backward compatible with R136a callers: response shape preserved,
 * new score fields added optionally, request fields `mode`/`retrievalDepth`
 * are optional with sensible defaults.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";
import { createSearchEngine } from "../search/engine";
import { DEFAULT_SEARCH_CONFIG } from "../search/config";
import type { SearchMode, SearchEngineContext } from "../search/types";
import { createTracer } from "../observability/tracer";
import { FirestoreTraceSink } from "../observability/trace-sink";
import { VoyageReranker, type Reranker } from "../search/reranker";

const voyageKey = defineSecret("VOYAGE_API_KEY");

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-large";
const FIRESTORE_DB = "labbook";

interface SearchRequest {
  query: string;
  limit?: number;
  paperId?: string;
  // R137b additions (all optional)
  mode?: SearchMode;
  retrievalDepth?: number;
  // R137c1: rerank toggle (default config.rerankerEnabled = true)
  rerank?: boolean;
}

const VALID_MODES: SearchMode[] = ["vector", "bm25", "hybrid"];

export const searchPapers = onRequest(
  {
    region: "asia-southeast1",
    secrets: [voyageKey],
    timeoutSeconds: 60,
    memory: "512MiB",
    cors: true,
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    let uid: string;
    try {
      const auth = await verifyAuth(req);
      uid = auth.uid;
    } catch (e) {
      if (e instanceof AuthError) { res.status(401).json({ error: e.message }); return; }
      res.status(500).json({ error: "Auth failed" });
      return;
    }

    const body = (req.body || {}) as SearchRequest;
    if (!body.query || typeof body.query !== "string") {
      res.status(400).json({ error: "Missing query" });
      return;
    }
    const queryText = body.query.trim().slice(0, 1000);
    if (!queryText) { res.status(400).json({ error: "Empty query" }); return; }

    const config = DEFAULT_SEARCH_CONFIG;
    const limit = Math.min(config.maxLimit, Math.max(1, body.limit || config.defaultLimit));
    const mode: SearchMode = (body.mode && VALID_MODES.includes(body.mode))
      ? body.mode
      : "hybrid";
    const retrievalDepth = body.retrievalDepth
      ? Math.min(config.maxRetrievalDepth, Math.max(1, body.retrievalDepth))
      : undefined;
    // R137c1: rerank toggle — explicit body.rerank wins, else config default
    const rerankEnabled = typeof body.rerank === "boolean"
      ? body.rerank
      : config.rerankerEnabled;

    logger.info(
      `[searchPapers] uid=${uid} mode=${mode} rerank=${rerankEnabled} query="${queryText.slice(0, 80)}" limit=${limit}`
    );

    // R137b-eval+obs: create tracer for this request
    const tracer = createTracer({
      endpoint: "searchPapers",
      userId: uid,
      attributes: { mode, limit, paperId: body.paperId, retrievalDepth, rerank: rerankEnabled },
    });
    tracer.setQuery(queryText);

    try {
      // Build context: Firestore + embedding fn (only invoked if engine needs it)
      const { getFirestore } = await import("firebase-admin/firestore");
      const db = getFirestore(FIRESTORE_DB);
      const traceSink = new FirestoreTraceSink(db);

      const apiKey = voyageKey.value();
      const embed = async (text: string): Promise<number[]> => {
        return tracer.span("embed", async () => {
          const resp = await fetch(VOYAGE_API_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              input: [text],
              model: VOYAGE_MODEL,
              input_type: "query",
            }),
          });
          if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Voyage error ${resp.status}: ${errText.slice(0, 200)}`);
          }
          const data = await resp.json() as any;
          const vec = data.data?.[0]?.embedding;
          if (!vec || !Array.isArray(vec)) {
            throw new Error("Invalid embedding response");
          }
          // Track cost: rough estimate, Voyage doesn't return usage in embed response
          // Approximate: text length / 4 ≈ tokens
          tracer.recordCost(VOYAGE_MODEL as any, { inputTokens: Math.ceil(text.length / 4) }, "embed");
          return vec;
        }, { textLength: text.length });
      };

      const ctx: SearchEngineContext = { embed, firestore: db };
      const engine = createSearchEngine(mode, config);

      // R137c1: when reranking, ensure engine returns enough candidates
      // (default retrievalDepth gives 30 from each, hybrid merges to ~30-60 unique)
      const effectiveRetrievalDepth = rerankEnabled
        ? Math.max(retrievalDepth || 0, config.rerankerCandidates)
        : retrievalDepth;

      const startedAt = Date.now();
      const results = await tracer.span(
        `${mode}_search`,
        () => engine.search(
          { text: queryText, limit, paperId: body.paperId, retrievalDepth: effectiveRetrievalDepth },
          ctx,
        ),
        { mode },
      );
      const searchMs = Date.now() - startedAt;

      // R137c1: rerank stage (graceful fallback on failure)
      let reranked = results;
      if (rerankEnabled && results.length > 1) {
        const reranker: Reranker = new VoyageReranker({
          apiKey,
          model: config.rerankerModel,
          onTokensUsed: (tokens) => {
            tracer.recordCost(config.rerankerModel as any, { inputTokens: tokens }, "rerank");
          },
        });
        try {
          reranked = await tracer.span(
            "rerank",
            () => reranker.rerank({
              query: queryText,
              candidates: results.slice(0, config.rerankerCandidates),
              topK: limit,
            }),
            { model: config.rerankerModel, candidateCount: Math.min(results.length, config.rerankerCandidates) },
          );
        } catch (e) {
          // Span already recorded the error via tracer.span's catch.
          // Fall back to original ranking.
          logger.warn("[searchPapers] rerank failed, using original ranking", { error: String(e) });
          reranked = results;
        }
      }

      // R137b-fix: trim to caller's `limit` (engines return pool size for hybrid merge)
      // After rerank, list is already topK from reranker; slice is idempotent.
      const trimmed = reranked.slice(0, limit);

      logger.info(
        `[searchPapers] mode=${mode} pool=${results.length} reranked=${rerankEnabled} returned=${trimmed.length} in ${searchMs}ms`
      );

      // Enrich with paper titles (RTDB batch fetch — same pattern as R136a)
      const paperIds = [...new Set(trimmed.map((r) => r.paperId))];
      const titles: Record<string, string> = {};
      await Promise.all(paperIds.map(async (pid) => {
        const ref = admin.database().ref(`aiPapers/_shared/${pid}/title`);
        const snap = await ref.once("value");
        titles[pid] = snap.val() || pid;
      }));

      const enriched = trimmed.map((r) => ({
        ...r,
        paperTitle: titles[r.paperId] || r.paperId,
      }));

      // R137b-eval+obs: finalize trace (fire-and-forget — sink swallows errors)
      tracer.recordSpan("enrich_titles", 0, "ok", { paperCount: paperIds.length });
      await tracer.finish(traceSink, { status: "ok" });

      res.status(200).json({
        success: true,
        query: queryText,
        mode,
        rerank: rerankEnabled,
        count: enriched.length,
        searchMs,
        traceId: tracer.traceId,
        results: enriched,
      });
    } catch (e: any) {
      logger.error(`[searchPapers] Exception`, { error: String(e), stack: e?.stack });
      // R137b-eval+obs: persist failed trace too
      try {
        const { getFirestore } = await import("firebase-admin/firestore");
        const db = getFirestore(FIRESTORE_DB);
        await tracer.finish(new FirestoreTraceSink(db), {
          status: "error",
          errorMessage: String(e?.message || e).slice(0, 200),
        });
      } catch { /* swallow */ }
      res.status(500).json({ error: e?.message || "Search failed", traceId: tracer.traceId });
    }
  }
);
