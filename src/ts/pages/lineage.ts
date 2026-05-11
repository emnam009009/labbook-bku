/**
 * pages/lineage.ts — Cross-experiment lineage page (R154-2a + R154-3).
 *
 * R154-3: Filter chips + search bar.
 */

import { buildFullLineageGraph } from "../services/lineage-service.js";
import { renderLineageGraph } from "../ui/lineage-graph.js";
import { escapeHtml } from "../utils/format.js";
import type { LineageGraph, LineageNodeType } from "../services/lineage-service.js";

const TYPE_LABELS: Record<LineageNodeType, string> = {
  'material': 'Vật liệu',
  'sample': 'Mẫu',
  'experiment': 'Thí nghiệm',
  'dataasset': 'Tệp đính kèm',
};

const TYPE_COLORS: Record<LineageNodeType, string> = {
  'material': '#7C3AED',
  'sample': '#0D9488',
  'experiment': '#F59E0B',
  'dataasset': '#3B82F6',
};

let _graphCache: LineageGraph | null = null;
let _activeTypes = new Set<LineageNodeType>(['material', 'sample', 'experiment', 'dataasset']);
let _searchQuery = '';

function renderFilterChips(graph: LineageGraph): void {
  const el = document.getElementById('lineage-filter-chips');
  if (!el) return;
  const counts: Record<string, number> = {};
  for (const n of graph.nodes) counts[n.type] = (counts[n.type] || 0) + 1;
  const types: LineageNodeType[] = ['material', 'sample', 'experiment', 'dataasset'];
  el.innerHTML = types.map(t => {
    const count = counts[t] || 0;
    const active = _activeTypes.has(t);
    const dim = count === 0 ? 'lb-lineage-chip--empty' : '';
    return `
      <button type="button"
        class="lb-lineage-chip ${active ? 'lb-lineage-chip--active' : ''} ${dim}"
        data-action="lineage-toggle-type" data-type="${t}"
        ${count === 0 ? 'disabled' : ''}>
        <span class="lb-lineage-chip-dot" style="background:${TYPE_COLORS[t]}"></span>
        ${escapeHtml(TYPE_LABELS[t])}
        <span class="lb-lineage-chip-count">${count}</span>
      </button>
    `;
  }).join('');
}

function applyFilter(graph: LineageGraph): LineageGraph {
  const q = _searchQuery.toLowerCase().trim();
  const filteredNodes = graph.nodes.filter(n => {
    if (!_activeTypes.has(n.type)) return false;
    if (q) {
      const label = (n.label || '').toLowerCase();
      const sublabel = (n.sublabel || '').toLowerCase();
      if (!label.includes(q) && !sublabel.includes(q)) return false;
    }
    return true;
  });
  const visibleIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = graph.edges.filter(e =>
    visibleIds.has(typeof e.source === 'string' ? e.source : (e.source as any).id) &&
    visibleIds.has(typeof e.target === 'string' ? e.target : (e.target as any).id)
  );
  return { nodes: filteredNodes, edges: filteredEdges };
}

function refreshGraph(): void {
  if (!_graphCache) return;
  const container = document.getElementById('lineage-page-container');
  const statusEl = document.getElementById('lineage-page-status');
  if (!container || !statusEl) return;

  const filtered = applyFilter(_graphCache);
  container.innerHTML = '';
  if (filtered.nodes.length === 0) {
    statusEl.textContent = 'Không có node nào khớp filter.';
    statusEl.style.color = '#EF4444';
    return;
  }

  const totalCount = _graphCache.nodes.length;
  const shownCount = filtered.nodes.length;
  const isFiltered = shownCount < totalCount;
  statusEl.textContent = isFiltered
    ? `Hiển thị ${shownCount}/${totalCount} node, ${filtered.edges.length} liên kết.`
    : `${totalCount} node, ${filtered.edges.length} liên kết. Kéo node, scroll để zoom, click để xem chi tiết.`;
  statusEl.style.color = '#0D9488';
  renderLineageGraph(container, filtered);
}

export async function renderLineagePage(): Promise<void> {
  const container = document.getElementById('lineage-page-container');
  const statusEl = document.getElementById('lineage-page-status');
  if (!container || !statusEl) return;

  container.innerHTML = '';
  statusEl.textContent = 'Đang tải dữ liệu...';
  statusEl.style.color = '#475569';

  try {
    _graphCache = await buildFullLineageGraph();
    if (_graphCache.nodes.length === 0) {
      statusEl.textContent = 'Chưa có dữ liệu nào trong lab.';
      statusEl.style.color = '#EF4444';
      return;
    }
    renderFilterChips(_graphCache);
    refreshGraph();
  } catch (err: any) {
    console.error('[lineage-page] render failed', err);
    statusEl.textContent = `Lỗi: ${err?.message || String(err)}`;
    statusEl.style.color = '#EF4444';
  }
}

export function toggleLineageType(type: LineageNodeType): void {
  if (_activeTypes.has(type)) {
    if (_activeTypes.size > 1) _activeTypes.delete(type);  // Don't allow empty filter
  } else {
    _activeTypes.add(type);
  }
  if (_graphCache) renderFilterChips(_graphCache);
  refreshGraph();
}

let _searchDebounce: ReturnType<typeof setTimeout> | null = null;
export function setLineageSearch(query: string): void {
  if (_searchDebounce) clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => {
    _searchQuery = query;
    refreshGraph();
  }, 250);
}

export function clearLineageSearch(): void {
  const input = document.getElementById('lineage-search') as HTMLInputElement | null;
  if (input) input.value = '';
  _searchQuery = '';
  refreshGraph();
}

(window as any).renderLineagePage = renderLineagePage;
(window as any).toggleLineageType = toggleLineageType;
(window as any).setLineageSearch = setLineageSearch;
(window as any).clearLineageSearch = clearLineageSearch;

document.addEventListener('pageChange', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail?.id === 'lineage') {
    void renderLineagePage();
  }
});
