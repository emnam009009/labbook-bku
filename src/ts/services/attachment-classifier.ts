// src/ts/services/attachment-classifier.ts
// Round 78: shared utility cho phan loai 6 nhom + render thumbnail.
// Duoc dung boi:
//   - src/ts/ui/overview-modal.ts (per-experiment modal)
//   - src/ts/pages/overview.ts (cross-experiment page)

// ⚠️ DEPRECATED (R155 — Phase B.5): scheduled for removal in Phase E
// (Next.js + Carbon rewrite). New data uses DataAssets service
// (src/ts/services/data-assets.ts). Don't add features here.
import { ATTACHMENT_CATEGORIES } from './attachments.js';
import { escapeHtml } from '../utils/format.js';

export interface ClassifierItem {
  id: string;
  category: string;
  fileName: string;
  mimeType: string;
  size: number;
  downloadURL: string;
  uploadedAt: number;
  // Optional metadata used by cross-experiment page
  _refType?: string;
  _refId?: string;
  _expCode?: string;
  [k: string]: unknown;
}

export interface GroupDef {
  key: string;
  label: string;
  categories: readonly string[];
}

// 6-group analysis classification (per Round 77a discussion).
export const GROUPS: readonly GroupDef[] = Object.freeze([
  { key: 'structure',  label: 'Cấu trúc',                 categories: ['xrd'] },
  { key: 'morphology', label: 'Hình thái',                categories: ['sem', 'tem'] },
  { key: 'composition',label: 'Thành phần & oxy hóa',     categories: ['eds', 'xps'] },
  { key: 'optical',    label: 'Tính chất quang học',      categories: ['uvvis', 'uvvis-drs', 'pl'] },
  { key: 'vibration',  label: 'Phổ dao động',             categories: ['raman', 'ftir'] },
  { key: 'electrochem',label: 'Điện hóa',                 categories: ['electrochem'] },
]);

export function isImage(mime: string): boolean {
  return /^image\//.test(mime || '');
}

export function isSavedPlot(fileName: string): boolean {
  return /_plot\.png$/i.test(fileName);
}

/**
 * Keep only items that have a displayable image:
 *   - Image files (mimeType image/*)
 *   - Saved plot files (filename ends _plot.png)
 */
export function filterDisplayable(items: ClassifierItem[]): ClassifierItem[] {
  return items.filter((it) => isImage(it.mimeType) || isSavedPlot(it.fileName));
}

/**
 * Group items into the 6 analysis buckets + _other for unrecognized categories.
 * Each bucket is sorted by uploadedAt descending (newest first).
 */
export function classifyByGroup(items: ClassifierItem[]): Record<string, ClassifierItem[]> {
  const buckets: Record<string, ClassifierItem[]> = {};
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
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
  }
  return buckets;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export interface RenderThumbOpts {
  /**
   * Show experiment code badge in top-right corner with click-to-jump action.
   * Used by the cross-experiment page (where files come from many experiments).
   * Default: false (per-experiment modal doesn't need this).
   */
  codeBadge?: boolean;
}

/**
 * Render a single thumbnail. If opts.codeBadge=true, wraps in a card with
 * an experiment-code button overlay.
 */
export function renderThumb(item: ClassifierItem, opts: RenderThumbOpts = {}): string {
  const catLabel = ATTACHMENT_CATEGORIES[item.category]?.label || item.category;
  const sizeStr = formatBytes(item.size);
  // Round 82: button instead of <a target=_blank> -> open in-app lightbox
  const inner = `
    <button type="button" class="att-overview-thumb"
            data-action="open-lightbox"
            data-url="${escapeHtml(item.downloadURL)}"
            data-filename="${escapeHtml(item.fileName)}"
            data-caption="${escapeHtml(catLabel)} • ${sizeStr}"
            title="${escapeHtml(item.fileName)} • ${escapeHtml(catLabel)} • ${sizeStr}">
      <img src="${escapeHtml(item.downloadURL)}" alt="${escapeHtml(item.fileName)}" loading="lazy" />
      <div class="att-overview-thumb-meta">
        <span class="att-overview-thumb-name">${escapeHtml(item.fileName)}</span>
        <span class="att-badge att-badge-${escapeHtml(item.category)}">${escapeHtml(catLabel)}</span>
      </div>
    </button>
  `;
  if (!opts.codeBadge) return inner;

  const expCode = item._expCode || '';
  const refType = item._refType || '';
  const refId = item._refId || '';
  return `
    <div class="att-overview-thumb-card">
      ${inner}
      <button type="button" class="att-overview-thumb-code"
              data-action="overview-jump"
              data-ref-type="${escapeHtml(refType)}"
              data-ref-id="${escapeHtml(refId)}"
              title="Mở thí nghiệm ${escapeHtml(expCode)}">
        ${escapeHtml(expCode)}
      </button>
    </div>
  `;
}

export interface RenderGroupOpts extends RenderThumbOpts {
  /** Custom message for empty groups (default: short generic). */
  emptyMessage?: string;
}

/**
 * Render an accordion section: header + body grid of thumbnails.
 * Empty groups are rendered collapsed with a hint message.
 */
export function renderAccordionGroup(
  group: GroupDef,
  items: ClassifierItem[],
  opts: RenderGroupOpts = {},
): string {
  const count = items.length;
  const isEmpty = count === 0;
  const expanded = !isEmpty;
  const stateAttr = expanded ? 'open' : 'closed';
  const dimmedClass = isEmpty ? ' att-overview-group-empty' : '';
  const emptyMsg = opts.emptyMessage || 'Chưa có ảnh nào trong nhóm này.';

  const thumbsHTML = items.map((it) => renderThumb(it, opts)).join('');

  return `
    <section class="att-overview-group${dimmedClass}" data-group="${group.key}" data-state="${stateAttr}">
      <button type="button" class="att-overview-group-header" data-action="overview-toggle"
              aria-expanded="${expanded}">
        <span class="att-overview-chevron" aria-hidden="true">▸</span>
        <span class="att-overview-group-label">${escapeHtml(group.label)}</span>
        <span class="att-overview-group-count">(${count})</span>
      </button>
      <div class="att-overview-group-body">
        <div class="att-overview-group-inner">
          ${isEmpty
            ? `<p class="att-overview-empty-msg">${escapeHtml(emptyMsg)}</p>`
            : `<div class="att-overview-grid">${thumbsHTML}</div>`}
        </div>
      </div>
    </section>
  `;
}
