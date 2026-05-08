/**
 * Search Papers — Round 136a
 *
 * RAG retrieval: query string → embedding → Firestore vectorSearch → top K chunks.
 * Read-only, available to all authenticated users.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";

const voyageKey = defineSecret("VOYAGE_API_KEY");

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-large";
const FIRESTORE_DB = "labbook";
const COLLECTION = "aiChunks";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

interface SearchRequest {
  query: string;
  limit?: number;
  paperId?: string;  // optional: filter by paper
}

interface ChunkResult {
  chunkId: string;
  paperId: string;
  chunkIndex: number;
  sectionPath: string;
  text: string;
  distance?: number;
}

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

    const body = req.body as SearchRequest;
    if (!body?.query || typeof body.query !== "string") {
      res.status(400).json({ error: "Missing query" });
      return;
    }
    const query = body.query.trim().slice(0, 1000);
    if (!query) { res.status(400).json({ error: "Empty query" }); return; }

    const limit = Math.min(MAX_LIMIT, Math.max(1, body.limit || DEFAULT_LIMIT));
    const paperFilter = body.paperId;

    logger.info(`[searchPapers] uid=${uid} query="${query.slice(0, 100)}" limit=${limit}`);

    try {
      // 1. Embed query
      const apiKey = voyageKey.value();
      const embedResp = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: [query],
          model: VOYAGE_MODEL,
          input_type: "query",
        }),
      });
      if (!embedResp.ok) {
        const errText = await embedResp.text();
        logger.error(`[searchPapers] Voyage error ${embedResp.status}: ${errText.slice(0, 300)}`);
        res.status(502).json({ error: `Embed failed: ${errText.slice(0, 200)}` });
        return;
      }
      const embedData = await embedResp.json() as any;
      const queryVector = embedData.data?.[0]?.embedding;
      if (!queryVector || !Array.isArray(queryVector)) {
        res.status(500).json({ error: "Invalid embedding response" });
        return;
      }

      // 2. Firestore vectorSearch
      const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
      const db = getFirestore(FIRESTORE_DB);

      let baseQuery: any = db.collection(COLLECTION);
      if (paperFilter) {
        baseQuery = baseQuery.where("paperId", "==", paperFilter);
      }

      const vectorQuery = baseQuery.findNearest({
        vectorField: "embedding",
        queryVector: FieldValue.vector(queryVector),
        limit,
        distanceMeasure: "COSINE",
        distanceResultField: "_distance",
      });

      const snap = await vectorQuery.get();
      const results: ChunkResult[] = snap.docs.map((d: any) => {
        const data = d.data();
        return {
          chunkId: d.id,
          paperId: data.paperId,
          chunkIndex: data.chunkIndex,
          sectionPath: data.sectionPath,
          text: data.text,
          distance: data._distance,
        };
      });

      logger.info(`[searchPapers] Returned ${results.length} chunks for query="${query.slice(0, 50)}"`);

      // 3. Enrich với paper title (batch fetch RTDB)
      const paperIds = [...new Set(results.map((r) => r.paperId))];
      const titles: Record<string, string> = {};
      await Promise.all(paperIds.map(async (pid) => {
        const ref = admin.database().ref(`aiPapers/_shared/${pid}/title`);
        const snap = await ref.once("value");
        titles[pid] = snap.val() || pid;
      }));

      const enrichedResults = results.map((r) => ({
        ...r,
        paperTitle: titles[r.paperId] || r.paperId,
      }));

      res.status(200).json({
        success: true,
        query,
        count: enrichedResults.length,
        results: enrichedResults,
      });
    } catch (e: any) {
      logger.error(`[searchPapers] Exception`, { error: String(e), stack: e?.stack });
      res.status(500).json({ error: e?.message || "Search failed" });
    }
  }
);
