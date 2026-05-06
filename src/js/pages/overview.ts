// src/js/pages/overview.ts
// Round 77c + Round 78 refactor: cross-experiment overview page.
// Lists ALL image + saved plots from ALL hydro/electrode experiments,
// classified into 6 analysis groups via shared classifier.

import { fbGet } from '../firebase.js';
import { escapeHtml } from '../utils/format.js';
import {
  GROUPS,
  filterDisplayable,
  classifyByGroup,
  renderAccordionGroup,
  type ClassifierItem,
} from '../services/attachment-classifier.js';

/**
 * Load all attachments from hydro + electrode, enriched with
 * experiment code lookup for the code-badge overlay.
 */
async function loadAllAttachments(): Promise<ClassifierItem[]> {
  const [hydroParents, electrodeParents] = await Promise.all([
    fbGet('hydro').catch(() => ({})) as Promise<Record<string, any>>,
    fbGet('electrode').catch(() => ({})) as Promise<Record<string, any>>,
  ]);
  const [hydroAtt, electrodeAtt] = await Promise.all([
    fbGet('attachments/hydro').catch(() => ({})) as Promise<Record<string, any>>,
    fbGet('attachments/electrode').catch(() => ({})) as Promise<Record<string, any>>,
  ]);

  const out: ClassifierItem[] = [];
  const collect = (
    refType: 'hydro' | 'electrode',
    tree: Record<string, any>,
    parents: Record<string, any>,
  ) => {
    for (const [refId, atts] of Object.entries(tree || {})) {
      const code = parents?.[refId]?.code || refId;
      for (const [attId, rec] of Object.entries(atts || {})) {
        out.push({
          id: attId,
          ...(rec as any),
          _refType: refType,
          _refId: refId,
          _expCode: code,
        });
      }
    }
  };
  collect('hydro', hydroAtt, hydroParents);
  collect('electrode', electrodeAtt, electrodeParents);
  return out;
}

let _delegationBound = false;

export async function renderOverview(): Promise<void> {
  const page = document.getElementById('page-overview');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header">
      <h1>📊 Tổng quan phổ dữ liệu</h1>
      <p class="page-header-sub">Tổng hợp phổ + ảnh đã lưu từ tất cả thí nghiệm thủy nhiệt và điện cực, phân loại theo 6 nhóm phép phân tích.</p>
    </div>
    <div class="att-overview-page-body"><p class="att-overview-loading">Đang tải dữ liệu...</p></div>
  `;

  if (!_delegationBound) {
    _delegationBound = true;
    page.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Toggle accordion
      const toggle = target.closest<HTMLButtonElement>('[data-action="overview-toggle"]');
      if (toggle) {
        const section = toggle.closest<HTMLElement>('.att-overview-group');
        if (!section) return;
        const newState = section.dataset.state === 'open' ? 'closed' : 'open';
        section.dataset.state = newState;
        toggle.setAttribute('aria-expanded', String(newState === 'open'));
        return;
      }
      // Jump to source experiment
      const jump = target.closest<HTMLButtonElement>('[data-action="overview-jump"]');
      if (jump) {
        e.preventDefault();
        e.stopPropagation();
        const refType = jump.dataset.refType;
        const refId = jump.dataset.refId;
        if (!refType || !refId) return;
        const pageId = refType === 'hydro' ? 'hydrothermal' : 'electrode';
        if (typeof (window as any).showPage === 'function') {
          (window as any).showPage(pageId);
          setTimeout(() => {
            const row = document.querySelector<HTMLTableRowElement>(
              `#page-${pageId} tr.clickable-row[data-key="${refId}"]`
            );
            if (row) {
              row.scrollIntoView({ behavior: 'smooth', block: 'center' });
              row.classList.add('row-highlight-flash');
              setTimeout(() => row.classList.remove('row-highlight-flash'), 2000);
            }
          }, 100);
        }
      }
    });
  }

  const body = page.querySelector('.att-overview-page-body') as HTMLElement;

  try {
    const all = await loadAllAttachments();
    const displayable = filterDisplayable(all);
    const groups = classifyByGroup(displayable);

    let html = `
      <div class="att-overview-summary">
        <span class="att-overview-summary-total">${displayable.length}</span> ảnh /
        <span>${all.length} file</span> trong toàn bộ phòng lab
      </div>
      <div class="att-overview-accordion">
    `;
    // Cross-experiment view: enable code badge so user can jump to source
    const renderOpts = { codeBadge: true };
    for (const g of GROUPS) {
      html += renderAccordionGroup(g, groups[g.key], renderOpts);
    }
    if (groups._other.length) {
      html += renderAccordionGroup(
        { key: '_other', label: 'Khác', categories: [] },
        groups._other,
        renderOpts,
      );
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (e: any) {
    console.error('[overview-page] load failed:', e);
    body.innerHTML = `<p class="att-overview-error">Lỗi tải dữ liệu: ${escapeHtml(e?.message || 'unknown')}</p>`;
  }
}
