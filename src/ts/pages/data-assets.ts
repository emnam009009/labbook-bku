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
// R156e: plot preview reuse
import { parseDataFile } from "../services/parsers/index.js";
import { renderPreview } from "../services/plot/plot-preview.js";
// R156g: Tauc plot
import { transformToTauc, TAUC_PRESETS } from "../services/plot/tauc.js";
import { autoFitBandgap } from "../services/plot/bandgap-fit.js";

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

// R156e: map DataAssetType → parser category (for plot preview)
const PARSER_CATEGORY_MAP: Partial<Record<DataAssetType, string>> = {
  'xrd': 'xrd',
  'raman': 'raman',
  'ftir': 'ftir',
  'uv-vis': 'uvvis',
  'uv-vis-drs': 'uvvis-drs',
  'pl': 'pl',
  'xps': 'xps',
  'eds': 'eds',
  'electrochem-csv': 'electrochem',
};

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
  // R156e: spectrum file types that we can parse + plot
  const parserCategory = PARSER_CATEGORY_MAP[asset.type];
  const isPlottable = !!parserCategory &&
    (/^text\//.test(asset.mimeType) || asset.mimeType === '' ||
     /^application\/octet-stream$/.test(asset.mimeType) ||
     /\.(csv|tsv|txt|xy|dat|emsa|spc|cor)$/i.test(asset.fileName));

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
      : isPlottable
        ? `<div class="lb-da-plot-container">
             <canvas id="da-plot-canvas" style="max-width:100%"></canvas>
             <div class="lb-hint lb-da-plot-status" id="da-plot-status">Đang tải dữ liệu...</div>
           </div>`
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
    <div id="da-plot-tauc-controls" class="lb-da-tauc-controls" style="display:none"></div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
        Tải về / Mở tab mới
      </a>
    </div>
  `;
  openModal("modal-dataasset-preview");

  // R156e: async render plot if plottable
  if (isPlottable && parserCategory) {
    void renderInlinePlot(asset, url, parserCategory);
  }
}

// R156e+g: fetch file from Storage URL → parse → render Chart.js (+ Tauc toggle)
let _currentParsedData: any = null;
let _currentAsset: DataAsset | null = null;
let _taucOn = false;
let _taucN = 0.5;

async function renderInlinePlot(asset: DataAsset, url: string, category: string): Promise<void> {
  const canvas = document.getElementById('da-plot-canvas') as HTMLCanvasElement | null;
  const statusEl = document.getElementById('da-plot-status');
  if (!canvas) return;
  try {
    if (statusEl) statusEl.textContent = 'Đang tải tệp...';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const file = new File([blob], asset.fileName, { type: asset.mimeType || 'text/plain' });

    if (statusEl) statusEl.textContent = 'Đang phân tích...';
    const parsed = await parseDataFile(file, category);

    if (!parsed || !parsed.x || !parsed.y || parsed.x.length === 0) {
      if (statusEl) {
        statusEl.textContent = 'Không phân tích được dữ liệu để vẽ.';
        statusEl.style.color = '#EF4444';
      }
      return;
    }

    _currentParsedData = parsed;
    _currentAsset = asset;
    _taucOn = false;
    _taucN = 0.5;

    if (statusEl) statusEl.textContent = `Đang vẽ (${parsed.x.length} điểm)...`;
    await renderPreview(canvas, parsed, {
      title: `${asset.type.toUpperCase()} — ${asset.fileName}`,
    });
    if (statusEl) {
      statusEl.textContent = `${parsed.x.length} điểm dữ liệu`;
      statusEl.style.color = '#0D9488';
    }

    // R156g: show Tauc controls for UV-Vis types
    renderTaucControls(asset.type);
  } catch (err: any) {
    console.error('[da-plot] render failed', err);
    if (statusEl) {
      statusEl.textContent = `Lỗi: ${err?.message || String(err)}`;
      statusEl.style.color = '#EF4444';
    }
  }
}

function renderTaucControls(daType: string): void {
  const container = document.getElementById('da-plot-tauc-controls');
  if (!container) return;
  if (daType !== 'uv-vis' && daType !== 'uv-vis-drs') {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  const presetOptions = TAUC_PRESETS.map(p =>
    `<option value="${p.value}" ${p.value === _taucN ? 'selected' : ''}>${p.label}</option>`
  ).join('');
  container.innerHTML = `
    <label class="lb-da-tauc-toggle">
      <input type="checkbox" id="da-tauc-on" ${_taucOn ? 'checked' : ''}
        data-input-action="da-tauc-toggle">
      <span>Hiển thị Tauc plot</span>
    </label>
    <div class="lb-da-tauc-n ${_taucOn ? '' : 'lb-da-tauc-n--hidden'}">
      <label for="da-tauc-n">n =</label>
      <select id="da-tauc-n" data-change-action="da-tauc-n" class="cs-select">
        ${presetOptions}
      </select>
    </div>
    <div class="lb-da-tauc-result" id="da-tauc-result"></div>
  `;
}

export async function applyTaucRender(): Promise<void> {
  if (!_currentParsedData || !_currentAsset) return;
  const canvas = document.getElementById('da-plot-canvas') as HTMLCanvasElement | null;
  const resultEl = document.getElementById('da-tauc-result');
  if (!canvas) return;

  if (!_taucOn) {
    // Re-render raw spectrum
    await renderPreview(canvas, _currentParsedData, {
      title: `${_currentAsset.type.toUpperCase()} — ${_currentAsset.fileName}`,
    });
    if (resultEl) resultEl.textContent = '';
    return;
  }

  // Mode based on DataAsset type
  const mode = _currentAsset.type === 'uv-vis-drs' ? 'reflectance' : 'absorbance';
  try {
    const tauc = transformToTauc(
      { x: _currentParsedData.x, y: _currentParsedData.y },
      _taucN,
      mode,
    );
    const fit = autoFitBandgap(tauc.x, tauc.y);
    await renderPreview(canvas, {
      x: tauc.x,
      y: tauc.y,
      xLabel: tauc.xLabel,
      yLabel: tauc.yLabel,
    }, {
      title: `Tauc plot (n=${_taucN}) — ${_currentAsset.fileName}`,
      bandgapFit: fit,
    });
    if (resultEl) {
      if (fit && isFinite(fit.Eg)) {
        resultEl.innerHTML = `📐 Bandgap (Eg) = <strong>${fit.Eg.toFixed(3)} eV</strong> (R² = ${fit.r2?.toFixed(3) ?? 'N/A'})`;
        resultEl.style.color = '#0D9488';
      } else {
        resultEl.textContent = '⚠️ Không tìm được vùng tuyến tính. Thử đổi n.';
        resultEl.style.color = '#EF4444';
      }
    }
  } catch (err: any) {
    console.error('[tauc] failed', err);
    if (resultEl) {
      resultEl.textContent = `Lỗi Tauc: ${err?.message || String(err)}`;
      resultEl.style.color = '#EF4444';
    }
  }
}

export function setTaucOn(on: boolean): void {
  _taucOn = on;
  // Toggle n select visibility
  const nDiv = document.querySelector('.lb-da-tauc-n');
  if (nDiv) {
    if (on) nDiv.classList.remove('lb-da-tauc-n--hidden');
    else nDiv.classList.add('lb-da-tauc-n--hidden');
  }
  void applyTaucRender();
}

export function setTaucN(n: number): void {
  _taucN = n;
  if (_taucOn) void applyTaucRender();
}

(window as any).setTaucOn = setTaucOn;
(window as any).setTaucN = setTaucN;

(window as any).renderDataAssetsPage = renderDataAssetsPage;
(window as any).filterDataAssetsByType = filterDataAssetsByType;
(window as any).openDataAssetPreview = openDataAssetPreview;

document.addEventListener('pageChange', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail?.id === 'dataassets') {
    void renderDataAssetsPage();
  }
});
