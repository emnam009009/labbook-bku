/**
 * Paper Search — Round 137c2 (frontend confidence badges + latency)
 *
 * Backend pipeline (R137b + R137c1):
 *   query → hybrid (vector + BM25 + RRF) → rerank-2.5 → top-K
 *
 * UI enhancements over R136b:
 * - Confidence badge from rerankScore (more intuitive than cosine distance)
 * - Latency badge in meta line
 * - Inline CSS for badges (injected once)
 *
 * No advanced controls exposed — defaults (mode=hybrid, rerank=true) apply
 * for all users.
 */
// @ts-nocheck — AI module — partial typing (R105+ skeleton). Cleanup after RAG/streaming stabilization.

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
  // R137b+R137c1 score fields (all optional for backward compat)
  distance?: number;
  vectorScore?: number;
  bm25Score?: number;
  rrfScore?: number;
  rerankScore?: number;
}

// ============================================================
// CSS injection (one-time)
// ============================================================
let _stylesInjected = false;
function injectStyles(): void {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const css = `
.ai-search-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  letter-spacing: 0.2px;
  vertical-align: middle;
}
.ai-search-badge--high   { background: rgba(34,197,94,0.15);  color: #16a34a; }
.ai-search-badge--good   { background: rgba(59,130,246,0.15); color: #2563eb; }
.ai-search-badge--maybe  { background: rgba(234,179,8,0.18);  color: #b45309; }
.ai-search-badge--weak   { background: rgba(148,163,184,0.20); color: #64748b; }
.ai-search-result__score {
  font-size: 11px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  margin-left: 6px;
}
.ai-search-meta__latency {
  margin-left: 12px;
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}
`;
  const style = document.createElement("style");
  style.setAttribute("data-source", "paper-search-r137c2");
  style.textContent = css;
  document.head.appendChild(style);
}

// ============================================================
// Helpers
// ============================================================
function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"\']/g, (c: string) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\'": "&#39;" } as any)[c]
  );
}

function highlightQuery(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const words = query.trim().split(/\s+/).filter((w: string) => w.length >= 3);
  let result = escaped;
  for (const w of words) {
    const re = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    result = result.replace(re, "<mark>$1</mark>");
  }
  return result;
}

/**
 * Map rerankScore (0-1) to a confidence label + CSS class.
 * Falls back to vectorScore if rerank not present (e.g. rerank disabled).
 */
function confidenceBadge(result: ChunkResult): { label: string; cls: string; raw: number | null } {
  const raw = result.rerankScore != null
    ? result.rerankScore
    : (result.vectorScore != null ? result.vectorScore : null);
  if (raw == null) return { label: "—", cls: "ai-search-badge--weak", raw: null };
  if (raw >= 0.85) return { label: "Rất phù hợp",     cls: "ai-search-badge--high",  raw };
  if (raw >= 0.65) return { label: "Phù hợp",         cls: "ai-search-badge--good",  raw };
  if (raw >= 0.40) return { label: "Có thể phù hợp",  cls: "ai-search-badge--maybe", raw };
  return { label: "Yếu", cls: "ai-search-badge--weak", raw };
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// ============================================================
// Render
// ============================================================
function renderResultCard(result: ChunkResult, query: string): string {
  const badge = confidenceBadge(result);
  const scoreStr = badge.raw != null ? badge.raw.toFixed(3) : "—";
  const preview = result.text.length > 400 ? result.text.slice(0, 400) + "…" : result.text;
  return `
    <div class="ai-search-result">
      <div class="ai-search-result__header">
        <span class="ai-search-result__icon">📄</span>
        <span class="ai-search-result__title" title="${escapeHtml(result.paperTitle)}">${escapeHtml(result.paperTitle)}</span>
        <span class="ai-search-badge ${badge.cls}" title="Điểm tin cậy: ${scoreStr}">${badge.label}</span>
        <span class="ai-search-result__score" title="Score">${scoreStr}</span>
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

// ============================================================
// Public handlers
// ============================================================
export async function onPaperSearchSubmit(): Promise<void> {
  injectStyles();

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
      // R137c2: request defaults (mode hybrid + rerank ON applied server-side)
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

    // R137c2: count + latency display
    if (countEl) {
      const latencyMs = typeof data.searchMs === "number" ? data.searchMs : null;
      countEl.innerHTML = String(results.length)
        + (latencyMs != null
            ? ` <span class="ai-search-meta__latency" title="Thời gian tìm kiếm">· ${formatLatency(latencyMs)}</span>`
            : "");
    }
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
