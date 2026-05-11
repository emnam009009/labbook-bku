/**
 * pages/lineage.ts — Cross-experiment lineage page (R154-2a — Phase B.5).
 *
 * Renders D3 force graph of all entities in lab (materials, samples,
 * experiments, dataAssets) and their relationships.
 *
 * For lab BKU scale (~13 entities), no filter UI needed.
 */

import { buildFullLineageGraph } from "../services/lineage-service.js";
import { renderLineageGraph } from "../ui/lineage-graph.js";
import { escapeHtml } from "../utils/format.js";

let _renderedOnce = false;

export async function renderLineagePage(): Promise<void> {
  const container = document.getElementById('lineage-page-container');
  const statusEl = document.getElementById('lineage-page-status');
  if (!container || !statusEl) return;

  container.innerHTML = '';
  statusEl.textContent = 'Đang tải dữ liệu...';
  statusEl.style.color = '#475569';

  try {
    const graph = await buildFullLineageGraph();
    if (graph.nodes.length === 0) {
      statusEl.textContent = 'Chưa có dữ liệu nào trong lab.';
      statusEl.style.color = '#EF4444';
      return;
    }
    // Count by type
    const counts: Record<string, number> = {};
    for (const n of graph.nodes) counts[n.type] = (counts[n.type] || 0) + 1;
    const countParts = ['material', 'sample', 'experiment', 'dataasset']
      .filter(t => counts[t])
      .map(t => `${counts[t]} ${t}`);
    statusEl.textContent = `${graph.nodes.length} node (${countParts.join(', ')}), ${graph.edges.length} liên kết. Kéo node, scroll để zoom, click để xem chi tiết.`;
    statusEl.style.color = '#0D9488';
    renderLineageGraph(container, graph);
    _renderedOnce = true;
  } catch (err: any) {
    console.error('[lineage-page] render failed', err);
    statusEl.textContent = `Lỗi: ${err?.message || String(err)}`;
    statusEl.style.color = '#EF4444';
  }
}

(window as any).renderLineagePage = renderLineagePage;

document.addEventListener('pageChange', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail?.id === 'lineage') {
    void renderLineagePage();
  }
});
