/**
 * Paper Upload — Round 132b
 *
 * Upload PDF lên Firebase Storage `papers/_shared/{paperId}/{filename}`
 * + ghi metadata RTDB `aiPapers/_shared/{paperId}`.
 *
 * Pipeline:
 * 1. Validate file (PDF, ≤50MB)
 * 2. Compute SHA-256 → check dedup (query RTDB by sha256)
 * 3. Generate paperId
 * 4. Upload Storage với progress
 * 5. Write RTDB metadata
 * 6. Toast success
 */
// @ts-nocheck

import { storage, db } from "../../firebase";
import { ref as stRef, uploadBytesResumable } from "firebase/storage";
import { ref as dbRef, push, set, query, orderByChild, equalTo, get } from "firebase/database";
import { currentAuth } from "../../auth";
import { showToast } from "../../ui/toast";
import { MAX_FILE_SIZE, ACCEPTED_MIME, type Paper } from "../papers/types";

const SHARED_PATH = "aiPapers/_shared";
const STORAGE_PREFIX = "papers/_shared";

// ─── SHA-256 ───────────────────────────────────────────────
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Dedup check ───────────────────────────────────────────
async function findDuplicate(sha256: string): Promise<Paper | null> {
  const q = query(dbRef(db, SHARED_PATH), orderByChild("sha256"), equalTo(sha256));
  const snap = await get(q);
  if (!snap.exists()) return null;
  const val = snap.val() as Record<string, Paper>;
  const firstKey = Object.keys(val)[0];
  return firstKey ? { ...val[firstKey], paperId: firstKey } : null;
}

// ─── Validate ──────────────────────────────────────────────
function validateFile(file: File): string | null {
  if (!ACCEPTED_MIME.includes(file.type) && !file.name.toLowerCase().endsWith(".pdf")) {
    return "Chỉ chấp nhận file PDF (.pdf)";
  }
  if (file.size > MAX_FILE_SIZE) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `File quá lớn (${mb} MB). Tối đa 100 MB.`;
  }
  if (file.size === 0) {
    return "File rỗng";
  }
  return null;
}

// ─── Generate paperId ──────────────────────────────────────
function genPaperId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `paper-${ts}-${rand}`;
}

// ─── Sanitize filename ─────────────────────────────────────
function sanitizeFilename(name: string): string {
  // Loại bỏ ký tự đặc biệt, giữ alphanumeric + dấu phổ biến
  return name.replace(/[^\w\s.\-()]/g, "_").slice(0, 200);
}

// ════════════════════════════════════════════════════════════
// MAIN: uploadPaper
// ════════════════════════════════════════════════════════════

export async function uploadPaper(file: File): Promise<string | null> {
  // 1. Validate
  const errMsg = validateFile(file);
  if (errMsg) {
    showToast(errMsg, "danger");
    return null;
  }

  // 2. SHA-256
  const buf = await file.arrayBuffer();
  const sha256 = await sha256Hex(buf);

  // 3. Dedup
  showToast("Đang kiểm tra trùng lặp...", "info");
  const existing = await findDuplicate(sha256);
  if (existing) {
    showToast(`Paper đã có trong thư viện: "${existing.title}"`, "warn");
    return null;
  }

  // 4. Upload
  const paperId = genPaperId();
  const safeFilename = sanitizeFilename(file.name);
  const storagePath = `${STORAGE_PREFIX}/${paperId}/${safeFilename}`;

  return new Promise((resolve) => {
    const fileRef = stRef(storage, storagePath);
    const task = uploadBytesResumable(fileRef, file, {
      contentType: "application/pdf",
      customMetadata: { uid: currentAuth.uid || "", paperId },
    });

    // Progress UI
    const progressEl = document.getElementById("ai-paper-upload-progress");
    const progressBar = document.getElementById("ai-paper-upload-progress-bar");
    const progressText = document.getElementById("ai-paper-upload-progress-text");
    if (progressEl) progressEl.style.display = "block";

    task.on(
      "state_changed",
      (snap) => {
        const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
        if (progressBar) progressBar.style.width = `${pct.toFixed(1)}%`;
        if (progressText) progressText.textContent = `${pct.toFixed(0)}% - ${file.name}`;
      },
      (err) => {
        if (progressEl) progressEl.style.display = "none";
        showToast(`Upload thất bại: ${err.message}`, "danger");
        resolve(null);
      },
      async () => {
        // Upload done → write metadata
        try {
          const meta: Paper = {
            paperId,
            title: file.name.replace(/\.pdf$/i, ""),
            filename: safeFilename,
            sha256,
            sizeBytes: file.size,
            uploadedAt: new Date().toISOString(),
            uploadedBy: currentAuth.uid || "",
            uploadedByName: currentAuth.displayName || "",
            storagePath,
            processingStatus: "uploaded",
          };
          await set(dbRef(db, `${SHARED_PATH}/${paperId}`), meta);
          if (progressEl) progressEl.style.display = "none";
          showToast(`Đã thêm: ${meta.title}`, "success");
          resolve(paperId);
        } catch (e: any) {
          if (progressEl) progressEl.style.display = "none";
          showToast(`Lưu metadata thất bại: ${e.message}`, "danger");
          resolve(null);
        }
      }
    );
  });
}

// ════════════════════════════════════════════════════════════
// File picker handlers (UI events)
// ════════════════════════════════════════════════════════════

export function onPaperPickClick(): void {
  const input = document.getElementById("ai-paper-file-input") as HTMLInputElement | null;
  input?.click();
}

export async function onPaperFileSelected(target: HTMLInputElement): Promise<void> {
  const files = target.files;
  if (!files || files.length === 0) return;
  for (const file of Array.from(files)) {
    await uploadPaper(file);
  }
  target.value = ""; // reset input
}

export function onPaperDragOver(_target: HTMLElement, ev: Event): void {
  ev.preventDefault();
  ev.stopPropagation();
  const dropzone = document.getElementById("ai-paper-dropzone");
  dropzone?.classList.add("is-dragover");
}

export function onPaperDragLeave(_target: HTMLElement, ev: Event): void {
  ev.preventDefault();
  ev.stopPropagation();
  const dropzone = document.getElementById("ai-paper-dropzone");
  dropzone?.classList.remove("is-dragover");
}

export async function onPaperDrop(_target: HTMLElement, ev: DragEvent): Promise<void> {
  ev.preventDefault();
  ev.stopPropagation();
  const dropzone = document.getElementById("ai-paper-dropzone");
  dropzone?.classList.remove("is-dragover");
  const files = ev.dataTransfer?.files;
  if (!files || files.length === 0) return;
  for (const file of Array.from(files)) {
    await uploadPaper(file);
  }
}
