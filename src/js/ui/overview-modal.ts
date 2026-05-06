// src/js/ui/overview-modal.ts
// Round 77b: Modal "Tong quan do thi" - accordion 6 nhom phan loai
// hien thi thumbnail cua image files + saved plot files (.png).

import { listAttachments, ATTACHMENT_CATEGORIES } from '../services/attachments.js';
import { escapeHtml } from '../utils/format.js';

interface AttachmentItem {
  id: string;
  category: string;
  fileName: string;
  mimeType: string;
  size: number;
  downloadURL: string;
  uploadedAt: number;
  [k: string]: unknown;
}

// 6-group classification mapping per Round 77a discussion.
interface GroupDef {
  key: string;
  label: string;
  categories: readonly string[];
}

const GROUPS: readonly GroupDef[] = [
  { key: 'structure',  label: 'Cấu trúc',                     categories: ['xrd'] },
  { key: 'morphology', label: 'Hình thái',                    categories: ['sem', 'tem'] },
  { key: 'composition',label: 'Thành phần & oxy hóa',         categories: ['eds', 'xps'] },
  { key: 'optical',    label: 'Tính chất quang học',          categories: ['uvvis', 'uvvis-drs', 'pl'] },
  { key: 'vibration',  label: 'Phổ dao động',                 categories: ['raman', 'ftir'] },
  { key: 'electrochem',label: 'Điện hóa',                     categories: ['electrochem'] },
];

const isImage = (mime: string): boolean => /^image\//.test(mime || '');
const isSavedPlot = (fileName: string): boolean => /_plot\.png$/i.test(fileName);

/**
 * Filter attachments to those that have an image to display:
 * - Image files (mime type image/*)
 * - Saved plot files (filename ends _plot.png)
 * Other data files (.csv/.txt/...) without a saved plot are excluded.
 */
function filterDisplayable(items: AttachmentItem[]): AttachmentItem[] {
  return items.filter((it) => isImage(it.mimeType) || isSavedPlot(it.fileName));
}

/**
 * Group items into the 6 analysis groups.
 * 'other' or unrecognized categories go to a final "Khác" bucket if
 * displayable.
 */
function classifyByGroup(items: AttachmentItem[]): Record<string, AttachmentItem[]> {
  const buckets: Record<string, AttachmentItem[]> = {};
  for (const g of GROUPS) buckets[g.key] = [];
  buckets._other = [];

  for (const it of items) {
    let placed = false;
    for (const g of GROUPS) {
      if (g.categories.includes(it.category)) {
        buckets[g.key].push(it);
        placed = true;
        break;
      }
    }
    if (!placed) buckets._other.push(it);
  }
  // Sort each group by uploadedAt descending (newest first)
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
  }
  return buckets;
}

function _formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Render a single group section (header + body grid).
 * Empty groups are still rendered but collapsed and grayed.
 */
function renderGroup(group: GroupDef, items: AttachmentItem[]): string {
  const count = items.length;
  const isEmpty = count === 0;
  const expanded = !isEmpty;
  const stateAttr = expanded ? 'open' : 'closed';
  const dimmedClass = isEmpty ? ' att-overview-group-empty' : '';

  const thumbsHTML = items.map((it) => {
    const catLabel = ATTACHMENT_CATEGORIES[it.category]?.label || it.category;
    const sizeStr = _formatBytes(it.size);
    return `
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
          ? `<p class="att-overview-empty-msg">Chưa có ảnh nào trong nhóm này. Hãy upload ảnh hoặc bấm "Lưu đồ thị" trong preview.</p>`
          : `<div class="att-overview-grid">${thumbsHTML}</div>`}
      </div>
    </section>
  `;
}

/**
 * Open the overview modal for a single experiment.
 */
export async function openOverviewModal({
  refType, refId, title = '',
}: { refType: string; refId: string; title?: string }): Promise<void> {
  const modalId = 'modal-overview';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="${modalId}-title">
        <div class="modal-header">
          <div class="modal-title" id="${modalId}-title">Tổng quan đồ thị</div>
          <button class="modal-close" type="button" aria-label="Đóng" data-att-action="close-modal" data-modal-id="${modalId}">✕</button>
        </div>
        <div class="modal-body att-overview-body" style="padding:16px"></div>
      </div>
    `;
    document.body.appendChild(modal);
    // Click overlay → close
    modal.addEventListener('click', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.modal')) return;
      (window as any).closeModal?.(modalId);
    });
    // Accordion toggle delegation (idempotent: bound only once per element)
    modal.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement)?.closest<HTMLButtonElement>('[data-action="overview-toggle"]');
      if (!btn) return;
      const section = btn.closest<HTMLElement>('.att-overview-group');
      if (!section) return;
      const currentState = section.dataset.state;
      const newState = currentState === 'open' ? 'closed' : 'open';
      section.dataset.state = newState;
      btn.setAttribute('aria-expanded', String(newState === 'open'));
    });
  }

  const header = modal.querySelector(`#${modalId}-title`) as HTMLElement;
  const body = modal.querySelector('.att-overview-body') as HTMLElement;
  header.textContent = title ? `Tổng quan đồ thị — ${title}` : 'Tổng quan đồ thị';
  body.innerHTML = '<p class="att-overview-loading">Đang tải...</p>';

  (window as any).openModal?.(modalId);

  // Load and render
  try {
    const items = await listAttachments(refType, refId) as unknown as AttachmentItem[];
    const displayable = filterDisplayable(items);
    const groups = classifyByGroup(displayable);
    const totalImages = displayable.length;

    let html = `
      <div class="att-overview-summary">
        <span class="att-overview-summary-total">${totalImages}</span> ảnh /
        <span>${items.length} file</span> trong thí nghiệm này
      </div>
      <div class="att-overview-accordion">
    `;
    for (const g of GROUPS) {
      html += renderGroup(g, groups[g.key]);
    }
    // Render "Khác" only if it has items
    if (groups._other.length) {
      html += renderGroup({ key: '_other', label: 'Khác', categories: [] }, groups._other);
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (e: any) {
    console.error('[overview-modal] load failed:', e);
    body.innerHTML = `<p class="att-overview-error">Lỗi tải dữ liệu: ${escapeHtml(e?.message || 'unknown')}</p>`;
  }
}
