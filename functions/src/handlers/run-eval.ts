/**
 * Run Eval — HTTPS Cloud Function
 * Round 137b-eval+obs
 *
 * Executes ground truth dataset through searchPapers pipeline,
 * persists results to Firestore aiEvalRuns collection.
 *
 * Auth: superadmin only
 *
 * Request:  { modes?: ["hybrid"], limit?: 10, datasetVersion?: "v1.0-seed" }
 * Response: { runId, summary }
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";
import { createSearchEngine } from "../search/engine";
import { DEFAULT_SEARCH_CONFIG } from "../search/config";
import type { SearchMode, SearchEngineContext } from "../search/types";
import { GROUND_TRUTH } from "../eval/ground-truth";
import { runEvalDataset } from "../eval/runner";
import type { EvalRun } from "../eval/types";
import { randomUUID } from "crypto";

const voyageKey = defineSecret("VOYAGE_API_KEY");

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-large";
const FIRESTORE_DB = "labbook";
const EVAL_RUNS_COLLECTION = "aiEvalRuns";

interface RunEvalRequest {
  modes?: SearchMode[];
  limit?: number;
  datasetVersion?: string;  // currently informational; only one dataset compiled in
}

const VALID_MODES: SearchMode[] = ["vector", "bm25", "hybrid"];

export const runEval = onRequest(
  {
    region: "asia-southeast1",
    secrets: [voyageKey],
    timeoutSeconds: 540,    // 50 queries × 3 modes × ~2s = 300s, plenty of headroom
    memory: "1GiB",
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
      const auth = await verifyAuth(req, "superadmin");
      uid = auth.uid;
    } catch (e) {
      if (e instanceof AuthError) { res.status(e.statusCode).json({ error: e.message }); return; }
      res.status(500).json({ error: "Auth failed" }); return;
    }

    const body = (req.body || {}) as RunEvalRequest;
    const requestedModes = (body.modes && Array.isArray(body.modes))
      ? body.modes.filter((m): m is SearchMode => VALID_MODES.includes(m))
      : ["hybrid" as SearchMode];
    const modes: SearchMode[] = requestedModes.length > 0 ? requestedModes : ["hybrid"];
    const limit = Math.min(50, Math.max(1, body.limit || 10));

    const runId = `eval-${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const startedAt = Date.now();

    logger.info(`[runEval] uid=${uid} runId=${runId} modes=${modes.join(",")} dataset=${GROUND_TRUTH.version}`);

    try {
      const { getFirestore } = await import("firebase-admin/firestore");
      const db = getFirestore(FIRESTORE_DB);

      const apiKey = voyageKey.value();
      const embed = async (text: string): Promise<number[]> => {
        const resp = await fetch(VOYAGE_API_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ input: [text], model: VOYAGE_MODEL, input_type: "query" }),
        });
        if (!resp.ok) throw new Error(`Voyage error ${resp.status}`);
        const data = await resp.json() as any;
        return data.data?.[0]?.embedding || [];
      };

      const ctx: SearchEngineContext = { embed, firestore: db };
      const config = DEFAULT_SEARCH_CONFIG;

      // Search wrapper for runner
      const searchFn = async ({ query, mode, limit }: { query: string; mode: SearchMode; limit: number }) => {
        const engine = createSearchEngine(mode, config);
        const startMs = Date.now();
        const results = await engine.search({ text: query, limit }, ctx);
        const trimmed = results.slice(0, limit);
        return {
          results: trimmed.map((r) => ({ paperId: r.paperId })),
          searchMs: Date.now() - startMs,
        };
      };

      const { perQuery, summary } = await runEvalDataset(
        GROUND_TRUTH,
        modes,
        searchFn,
        limit,
      );

      const completedAt = Date.now();
      const evalRun: EvalRun = {
        runId,
        datasetVersion: GROUND_TRUTH.version,
        modes,
        totalQueries: perQuery.length,
        summary,
        startedAt,
        completedAt,
        totalMs: completedAt - startedAt,
        status: summary.failedQueries === 0 ? "ok" : "partial",
      };

      // Persist run summary
      await db.collection(EVAL_RUNS_COLLECTION).doc(runId).set(evalRun);

      // Persist per-query results in subcollection
      const subColl = db.collection(EVAL_RUNS_COLLECTION).doc(runId).collection("queries");
      const BATCH_SIZE = 500;
      for (let i = 0; i < perQuery.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const r of perQuery.slice(i, i + BATCH_SIZE)) {
          const docId = `${r.queryId}-${r.mode}`;
          batch.set(subColl.doc(docId), r);
        }
        await batch.commit();
      }

      logger.info(`[runEval] runId=${runId} done in ${evalRun.totalMs}ms, summary:`, summary as any);
      res.status(200).json({ success: true, runId, summary });
    } catch (e: any) {
      logger.error(`[runEval] Exception runId=${runId}`, e);
      res.status(500).json({ error: e?.message || "Eval failed", runId });
    }
  }
);
