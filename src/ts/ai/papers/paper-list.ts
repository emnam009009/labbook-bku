/**
 * Paper List — Round 132b
 *
 * Subscribe RTDB `aiPapers/_shared` → render table real-time.
 * Delete action (superadmin only).
 */
// @ts-nocheck

import { storage, db } from "../../firebase";
import { ref as dbRef, onValue, remove, off } from "firebase/database";
import { ref as stRef, deleteObject } from "firebase/storage";
import { showToast } from "../../ui/toast";
import type { Paper } from "../papers/types";

const SHARED_PATH = "aiPapers/_shared";
const TABLE_BODY_ID = "ai-paper-list-tbody";
const COUNT_ID = "ai-paper-list-count";

let _unsubscribe: (() => void) | null = null;

// ─── Format helpers ────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"\']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\'": "&#39;"
  } as any)[c]);
}

// ─── Status badge ──────────────────────────────────────────
function renderStatusBadge(paper: Paper): string {
  const status = paper.processingStatus || "uploaded";
  const meta: Record<string, { label: string; cls: string; icon: string }> = {
    uploaded:   { label: "Chưa OCR",   cls: "is-pending", icon: "⏸" },
    extracting: { label: "Đang OCR",   cls: "is-running", icon: "⏳" },
    extracted:  { label: "Đã OCR",     cls: "is-success", icon: "✓" },
    chunking:   { label: "Đang chunk", cls: "is-running", icon: "⏳" },
    chunked:    { label: "Đã chunk",   cls: "is-success", icon: "✓" },
    embedding:  { label: "Đang embed", cls: "is-running", icon: "⏳" },
    embedded:   { label: "Sẵn sàng",   cls: "is-ready",   icon: "✅" },
    indexed:    { label: "Sẵn sàng",   cls: "is-ready",   icon: "🔍" },
    error:      { label: "Lỗi",        cls: "is-error",   icon: "✗" },
  };
  const s = meta[status] || meta.uploaded;
  const tooltip = paper.errorMessage ? escapeHtml(paper.errorMessage) : `${s.label} (${escapeHtml(status)})`;
  return `<span class="ai-paper-badge ${s.cls}" title="${tooltip}">${s.icon} ${s.label}</span>`;
}

// ─── Render ────────────────────────────────────────────────
function renderRow(paper: Paper): string {
  const isError = paper.processingStatus === "error";
  return `
    <tr data-paper-id="${escapeHtml(paper.paperId)}">
      <td class="ai-paper-row__title" title="${escapeHtml(paper.title)}">
        <span class="ai-paper-row__icon">📄</span>
        ${escapeHtml(paper.title)}
      </td>
      <td class="ai-paper-row__size">${formatSize(paper.sizeBytes)}</td>
      <td class="ai-paper-row__status">${renderStatusBadge(paper)}</td>
      <td class="ai-paper-row__date">${formatDate(paper.uploadedAt)}</td>
      <td class="ai-paper-row__actions">
        ${isError ? `<button class="ai-paper-row__btn ai-paper-row__btn--retry" type="button"
                data-action="ai-paper-reextract"
                data-paper-id="${escapeHtml(paper.paperId)}"
                title="Trích xuất lại">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
        </button>` : ""}
        <button class="ai-paper-row__btn" type="button"
                data-action="ai-paper-delete"
                data-paper-id="${escapeHtml(paper.paperId)}"
                data-storage-path="${escapeHtml(paper.storagePath)}"
                title="Xóa">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </td>
    </tr>
  `;
}

function renderEmpty(): string {
  return `
    <tr><td colspan="4" class="ai-paper-list__empty">
      <p>Chưa có tài liệu nào.</p>
      <p style="font-size:13px;color:#94a3b8;">Upload PDF đầu tiên ở phía trên ↑</p>
    </td></tr>
  `;
}

// ─── Subscribe ─────────────────────────────────────────────
export function startPaperListListener(): void {
  if (_unsubscribe) return; // đã subscribe
  const r = dbRef(db, SHARED_PATH);
  const cb = onValue(r, (snap) => {
    const tbody = document.getElementById(TABLE_BODY_ID);
    const count = document.getElementById(COUNT_ID);
    if (!tbody) return;

    const val = snap.val() as Record<string, Paper> | null;
    if (!val) {
      tbody.innerHTML = renderEmpty();
      if (count) count.textContent = "0";
      return;
    }

    // Sort by uploadedAt desc
    const papers = Object.entries(val)
      .map(([id, p]) => ({ ...p, paperId: id }))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

    tbody.innerHTML = papers.map(renderRow).join("");
    if (count) count.textContent = String(papers.length);
  });
  _unsubscribe = () => off(r, "value", cb);
}

export function stopPaperListListener(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}

// ─── Delete handler ────────────────────────────────────────
export async function onPaperDelete(target: HTMLElement): Promise<void> {
  const paperId = target.dataset.paperId;
  const storagePath = target.dataset.storagePath;
  if (!paperId) return;

  if (!confirm("Xóa paper này? Không thể khôi phục.")) return;

  try {
    // 1. Delete RTDB metadata
    await remove(dbRef(db, `${SHARED_PATH}/${paperId}`));

    // 2. Delete Storage file (best effort)
    if (storagePath) {
      try {
        await deleteObject(stRef(storage, storagePath));
      } catch (e: any) {
        // File mồ côi không phải lỗi nghiêm trọng
        console.warn("[Paper] Storage delete failed:", e.message);
      }
    }

    showToast("Đã xóa paper", "success");
  } catch (e: any) {
    showToast(`Xóa thất bại: ${e.message}`, "danger");
  }
}
