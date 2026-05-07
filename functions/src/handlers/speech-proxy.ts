/**
 * Speech-to-Text Proxy — Round 114
 *
 * Forwards audio to Google Cloud Speech-to-Text v2 (Chirp 2 model).
 *
 * - Verifies Firebase Auth + role (admin/superadmin/member)
 * - Receives base64 audio (WebM/Opus from MediaRecorder)
 * - Calls Speech-to-Text v2 with multi-language hints (vi-VN, en-US)
 * - Returns transcript + detected language + confidence
 *
 * Authentication: uses default service account of Cloud Functions
 * (478810777276-compute@developer.gserviceaccount.com).
 * The service account needs role "Cloud Speech Client" on the project.
 *
 * @see https://cloud.google.com/speech-to-text/v2/docs
 */

import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { GoogleAuth } from "google-auth-library";

setGlobalOptions({ region: "asia-southeast1" });

const PROJECT_ID = "lab-manager-268a6";
const RECOGNIZER_LOCATION = "asia-southeast1";
const RECOGNIZER_NAME = "_"; // Default recognizer (no setup needed)
const SPEECH_API_BASE = `https://${RECOGNIZER_LOCATION}-speech.googleapis.com/v2`;

// Auth client cho Google Cloud APIs
let authClient: GoogleAuth | null = null;
function getAuthClient(): GoogleAuth {
  if (!authClient) {
    authClient = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return authClient;
}

interface TranscribeRequest {
  audioBase64: string;
  mimeType?: string; // e.g., "audio/webm;codecs=opus"
  languageCodes?: string[]; // e.g., ["vi-VN", "en-US"]
}

interface TranscribeResponse {
  transcript: string;
  confidence: number;
  languageCode: string;
}

export const speechProxy = onRequest(
  {
    cors: true,
    memory: "512MiB",
    timeoutSeconds: 60,
    maxInstances: 5,
  },
  async (req, res) => {
    // ── 1. Method check ──
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // ── 2. Verify Firebase Auth ──
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing Authorization header" });
      return;
    }

    const idToken = authHeader.slice(7);
    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (e: any) {
      res.status(401).json({ error: "Invalid token", details: e.message });
      return;
    }

    // ── 3. Role check (admin/superadmin/member can use voice) ──
    const uid = decodedToken.uid;
    let role: string | null = null;
    try {
      const snap = await admin
        .database()
        .ref(`users/${uid}/role`)
        .once("value");
      role = snap.val();
    } catch (e) {
      console.warn("[speechProxy] Failed to read role:", e);
    }

    if (
      role !== "admin" &&
      role !== "superadmin" &&
      role !== "member"
    ) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }

    // ── 4. Validate request body ──
    const body = req.body as TranscribeRequest;
    if (!body.audioBase64) {
      res.status(400).json({ error: "Missing audioBase64" });
      return;
    }
    if (body.audioBase64.length > 10 * 1024 * 1024) {
      // 10MB limit (đủ cho ~5 phút audio Opus)
      res.status(413).json({ error: "Audio too large (max 10MB)" });
      return;
    }

    // Round 114b3: Force vi-VN single language.
    // Region asia-southeast1 không support multi-language recognition
    // (chỉ available ở eu/global/us). Single lang vi-VN cho latency thấp +
    // Chirp 2 vẫn nhận diện tốt từ chuyên ngành.
    const languageCodes = ["vi-VN"];

    // ── 5. Call Speech-to-Text v2 API ──
    let accessToken: string;
    try {
      const auth = getAuthClient();
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      accessToken = tokenResponse.token || "";
      if (!accessToken) {
        throw new Error("Empty access token");
      }
    } catch (e: any) {
      console.error("[speechProxy] Auth failed:", e);
      res
        .status(500)
        .json({ error: "Failed to authenticate with Cloud Speech", details: e.message });
      return;
    }

    const recognizerPath = `projects/${PROJECT_ID}/locations/${RECOGNIZER_LOCATION}/recognizers/${RECOGNIZER_NAME}`;

    const speechPayload = {
      config: {
        autoDecodingConfig: {}, // Auto-detect codec from audio
        languageCodes,
        model: "chirp_2", // Latest multilingual model
        features: {
          enableAutomaticPunctuation: true,
        },
      },
      content: body.audioBase64,
    };

    let speechResponse: Response;
    try {
      speechResponse = await fetch(
        `${SPEECH_API_BASE}/${recognizerPath}:recognize`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-goog-user-project": PROJECT_ID,
          },
          body: JSON.stringify(speechPayload),
        }
      );
    } catch (e: any) {
      console.error("[speechProxy] Network error:", e);
      res.status(502).json({ error: "Speech API network error", details: e.message });
      return;
    }

    if (!speechResponse.ok) {
      const errText = await speechResponse.text().catch(() => "");
      console.error(
        "[speechProxy] Speech API error:",
        speechResponse.status,
        errText.slice(0, 500)
      );
      res.status(speechResponse.status).json({
        error: `Speech API HTTP ${speechResponse.status}`,
        details: errText.slice(0, 500),
      });
      return;
    }

    let speechJson: any;
    try {
      speechJson = await speechResponse.json();
    } catch (e: any) {
      res.status(500).json({ error: "Invalid Speech API response" });
      return;
    }

    // ── 6. Extract transcript ──
    const results = speechJson.results || [];
    if (results.length === 0) {
      res.status(200).json({
        transcript: "",
        confidence: 0,
        languageCode: languageCodes[0],
      } as TranscribeResponse);
      return;
    }

    let bestTranscript = "";
    let bestConfidence = 0;
    let detectedLang = languageCodes[0];

    for (const result of results) {
      const alt = result.alternatives?.[0];
      if (!alt) continue;
      bestTranscript += (bestTranscript ? " " : "") + (alt.transcript || "");
      if ((alt.confidence || 0) > bestConfidence) {
        bestConfidence = alt.confidence || 0;
      }
      if (result.languageCode) {
        detectedLang = result.languageCode;
      }
    }

    const response: TranscribeResponse = {
      transcript: bestTranscript.trim(),
      confidence: bestConfidence,
      languageCode: detectedLang,
    };

    console.log(
      `[speechProxy] uid=${uid} lang=${detectedLang} ` +
        `confidence=${bestConfidence.toFixed(2)} ` +
        `transcript_len=${response.transcript.length}`
    );

    res.status(200).json(response);
  }
);
