/**
 * Confirm Action — Round 115a
 *
 * Cloud Function endpoint that commits an action draft to RTDB.
 *
 * Flow:
 * 1. AI generates draft via toolExecutor (returns ActionDraft to frontend)
 * 2. Frontend renders Confirmation UI
 * 3. User clicks "Confirm" → frontend POSTs draft + signal to /confirmAction
 * 4. This handler verifies role, validates draft, writes to DB, logs audit
 *
 * Permission: superadmin only.
 */

import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { commitDraft, ActionDraft } from "../tools/actions";

setGlobalOptions({ region: "asia-southeast1" });

export const confirmAction = onRequest(
  {
    cors: true,
    memory: "256MiB",
    timeoutSeconds: 30,
    maxInstances: 5,
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Verify Firebase Auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing Authorization" });
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

    const uid = decodedToken.uid;

    // Verify role === "superadmin"
    let role: string | null = null;
    try {
      const snap = await admin.database().ref(`users/${uid}/role`).once("value");
      role = snap.val();
    } catch (e) {
      console.warn("[confirmAction] Failed to read role:", e);
    }

    if (role !== "superadmin") {
      res.status(403).json({
        error: "Chỉ superadmin được thực hiện action. Role hiện tại: " + (role || "unknown"),
      });
      return;
    }

    // Validate draft structure
    const draft = req.body as ActionDraft;
    if (!draft || !draft.type) {
      res.status(400).json({ error: "Missing draft.type" });
      return;
    }

    const validTypes = ["experiment-draft", "chemical-stock-draft", "booking-draft", "experiment-result-draft"];
    if (!validTypes.includes(draft.type)) {
      res.status(400).json({ error: `Invalid draft type: ${draft.type}` });
      return;
    }

    if (!draft.payload || !draft.targetPath) {
      res.status(400).json({ error: "Missing payload or targetPath" });
      return;
    }

    // Commit
    const result = await commitDraft(uid, draft);

    if (!result.success) {
      res.status(500).json({ error: result.error || "Commit failed" });
      return;
    }

    console.log(
      `[confirmAction] uid=${uid} type=${draft.type} resultKey=${result.resultKey}`
    );

    res.status(200).json({
      success: true,
      resultKey: result.resultKey,
      message: getSuccessMessage(draft),
    });
  }
);

function getSuccessMessage(draft: ActionDraft): string {
  if (draft.type === "experiment-draft") {
    return draft.category === "hydro"
      ? `Đã tạo thí nghiệm thủy nhiệt ${draft.preview.code}`
      : `Đã tạo phép đo điện hóa ${draft.preview.code}`;
  }
  if (draft.type === "chemical-stock-draft") {
    return `Đã cập nhật ${draft.preview.field} của ${draft.preview.chemicalName}: ${draft.preview.oldValue} → ${draft.preview.newValue} ${draft.preview.unit}`;
  }
  if (draft.type === "booking-draft") {
    return `Đã đặt lịch ${draft.preview.equipmentName} ${draft.preview.date} ${draft.preview.startTime}-${draft.preview.endTime}`;
  }
  return "Action completed";
}
