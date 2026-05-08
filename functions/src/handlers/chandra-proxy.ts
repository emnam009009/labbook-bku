/**
 * Chandra OCR Proxy — Round 133a
 *
 * Wraps Datalab.to Marker API (powered by Chandra OCR model).
 * Endpoint: https://www.datalab.to/api/v1/marker
 *
 * Workflow:
 * 1. Verify auth (superadmin only)
 * 2. Download PDF từ Storage
 * 3. Submit to Datalab → get request_check_url
 * 4. Poll until status=complete (timeout 5 min)
 * 5. Save markdown to Storage + update RTDB
 *
 * Cost: $3/1000 pages with mode=balanced.
 * License: Lab BKU dưới $2M revenue → free dùng cho research.
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { logger } from "../utils/logger";
import { verifyAuth, AuthError } from "../utils/auth";
import { publishPaperEvent } from "../utils/pubsub-publisher";

const chandraKey = defineSecret("CHANDRA_API_KEY");

const CHANDRA_API_URL = "https://www.datalab.to/api/v1/marker";
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100;  // ~5 phút @ 3s/poll
const SHARED_PATH = "aiPapers/_shared";

interface ExtractRequest {
  paperId: string;
}

interface DatalabSubmitResponse {
  success: boolean;
  request_id?: string;
  request_check_url?: string;
  error?: string;
}

interface DatalabPollResponse {
  status: "processing" | "complete" | "failed";
  success?: boolean;
  output_format?: string;
  markdown?: string;
  metadata?: {
    page_count?: number;
    [k: string]: any;
  };
  page_count?: number;
  parse_quality_score?: number;
  cost_breakdown?: {
    total_cents: number;
  };
  error?: string;
}

export const chandraProxy = onRequest(
  {
    region: "asia-southeast1",
    secrets: [chandraKey],
    timeoutSeconds: 540,  // 9 phút (longest timeout v2)
    memory: "512MiB",
    cors: true,
  },
  async (req, res) => {
    // ── CORS ──
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    let uid: string;
    try {
      const auth = await verifyAuth(req);
      uid = auth.uid;
      // Superadmin gate
      const userSnap = await admin.database().ref(`users/${uid}/role`).once("value");
      const role = userSnap.val();
      if (role !== "superadmin") {
        res.status(403).json({ error: "Chỉ superadmin được phép trích xuất" });
        return;
      }
    } catch (e) {
      if (e instanceof AuthError) {
        res.status(401).json({ error: e.message });
        return;
      }
      logger.error("[chandraProxy] Auth error", { error: String(e) });
      res.status(500).json({ error: "Auth verification failed" });
      return;
    }

    const body = req.body as ExtractRequest;
    if (!body?.paperId || typeof body.paperId !== "string") {
      res.status(400).json({ error: "Missing or invalid paperId" });
      return;
    }
    const { paperId } = body;

    logger.info(`[chandraProxy] uid=${uid} paperId=${paperId} START`);

    try {
      // 1. Fetch paper metadata
      const paperRef = admin.database().ref(`${SHARED_PATH}/${paperId}`);
      const paperSnap = await paperRef.once("value");
      const paper = paperSnap.val();
      if (!paper) {
        res.status(404).json({ error: "Paper not found" });
        return;
      }

      // 2. Update status to extracting
      await paperRef.update({ processingStatus: "extracting" });

      // 3. Download PDF từ Storage
      const bucket = admin.storage().bucket();
      const fileObj = bucket.file(paper.storagePath);
      const [exists] = await fileObj.exists();
      if (!exists) {
        await paperRef.update({ processingStatus: "error", errorMessage: "PDF không tồn tại trong Storage" });
        res.status(404).json({ error: "PDF file missing in Storage" });
        return;
      }
      const [pdfBuffer] = await fileObj.download();

      // 4. Submit to Datalab
      const formData = new FormData();
      const blob = new Blob([pdfBuffer], { type: "application/pdf" });
      formData.append("file", blob, paper.filename || "paper.pdf");
      formData.append("output_format", "markdown");
      formData.append("mode", "balanced");

      const apiKey = chandraKey.value();
      logger.info(`[chandraProxy] Submitting paperId=${paperId} size=${pdfBuffer.length}`);

      const submitResp = await fetch(CHANDRA_API_URL, {
        method: "POST",
        headers: { "X-API-Key": apiKey },
        body: formData,
      });
      if (!submitResp.ok) {
        const errText = await submitResp.text();
        await paperRef.update({ processingStatus: "error", errorMessage: `Datalab submit failed: ${errText.slice(0, 200)}` });
        logger.error(`[chandraProxy] Submit failed: ${submitResp.status} ${errText.slice(0, 500)}`);
        res.status(502).json({ error: "Chandra API submit failed", detail: errText.slice(0, 200) });
        return;
      }
      const submitData = (await submitResp.json()) as DatalabSubmitResponse;
      if (!submitData.success || !submitData.request_check_url) {
        await paperRef.update({ processingStatus: "error", errorMessage: submitData.error || "No check URL" });
        res.status(502).json({ error: submitData.error || "No request_check_url returned" });
        return;
      }
      const checkUrl = submitData.request_check_url;
      logger.info(`[chandraProxy] Submitted, checkUrl=${checkUrl}`);

      // 5. Poll for completion
      let pollData: DatalabPollResponse | null = null;
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const pollResp = await fetch(checkUrl, { headers: { "X-API-Key": apiKey } });
        if (!pollResp.ok) {
          logger.warn(`[chandraProxy] Poll attempt ${i} failed: ${pollResp.status}`);
          continue;
        }
        pollData = (await pollResp.json()) as DatalabPollResponse;
        if (pollData.status === "complete" || pollData.status === "failed") break;
        // Otherwise still processing
      }

      if (!pollData || pollData.status !== "complete") {
        const errMsg = pollData?.error || "Timeout waiting for extraction";
        await paperRef.update({ processingStatus: "error", errorMessage: errMsg });
        logger.error(`[chandraProxy] Poll failed: ${errMsg}`);
        res.status(504).json({ error: errMsg });
        return;
      }

      const markdown = pollData.markdown || "";
      const numPages = pollData.page_count || pollData.metadata?.page_count || 0;
      const qualityScore = pollData.parse_quality_score || 0;
      const costCents = pollData.cost_breakdown?.total_cents || 0;

      logger.info(`[chandraProxy] Done paperId=${paperId} pages=${numPages} chars=${markdown.length} cost=${costCents}¢`);

      // 6. Save markdown to Storage
      const mdPath = `papers/_shared/${paperId}/extracted.md`;
      const mdFile = bucket.file(mdPath);
      await mdFile.save(markdown, {
        contentType: "text/markdown; charset=utf-8",
        metadata: { uid, paperId },
      });

      // 7. Update RTDB metadata
      await paperRef.update({
        processingStatus: "extracted",
        numPages,
        numChars: markdown.length,
        textPath: mdPath,
        extractedAt: new Date().toISOString(),
        extractionMethod: "chandra-marker",
        extractionQuality: qualityScore,
        extractionCostCents: costCents,
        errorMessage: null,
      });

      // R134b: Publish event để trigger chunkPaper (Pub/Sub chain)
      await publishPaperEvent(paperId, "extracted");

      res.status(200).json({
        success: true,
        paperId,
        numPages,
        numChars: markdown.length,
        qualityScore,
        costCents,
      });
    } catch (e: any) {
      logger.error(`[chandraProxy] Exception paperId=${paperId}`, { error: String(e), stack: e?.stack });
      try {
        await admin.database().ref(`${SHARED_PATH}/${paperId}`).update({
          processingStatus: "error",
          errorMessage: String(e?.message || e).slice(0, 500),
        });
      } catch {}
      res.status(500).json({ error: e?.message || "Internal error" });
    }
  }
);
