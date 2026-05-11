/**
 * pages/data-assets.ts — DataAssets gallery page (R153c — Phase B.5).
 */

import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { fdb } from "../firebase.js";
import {
  getDataAssetURL, formatFileSize, tsToDate,
} from "../services/data-assets.js";
import type { DataAsset, DataAssetType } from "../types/research.js";
import { escapeHtml } from "../utils/format.js";
import { openModal } from "../ui/modal.js";

const TENANT_ID = "default";

const DA_TYPE_LABELS: Record<DataAssetType, string> = {
  'xrd': 'XRD', 'sem': 'SEM', 'tem': 'TEM', 'raman': 'Raman', 'ftir': 'FTIR',
  'uv-vis': 'UV-Vis', 'uv-vis-drs': 'UV-Vis DRS', 'pl': 'PL', 'eds': 'EDS',
  'xps': 'XPS', 'electrochem-csv': 'Điện hóa', 'image': 'Ảnh',
  'document': 'Tài liệu', 'other': 'Khác',
};

const TYPE_ORDER: DataAssetType[] = [
  'xrd', 'sem', 'tem', 'raman', 'ftir', 'uv-vis', 'uv-vis-drs', 'pl',
  'eds', 'xps', 'electrochem-csv', 'image', 'document', 'other',
];

let _cache: DataAsset[] | null = null;
let _filterType: DataAssetType | "" = "";
let _thumbCache = new Map<string, string>();

function fmtDate(ts: unknown): string {
  const d = tsToDate(ts);
  if (!d) return '—';
  return d.toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

async function fetchAllAssets(): Promise<DataAsset[]> {
  const q = query(
    collection(fdb, "dataAssets"),
    where("tenantId", "==", TENANT_ID),
    orderBy("uploadedAt", "desc"),
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DataAsset));
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes("NOT_FOUND") || msg.includes("5 NOT_FOUND")) return [];
    throw err;
  }
}

function renderFilterChips(typeCounts: Map<DataAssetType, number>, total: number): void {
  const el = document.getElementById("da-filter-chips");
  if (!el) return;
  const chips: string[] = [];
  chips.push(`
    <button type="button" class="lb-da-chip ${_filterType === '' ? 'lb-da-chip--active' : ''}"
      data-action="da-filter" data-type="">
      Tất cả <span class="lb-da-chip-count">${total}</span>
    </button>
  `);
  for (const t of TYPE_ORDER) {
    const count = typeCounts.get(t) || 0;
    if (count === 0) continue;
    chips.push(`
      <button type="button" class="lb-da-chip ${_filterType === t ? 'lb-da-chip--active' : ''}"
        data-action="da-filter" data-type="${escapeHtml(t)}">
        ${escapeHtml(DA_TYPE_LABELS[t])} <span class="lb-da-chip-count">${count}</span>
      </button>
    `);
  }
  el.innerHTML = chips.join('');
}

function getTypeIcon(type: DataAssetType): string {
  const map: Record<string, string> = {
    'xrd': '📊', 'sem': '🔬', 'tem': '🔬', 'raman': '〰️', 'ftir': '〰️',
    'uv-vis': '🌈', 'uv-vis-drs': '🌈', 'pl': '✨', 'eds': '⚛️', 'xps': '⚛️',
    'electrochem-csv': '⚡', 'image': '🖼️', 'document': '📄', 'other': '📎',
  };
  return `<span class="lb-da-thumb-emoji">${map[type] || '📎'}</span>`;
}

function renderGallery(assets: DataAsset[]): void {
  const el = document.getElementById("da-gallery");
  if (!el) return;
  if (assets.length === 0) {
    el.innerHTML = `
      <div class="lb-da-empty">
        <div class="lb-da-empty-title">Chưa có dữ liệu</div>
        <div class="lb-da-empty-sub">Upload tệp đính kèm trong từng thí nghiệm (Page "TN mới" → mở chi tiết).</div>
      </div>
    `;
    return;
  }
  el.innerHTML = assets.map(da => {
    const isImage = /^image\//.test(da.mimeType);
    const thumbUrl = isImage ? _thumbCache.get(da.id) : null;
    const thumbHtml = isImage
      ? (thumbUrl
          ? `<img class="lb-da-thumb" src="${escapeHtml(thumbUrl)}" alt="" loading="lazy">`
          : `<div class="lb-da-thumb lb-da-thumb--loading" data-thumb-id="${escapeHtml(da.id)}"></div>`)
      : `<div class="lb-da-thumb lb-da-thumb--icon">${getTypeIcon(da.type)}</div>`;
    return `
      <button type="button" class="lb-da-card" data-action="da-card-click" data-asset-id="${escapeHtml(da.id)}">
        ${thumbHtml}
        <div class="lb-da-card-body">
          <span class="lb-da-type-badge" data-type="${escapeHtml(da.type)}">${escapeHtml(DA_TYPE_LABELS[da.type] || da.type)}</span>
          <div class="lb-da-card-name" title="${escapeHtml(da.fileName)}">${escapeHtml(da.fileName)}</div>
          <div class="lb-da-card-meta">
            <span>${escapeHtml(formatFileSize(da.fileSize))}</span>
            <span>${escapeHtml(fmtDate(da.uploadedAt))}</span>
          </div>
        </div>
      </button>
    `;
  }).join('');
  void loadImageThumbnails(assets);
}

async function loadImageThumbnails(assets: DataAsset[]): Promise<void> {
  for (const da of assets) {
    if (!/^image\//.test(da.mimeType)) continue;
    if (_thumbCache.has(da.id)) continue;
    try {
      const url = await getDataAssetURL(da);
      _thumbCache.set(da.id, url);
      const placeholder = document.querySelector(`[data-thumb-id="${da.id}"]`);
      if (placeholder) {
        placeholder.outerHTML = `<img class="lb-da-thumb" src="${escapeHtml(url)}" alt="" loading="lazy">`;
      }
    } catch (err) {
      console.warn('[data-assets] Thumbnail load failed', da.id, err);
    }
  }
}

export async function renderDataAssetsPage(): Promise<void> {
  const galleryEl = document.getElementById("da-gallery");
  if (galleryEl) {
    galleryEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  }
  try {
    _cache = await fetchAllAssets();
  } catch (err: any) {
    if (galleryEl) {
      galleryEl.innerHTML = `<div class="lb-da-empty"><div class="lb-da-empty-title" style="color:#EF4444">Lỗi tải dữ liệu</div><div class="lb-da-empty-sub">${escapeHtml(err?.message || String(err))}</div></div>`;
    }
    return;
  }
  const counts = new Map<DataAssetType, number>();
  for (const a of _cache) {
    counts.set(a.type, (counts.get(a.type) || 0) + 1);
  }
  renderFilterChips(counts, _cache.length);
  const filtered = _filterType ? _cache.filter(a => a.type === _filterType) : _cache;
  renderGallery(filtered);
}

export function filterDataAssetsByType(type: DataAssetType | ""): void {
  if (!_cache) return;
  _filterType = type;
  const counts = new Map<DataAssetType, number>();
  for (const a of _cache) {
    counts.set(a.type, (counts.get(a.type) || 0) + 1);
  }
  renderFilterChips(counts, _cache.length);
  const filtered = _filterType ? _cache.filter(a => a.type === _filterType) : _cache;
  renderGallery(filtered);
}

export async function openDataAssetPreview(assetId: string): Promise<void> {
  if (!_cache) return;
  const asset = _cache.find(a => a.id === assetId);
  if (!asset) return;
  const bodyEl = document.getElementById("modal-dataasset-preview-body");
  if (!bodyEl) return;

  const isImage = /^image\//.test(asset.mimeType);
  const isPdf = asset.mimeType === 'application/pdf';

  let url = '';
  try {
    url = await getDataAssetURL(asset);
  } catch (err: any) {
    bodyEl.innerHTML = `<div class="lb-hint" style="color:#EF4444">Lỗi tải: ${escapeHtml(err?.message || String(err))}</div>`;
    openModal("modal-dataasset-preview");
    return;
  }

  const previewHtml = isImage
    ? `<img src="${escapeHtml(url)}" alt="" style="max-width:100%;border-radius:6px;display:block;margin:0 auto">`
    : isPdf
      ? `<iframe src="${escapeHtml(url)}" style="width:100%;height:70vh;border:1px solid #E2E8F0;border-radius:6px"></iframe>`
      : `<div class="lb-hint">Loại tệp này không xem trực tiếp được. Tải về để mở.</div>`;

  bodyEl.innerHTML = `
    <div class="font-mono text-lg font-bold" style="color:#0F172A;word-break:break-all">${escapeHtml(asset.fileName)}</div>
    <div class="lb-da-card-meta" style="margin-top:8px">
      <span class="lb-da-type-badge" data-type="${escapeHtml(asset.type)}">${escapeHtml(DA_TYPE_LABELS[asset.type] || asset.type)}</span>
      <span>${escapeHtml(formatFileSize(asset.fileSize))}</span>
      <span>${escapeHtml(fmtDate(asset.uploadedAt))}</span>
    </div>
    <div class="lb-prop-row" style="margin-top:12px">
      <span class="lb-prop-key">Thí nghiệm</span>
      <span class="lb-prop-val">
        <button type="button" class="badge font-mono text-xs cursor-pointer hover:underline"
          data-action="open-experiment-detail" data-id="${escapeHtml(asset.experimentId)}">
          ${escapeHtml(asset.experimentId)}
        </button>
      </span>
    </div>
    ${asset.notes ? `
      <div class="lb-prop-row">
        <span class="lb-prop-key">Ghi chú</span>
        <span class="lb-prop-val" style="text-align:left">${escapeHtml(asset.notes)}</span>
      </div>
    ` : ''}
    <div style="margin-top:16px">${previewHtml}</div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
        Tải về / Mở tab mới
      </a>
    </div>
  `;
  openModal("modal-dataasset-preview");
}

(window as any).renderDataAssetsPage = renderDataAssetsPage;
(window as any).filterDataAssetsByType = filterDataAssetsByType;
(window as any).openDataAssetPreview = openDataAssetPreview;

document.addEventListener('pageChange', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail?.id === 'dataassets') {
    void renderDataAssetsPage();
  }
});
