// src/js/pages/overview.ts
// Round 77c: Cross-experiment overview page — list ALL image + saved plots
// from ALL hydro/electrode experiments, classified into 6 groups.

import { ATTACHMENT_CATEGORIES } from '../services/attachments.js';
import { fbGet } from '../firebase.js';
import { escapeHtml } from '../utils/format.js';

interface AttachmentItem {
  id: string;
  category: string;
  fileName: string;
  mimeType: string;
  size: number;
  downloadURL: string;
  uploadedAt: number;
  _refType?: string;
  _refId?: string;
  _expCode?: string;
}

interface GroupDef {
  key: string;
  label: string;
  categories: readonly string[];
}

const GROUPS: readonly GroupDef[] = [
  { key: 'structure',  label: 'Cấu trúc',                 categories: ['xrd'] },
  { key: 'morphology', label: 'Hình thái',                categories: ['sem', 'tem'] },
  { key: 'composition',label: 'Thành phần & oxy hóa',     categories: ['eds', 'xps'] },
  { key: 'optical',    label: 'Tính chất quang học',      categories: ['uvvis', 'uvvis-drs', 'pl'] },
  { key: 'vibration',  label: 'Phổ dao động',             categories: ['raman', 'ftir'] },
  { key: 'electrochem',label: 'Điện hóa',                 categories: ['electrochem'] },
];

const isImage = (mime: string): boolean => /^image\//.test(mime || '');
const isSavedPlot = (fileName: string): boolean => /_plot\.png$/i.test(fileName);

function _formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Load all attachments from hydro + electrode, enriched with
 * experiment code lookup.
 */
async function loadAllAttachments(): Promise<AttachmentItem[]> {
  // Fetch parent collections (used to resolve {refType, refId} -> code)
  const [hydroParents, electrodeParents] = await Promise.all([
    fbGet('hydro').catch(() => ({})) as Promise<Record<string, any>>,
    fbGet('electrode').catch(() => ({})) as Promise<Record<string, any>>,
  ]);

  // Fetch attachment trees
  const [hydroAtt, electrodeAtt] = await Promise.all([
    fbGet('attachments/hydro').catch(() => ({})) as Promise<Record<string, any>>,
    fbGet('attachments/electrode').catch(() => ({})) as Promise<Record<string, any>>,
  ]);

  const out: AttachmentItem[] = [];
  const collect = (refType: 'hydro' | 'electrode', tree: Record<string, any>, parents: Record<string, any>) => {
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

function filterDisplayable(items: AttachmentItem[]): AttachmentItem[] {
  return items.filter((it) => isImage(it.mimeType) || isSavedPlot(it.fileName));
}

function classifyByGroup(items: AttachmentItem[]): Record<string, AttachmentItem[]> {
  const buckets: Record<string, AttachmentItem[]> = {};
  for (const g of GROUPS) buckets[g.key] = [];
  buckets._other = [];
  for (const it of items) {
    let placed = false;
    for (const g of GROUPS) {
      if (g.categories.includes(it.category)) {
        buckets[g.key].push(it); placed = true; break;
      }
    }
    if (!placed) buckets._other.push(it);
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
  }
  return buckets;
}

function renderGroup(group: GroupDef, items: AttachmentItem[]): string {
  const count = items.length;
  const isEmpty = count === 0;
  const expanded = !isEmpty;
  const stateAttr = expanded ? 'open' : 'closed';
  const dimmedClass = isEmpty ? ' att-overview-group-empty' : '';

  const thumbsHTML = items.map((it) => {
    const catLabel = ATTACHMENT_CATEGORIES[it.category]?.label || it.category;
    const sizeStr = _formatBytes(it.size);
    const expCode = it._expCode || '';
    const refType = it._refType || '';
    const refId = it._refId || '';
    return `
      <div class="att-overview-thumb-card">
        <a class="att-overview-thumb"
           href="${escapeHtml(it.downloadURL)}"
           target="_blank" rel="noopener"
           title="${escapeHtml(it.fileName)} • ${escapeHtml(catLabel)} • ${sizeStr}">
          <img src="${escapeHtml(it.downloadURL)}" alt="${escapeHtml(it.fileName)}" loading="lazy" />
          <div class="att-overview-thumb-meta">
            <span class="att-overview-thumb-name">${escapeHtml(it.fileName)}</span>
            <span class="att-badge att-badge-${escapeHtml(it.category)}">${escapeHtml(catLabel)}</span>
          </div>
        </a>
        <button type="button" class="att-overview-thumb-code"
                data-action="overview-jump"
                data-ref-type="${escapeHtml(refType)}"
                data-ref-id="${escapeHtml(refId)}"
                title="Mở thí nghiệm ${escapeHtml(expCode)}">
          ${escapeHtml(expCode)}
        </button>
      </div>
    `;
  }).join('');

  return `
    <section class="att-overview-group${dimmedClass}" data-group="${group.key}" data-state="${stateAttr}">
      <button type="button" class="att-overview-group-header" data-action="overview-toggle"
              aria-expanded="${expanded}">
        <span class="att-overview-chevron" aria-hidden="true">▸</span>
        <span class="att-overview-group-label">${escapeHtml(group.label)}</span>
        <span class="att-overview-group-count">(${count})</span>
      </button>
      <div class="att-overview-group-body">
        ${isEmpty
          ? `<p class="att-overview-empty-msg">Chưa có ảnh nào trong nhóm này.</p>`
          : `<div class="att-overview-grid">${thumbsHTML}</div>`}
      </div>
    </section>
  `;
}

let _delegationBound = false;

/**
 * Render the overview page into #page-overview. Called by showPage('overview').
 */
export async function renderOverview(): Promise<void> {
  const page = document.getElementById('page-overview');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header">
      <h1>📊 Tổng quan ảnh — Tất cả thí nghiệm</h1>
      <p class="page-header-sub">Tổng hợp ảnh + đồ thị đã lưu của tất cả thí nghiệm thủy nhiệt và điện cực, phân loại theo 6 nhóm phép phân tích.</p>
    </div>
    <div class="att-overview-page-body"><p class="att-overview-loading">Đang tải dữ liệu...</p></div>
  `;

  // Bind delegation once for the page (toggle accordion + jump button)
  if (!_delegationBound) {
    _delegationBound = true;
    page.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const toggle = target.closest<HTMLButtonElement>('[data-action="overview-toggle"]');
      if (toggle) {
        const section = toggle.closest<HTMLElement>('.att-overview-group');
        if (!section) return;
        const cur = section.dataset.state;
        const newState = cur === 'open' ? 'closed' : 'open';
        section.dataset.state = newState;
        toggle.setAttribute('aria-expanded', String(newState === 'open'));
        return;
      }
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
          // After page renders, scroll to row + flash highlight
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
    for (const g of GROUPS) html += renderGroup(g, groups[g.key]);
    if (groups._other.length) {
      html += renderGroup({ key: '_other', label: 'Khác', categories: [] }, groups._other);
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (e: any) {
    console.error('[overview-page] load failed:', e);
    body.innerHTML = `<p class="att-overview-error">Lỗi tải dữ liệu: ${escapeHtml(e?.message || 'unknown')}</p>`;
  }
}
