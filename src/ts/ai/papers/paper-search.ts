/**
 * Paper Search — Round 136b
 *
 * Call searchPapers Cloud Function (R136a) → render kết quả trong Library tab.
 */
// @ts-nocheck

import { auth } from "../../firebase";
import { showToast } from "../../ui/toast";

const SEARCH_URL =
  "https://asia-southeast1-lab-manager-268a6.cloudfunctions.net/searchPapers";

interface ChunkResult {
  chunkId: string;
  paperId: string;
  paperTitle: string;
  chunkIndex: number;
  sectionPath: string;
  text: string;
  distance?: number;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"\']/g, (c: string) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\'": "&#39;" } as any)[c]
  );
}

function highlightQuery(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  // Simple highlight: case-insensitive whole words from query
  const words = query.trim().split(/\s+/).filter((w: string) => w.length >= 3);
  let result = escaped;
  for (const w of words) {
    const re = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    result = result.replace(re, "<mark>$1</mark>");
  }
  return result;
}

function renderResultCard(result: ChunkResult, query: string): string {
  const distance = result.distance != null ? result.distance.toFixed(3) : "—";
  // Truncate text to ~300 chars for preview
  const preview = result.text.length > 400 ? result.text.slice(0, 400) + "…" : result.text;
  return `
    <div class="ai-search-result">
      <div class="ai-search-result__header">
        <span class="ai-search-result__icon">📄</span>
        <span class="ai-search-result__title" title="${escapeHtml(result.paperTitle)}">${escapeHtml(result.paperTitle)}</span>
        <span class="ai-search-result__distance" title="Cosine distance">${distance}</span>
      </div>
      <div class="ai-search-result__path">${escapeHtml(result.sectionPath || "(no section)")}</div>
      <div class="ai-search-result__text">${highlightQuery(preview, query)}</div>
    </div>
  `;
}

function renderLoading(): string {
  return `<div class="ai-search-loading">Đang tìm kiếm...</div>`;
}

function renderEmpty(query: string): string {
  return `<div class="ai-search-empty">
    <p>Không tìm thấy kết quả cho "${escapeHtml(query)}"</p>
    <p style="font-size:12px;color:#94a3b8">Thử từ khóa khác hoặc upload thêm tài liệu</p>
  </div>`;
}

function renderError(msg: string): string {
  return `<div class="ai-search-error">⚠ ${escapeHtml(msg)}</div>`;
}

let _lastQuery = "";

export async function onPaperSearchSubmit(): Promise<void> {
  const input = document.getElementById("ai-paper-search-input") as HTMLInputElement | null;
  const resultsEl = document.getElementById("ai-paper-search-results");
  const countEl = document.getElementById("ai-paper-search-count");
  if (!input || !resultsEl) return;

  const query = input.value.trim();
  if (!query) {
    showToast("Nhập từ khóa để tìm kiếm", "warn");
    return;
  }
  if (query.length < 3) {
    showToast("Từ khóa quá ngắn (tối thiểu 3 ký tự)", "warn");
    return;
  }

  if (!auth.currentUser) {
    showToast("Cần đăng nhập để tìm kiếm", "warn");
    return;
  }

  _lastQuery = query;
  resultsEl.innerHTML = renderLoading();
  if (countEl) countEl.textContent = "";

  try {
    const token = await auth.currentUser.getIdToken();
    const resp = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, limit: 10 }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
      resultsEl.innerHTML = renderError(errData.error || `HTTP ${resp.status}`);
      return;
    }
    const data = await resp.json();
    const results: ChunkResult[] = data.results || [];

    if (results.length === 0) {
      resultsEl.innerHTML = renderEmpty(query);
      if (countEl) countEl.textContent = "0";
      return;
    }

    resultsEl.innerHTML = results.map((r) => renderResultCard(r, query)).join("");
    if (countEl) countEl.textContent = String(results.length);
  } catch (e: any) {
    resultsEl.innerHTML = renderError(e?.message || "Search failed");
  }
}

export function onPaperSearchKeydown(target: HTMLElement, ev: KeyboardEvent): void {
  if (ev.key === "Enter") {
    ev.preventDefault();
    onPaperSearchSubmit();
  }
}

export function onPaperSearchClear(): void {
  const input = document.getElementById("ai-paper-search-input") as HTMLInputElement | null;
  const resultsEl = document.getElementById("ai-paper-search-results");
  const countEl = document.getElementById("ai-paper-search-count");
  if (input) input.value = "";
  if (resultsEl) resultsEl.innerHTML = "";
  if (countEl) countEl.textContent = "";
  _lastQuery = "";
  input?.focus();
}
