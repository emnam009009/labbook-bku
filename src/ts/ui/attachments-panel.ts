// src/ts/ui/attachments-panel.ts
// @ts-nocheck — UI component — DOM manipulation, deferred typing until Next.js port.
// Renders attachments management UI for one experiment.
// Designed to be embedded inside hydro/electrode edit modal.

import {
  ATTACHMENT_CATEGORIES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_EXPERIMENT,
  listAttachments,
  uploadMany,
  deleteAttachment,
  updateAttachmentCategory,
  updateAttachmentAxisSettings,
} from '../services/attachments.js';
import { showToast } from './toast.js';
import { canDelete } from '../utils/auth-helpers.js';
import { escapeHtml, fmtDate } from '../utils/format.js';
import { canAutoPlot, isParseableFile, parseDataFile, reparseWithColumns, detectCategory, detectionToastMessage } from '../services/parsers/index.js';
import { renderPreview, renderHighResPNG } from '../services/plot/plot-preview.js';
import { openImageLightbox } from './image-lightbox.js';
import { showBusyOverlay, hideBusyOverlay, setBusyMessage, isBusy, resetBusyCount } from './upload-busy-overlay.js';
import { canOpenInOrigin, downloadAndOpenInOrigin } from '../services/origin-launcher.js';
import { generateOgsScript } from '../services/origin-labtalk.js';
import { transformToTauc, TAUC_PRESETS, formatN } from '../services/plot/tauc.js';
import { autoFitBandgap } from '../services/plot/bandgap-fit.js';

const formatBytes = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const isImage = (mime) => /^image\//.test(mime || '');

const categoryOptionsHTML = () =>
  Object.entries(ATTACHMENT_CATEGORIES)
    .map(
      ([key, v]) =>
        `<option value="${escapeHtml(key)}">${escapeHtml(v.label)}</option>`,
    )
    .join('');

/**
 * Mount attachments panel into a container element.
 * @param {HTMLElement} container - host element (must be in DOM)
 * @param {object} opts
 * @param {string} opts.refType - 'hydro' | 'electrode'
 * @param {string} opts.refId   - experiment id
 */
export function mountAttachmentsPanel(container, { refType, refId }) {
  if (!container) return;
  if (!refType || !refId) {
    container.innerHTML =
      '<p class="att-empty">Lưu thí nghiệm trước khi đính kèm tài liệu.</p>';
    return;
  }

  container.innerHTML = `
    <div class="att-panel" data-ref-type="${escapeHtml(refType)}" data-ref-id="${escapeHtml(refId)}">
      <div class="att-toolbar">
        <label class="att-cat-label">
          Loại:
          <select class="att-category search-input" aria-label="Loại tài liệu">
            ${categoryOptionsHTML()}
          </select>
        </label>
        <label class="att-upload-btn">
          <input type="file" class="att-file-input" multiple
                 style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0" />
          <span>Chọn file</span>
        </label>
        <button type="button" class="btn btn-sm att-overview-btn" data-action="open-overview"
                title="Xem tất cả ảnh + đồ thị đã lưu, phân loại theo nhóm">
          <!-- Round 83: lucide-style gallery icon (3 stacked images) -->
          <svg class="att-overview-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 7v12a2 2 0 01-2 2H6"/>
            <rect x="3" y="3" width="15" height="15" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M18 13l-3-3-7 7"/>
          </svg>
          Tổng quan
        </button>
        <span class="att-counter" aria-live="polite"></span>
      </div>

      <div class="att-workspace">
        <div class="att-preview att-preview-dropzone" tabindex="0" role="button"
             aria-label="Kéo thả file vào đây để tải lên hoặc xem trước đồ thị">
          <!-- Round 83: dropzone va preview cung 1 vung. Khi chua co preview,
               .att-preview-empty hien thi hint; khi co preview thi an di. -->
          <div class="att-preview-header att-preview-header-conditional">
            <span class="att-preview-title">Xem trước đồ thị</span>
            <span class="att-preview-meta"></span>
            <div class="att-preview-cols" hidden>
              <label>Trục X: <select class="att-col-x"></select></label>
              <label>Trục Y: <select class="att-col-y"></select></label>
            </div>
            <div class="att-tauc-controls" hidden>
              <label class="att-tauc-toggle">
                <input type="checkbox" class="att-tauc-on" />
                <span>Chuyển sang Tauc plot</span>
              </label>
              <label class="att-tauc-n-label" hidden>
                n:
                <select class="att-tauc-n">
                  ${TAUC_PRESETS.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}
                  <option value="custom">Khác (tự nhập)</option>
                </select>
              </label>
              <label class="att-tauc-custom-label" hidden>
                <input type="number" class="att-tauc-custom" min="0.1" max="10" step="0.1" placeholder="n" style="width:60px" />
              </label>
              <label class="att-tauc-save-label" hidden>
                Lưu:
                <select class="att-tauc-save">
                  <option value="current">Đang xem</option>
                  <option value="reflectance">Phổ gốc</option>
                  <option value="tauc">Tauc plot</option>
                </select>
              </label>
              <button type="button" class="att-tauc-fit-btn" hidden>Auto-fit Eg</button>
              <span class="att-tauc-eg-display" hidden></span>
            </div>
          </div>
          <div class="att-axis-controls" hidden>
            <div class="att-axis-row">
              <span class="att-axis-label">X:</span>
              <label>min <input type="number" class="att-ax-x-min" step="any" placeholder="auto" /></label>
              <label>max <input type="number" class="att-ax-x-max" step="any" placeholder="auto" /></label>
              <label>step lớn <input type="number" class="att-ax-x-step" step="any" min="0" placeholder="auto" /></label>
              <label>minor <input type="number" class="att-ax-x-minor" step="1" min="1" max="10" placeholder="2" /></label>
            </div>
            <div class="att-axis-row">
              <span class="att-axis-label">Y:</span>
              <label>min <input type="number" class="att-ax-y-min" step="any" placeholder="auto" /></label>
              <label>max <input type="number" class="att-ax-y-max" step="any" placeholder="auto" /></label>
              <label>step lớn <input type="number" class="att-ax-y-step" step="any" min="0" placeholder="auto" /></label>
              <label>minor <input type="number" class="att-ax-y-minor" step="1" min="1" max="10" placeholder="2" /></label>
            </div>
            <div class="att-axis-actions">
              <button type="button" class="btn btn-xs att-ax-reset" title="Đặt lại auto-scale">Reset</button>
              <button type="button" class="btn btn-xs btn-primary att-ax-save" title="Lưu cài đặt cho file này">Lưu cài đặt</button>
              <span class="att-ax-status"></span>
            </div>
          </div>
          <div class="att-preview-canvas-wrap">
            <!-- Round 83: empty-state hint khi chua chon file -->
            <div class="att-preview-empty">
              <div class="att-preview-empty-icon-wrap">
                <svg class="att-preview-empty-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="10" y="14" width="44" height="36" rx="4"/>
                  <path d="M10 40l12-12 10 10 8-8 14 14"/>
                  <circle cx="22" cy="24" r="3"/>
                </svg>
              </div>
              <div class="att-preview-empty-title">Kéo thả file vào đây để bắt đầu</div>
              <div class="att-preview-empty-sub">Tối đa ${MAX_FILES_PER_EXPERIMENT} file · mỗi file ≤ ${formatBytes(MAX_FILE_BYTES)}</div>
            </div>
            <canvas class="att-preview-canvas"></canvas>
          </div>
          <div class="att-preview-actions">
            <button type="button" class="att-btn att-btn-primary att-save-plot">
              <svg class="att-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 17 9 11 13 15 21 7"/>
                <polyline points="14 7 21 7 21 14"/>
              </svg>
              <span>Lưu đồ thị (PNG 300 DPI)</span>
            </button>
            <button type="button" class="att-btn att-cancel-preview">Hủy</button>
          </div>
        </div>
      </div>

      <hr class="att-sep" />
      <ul class="att-list" aria-label="Danh sách tài liệu"></ul>
      <div class="att-progress" hidden></div>
    </div>
  `;

  const panel = container.querySelector('.att-panel');
  const fileInput = panel.querySelector('.att-file-input');
  // Round 83: .att-preview is now the dropzone (replaces old .att-dropzone box)
  const dropzone = panel.querySelector('.att-preview');
  const list = panel.querySelector('.att-list');
  const progress = panel.querySelector('.att-progress');
  const counter = panel.querySelector('.att-counter');
  const catSelect = panel.querySelector('.att-category');

  const refresh = async () => {
    const items = await listAttachments(refType, refId);
    counter.textContent = `${items.length}/${MAX_FILES_PER_EXPERIMENT} file`;
    if (!items.length) {
      list.innerHTML = '<li class="att-empty">Chưa có dữ liệu nào.</li>';
      return;
    }
    items.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    list.innerHTML = items.map(renderItem).join('');
  };

  const renderItem = (it) => {
    const catLabel =
      ATTACHMENT_CATEGORIES[it.category]?.label || it.category || '?';
    const thumb = isImage(it.mimeType)
      ? `<img class="att-thumb" src="${escapeHtml(it.downloadURL)}" alt="${escapeHtml(it.fileName)}" loading="lazy"/>`
      : `<span class="att-thumb att-thumb-file" aria-hidden="true">📄</span>`;
    const canDel = canDelete?.(it.uploadedBy) ?? true;
    const delBtn = canDel
      ? `<button class="att-del" data-id="${escapeHtml(it.id)}" title="Xoá" aria-label="Xoá ${escapeHtml(it.fileName)}">🗑</button>`
      : '';
    // Round 95: 'Mở bằng Origin' button for Origin-compatible files
    // Round 97: data-category added — Round 96 handler needs it for ogs
    //           script generation (axis label lookup by category)
    const originBtn = canOpenInOrigin(it.fileName)
      ? `<button class="att-origin-btn" data-id="${escapeHtml(it.id)}" data-url="${escapeHtml(it.downloadURL)}" data-filename="${escapeHtml(it.fileName)}" data-category="${escapeHtml(it.category)}" title="Tải về và mở bằng Origin Lab" aria-label="Mở ${escapeHtml(it.fileName)} bằng Origin">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
             <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>
           </svg>
         </button>`
      : '';
    // Decide click behavior: parseable raw data → preview; else → open in new tab
    const isPlot = /_plot\.png$/i.test(it.fileName);
    const fakeFile = { name: it.fileName };
    const isRaw = !isImage(it.mimeType) && !isPlot && isParseableFile(fakeFile);
    const action = isRaw && canAutoPlot(it.category) ? 'preview' : 'open';
    return `
      <li class="att-item" data-id="${escapeHtml(it.id)}">
        <button type="button" class="att-link"
                data-action="${action}"
                data-id="${escapeHtml(it.id)}"
                data-url="${escapeHtml(it.downloadURL)}"
                data-filename="${escapeHtml(it.fileName)}"
                data-category="${escapeHtml(it.category)}"
                title="${action === 'preview' ? 'Xem đồ thị' : 'Mở file'}">
          ${thumb}
          <div class="att-meta">
            <strong class="att-name">${escapeHtml(it.fileName)}</strong>
            <small class="att-meta-line">
              <button type="button"
                      class="att-badge att-badge-edit att-badge-${escapeHtml(it.category)}"
                      data-action="edit-category"
                      data-id="${escapeHtml(it.id)}"
                      data-category="${escapeHtml(it.category)}"
                      title="Bấm để đổi loại">${escapeHtml(catLabel)}</button>
              <span class="att-meta-rest">· ${formatBytes(it.size)} · ${fmtDate(it.uploadedAt)}</span>
            </small>
          </div>
        </button>
        ${originBtn}${delBtn}
      </li>
    `;
  };

  // ----- Upload handlers -----

  // State for preview
  const previewBox = panel.querySelector('.att-preview') as HTMLElement;
  // Round 83: dropzone state by default (empty hint shown)
  previewBox.hidden = false;
  previewBox.dataset.state = 'empty';
  const previewCanvas = panel.querySelector('.att-preview-canvas');
  const previewMeta = panel.querySelector('.att-preview-meta');
  const savePlotBtn = panel.querySelector('.att-save-plot');
  const cancelPreviewBtn = panel.querySelector('.att-cancel-preview');
  let _currentPreview = null; // { file, parsed, category, attachmentId? }
  let _axisLiveTimer: any = null;  // Round 75b: debounce timer for live update
  const axisCtrls = panel.querySelector('.att-axis-controls');
  const axStatus = panel.querySelector('.att-ax-status');
  const axSaveBtn = panel.querySelector('.att-ax-save');
  const axResetBtn = panel.querySelector('.att-ax-reset');
  let _currentChart = null;
  let _taucState = { on: false, n: 0.5, displayed: null }; // displayed: 'raw' | 'tauc'

  const taucControls = panel.querySelector('.att-tauc-controls');
  const taucOn = panel.querySelector('.att-tauc-on');
  const taucNLabel = panel.querySelector('.att-tauc-n-label');
  const taucNSelect = panel.querySelector('.att-tauc-n');
  const taucCustomLabel = panel.querySelector('.att-tauc-custom-label');
  const taucCustomInput = panel.querySelector('.att-tauc-custom');
  const taucSaveLabel = panel.querySelector('.att-tauc-save-label');
  const taucSaveSelect = panel.querySelector('.att-tauc-save');

  const applyTaucRender = async () => {
    if (!_currentPreview) return;
    const { file, parsed, category } = _currentPreview;
    const fileName = file.name;
    const titleBase = `${category.toUpperCase()} — ${fileName}`;
    if (_currentChart) { try { _currentChart.destroy(); } catch (e) {} }

    if (!_taucState.on) {
      _taucState.displayed = 'raw';
      _currentChart = await renderPreview(previewCanvas, parsed, { title: titleBase,
  axisSettings: readAxisSettings(),
});
      return;
    }

    // Detect mode by category
    const mode = category === 'uvvis-drs' ? 'reflectance' : 'absorbance';
    let n = _taucState.n;
    if (taucNSelect.value === 'custom') {
      const cv = parseFloat(taucCustomInput.value);
      if (!isFinite(cv) || cv <= 0) {
        showToast('Số mũ n phải > 0', 'danger');
        return;
      }
      n = cv;
    }
    try {
      const tauc = transformToTauc(parsed, n, mode);
      _taucState.displayed = 'tauc';
      _currentChart = await renderPreview(previewCanvas, {
        ...tauc,
        spec: parsed.spec,
        plotXLabel: tauc.xLabel,
        plotYLabel: tauc.yLabel,
      }, {
        title: `${titleBase} (Tauc, n=${formatN(n)})`,
        bandgapFit: _bandgapFit,
        axisSettings: readAxisSettings(),
      });
    } catch (err) {
      showToast(`Tauc transform lỗi: ${err.message}`, 'danger');
    }
  };

  const showTaucControlsIfApplicable = (category) => {
    const isApplicable = category === 'uvvis' || category === 'uvvis-drs';
    taucControls.hidden = !isApplicable;
    if (!isApplicable) {
      _taucState.on = false;
      taucOn.checked = false;
      taucNLabel.hidden = true;
      taucCustomLabel.hidden = true;
      taucSaveLabel.hidden = true;
    }
  };

  taucOn.addEventListener('change', () => {
    _taucState.on = taucOn.checked;
    taucNLabel.hidden = !_taucState.on;
    taucCustomLabel.hidden = !_taucState.on || taucNSelect.value !== 'custom';
    taucSaveLabel.hidden = !_taucState.on;
    applyTaucRender();
  });

  taucNSelect.addEventListener('change', () => {
    if (taucNSelect.value === 'custom') {
      taucCustomLabel.hidden = false;
      _taucState.n = parseFloat(taucCustomInput.value) || 0.5;
    } else {
      taucCustomLabel.hidden = true;
      _taucState.n = parseFloat(taucNSelect.value);
    }
    applyTaucRender();
  });

  taucCustomInput.addEventListener('change', () => {
    _taucState.n = parseFloat(taucCustomInput.value) || 0.5;
    _bandgapFit = null;  // reset fit khi đổi n
    egDisplay.hidden = true;
    applyTaucRender();
  });

  let _bandgapFit = null;
  const fitBtn = panel.querySelector('.att-tauc-fit-btn');
  const egDisplay = panel.querySelector('.att-tauc-eg-display');

  fitBtn.addEventListener('click', async () => {
    if (!_currentPreview || !_taucState.on) return;
    const { parsed, category } = _currentPreview;
    const mode = category === 'uvvis-drs' ? 'reflectance' : 'absorbance';
    let n = _taucState.n;
    if (taucNSelect.value === 'custom') {
      const cv = parseFloat(taucCustomInput.value);
      if (isFinite(cv) && cv > 0) n = cv;
    }
    try {
      const tauc = transformToTauc(parsed, n, mode);
      const fit = autoFitBandgap(tauc.x, tauc.y);
      if (!fit) {
        showToast('Không tìm được vùng tuyến tính phù hợp. Thử đổi n.', 'danger');
        return;
      }
      _bandgapFit = fit;
      egDisplay.hidden = false;
      egDisplay.innerHTML = `E<sub>g</sub> = ${fit.Eg.toFixed(3)} eV (R²=${fit.r2.toFixed(3)})`;
      await applyTaucRender();
    } catch (err) {
      showToast(`Auto-fit lỗi: ${err.message}`, 'danger');
    }
  });

  // Reset fit khi toggle off Tauc
  taucOn.addEventListener('change', () => {
    _bandgapFit = null;
    egDisplay.hidden = true;
    fitBtn.hidden = !taucOn.checked;
  });

  // Reset fit khi đổi n bằng dropdown
  const _origNChange = taucNSelect.onchange;
  taucNSelect.addEventListener('change', () => {
    _bandgapFit = null;
    egDisplay.hidden = true;
  });

  const closePreview = () => {
    if (_currentChart) { try { _currentChart.destroy(); } catch (e) {} _currentChart = null; }
    _currentPreview = null;
    // Round 93: restore Round 83 empty-state pattern.
    // - previewBox stays VISIBLE (it's also the dropzone)
    // - dataset.state = 'empty' triggers CSS to hide actions/canvas/header
    //   and show the empty-state hint (icon + 'Kéo thả file vào đây')
    previewBox.hidden = false;
    (previewBox as HTMLElement).dataset.state = 'empty';
    if (axisCtrls) (axisCtrls as any).hidden = true;
    if (axStatus) axStatus.textContent = '';
    clearAxisDOM();
    // Round 88: reset axis-save button state too
    if (typeof updateAxSaveBtnState === 'function') updateAxSaveBtnState();
  };

  const handleFiles = async (files) => {
    if (!files || !files.length) return;
    // Round 87: prevent spam — block if already uploading
    // Round 93: detect stale busy counter (overlay was destroyed/never-shown
    // but counter wasn't decremented due to error path) and reset it
    if (isBusy()) {
      const overlayEl = panel.querySelector('.att-busy-overlay.att-busy-visible');
      if (!overlayEl) {
        // Stale state — counter > 0 but no visible overlay. Reset.
        console.warn('[handleFiles] Stale busy state detected, resetting...');
        resetBusyCount();
      } else {
        showToast('Đang xử lý file trước, vui lòng đợi...', 'warning' as any);
        return;
      }
    }

    const _panel = panel as HTMLElement;
    showBusyOverlay(_panel, files.length === 1
      ? `Đang phân tích ${files[0].name}...`
      : `Đang xử lý ${files.length} file...`);
    try {

    // ─── Round 74: Auto-detect category from first file ───
    // Run before reading current select value, so user gets badge auto-set.
    if (files.length === 1) {
      try {
        const detection = await detectCategory(files[0]);
        if (detection.category !== 'other') {
          // Auto-set the dropdown to detected category
          catSelect.value = detection.category;
          // Get human-readable label for toast
          const cats = ATTACHMENT_CATEGORIES;
          const label = cats[detection.category]?.label || detection.category;
          const { msg, type } = detectionToastMessage(detection, label);
          showToast(msg, type as any);
          // Briefly highlight the dropdown so user notices the change
          catSelect.classList.add('att-category-detected');
          setTimeout(() => catSelect.classList.remove('att-category-detected'), 2000);
        }
      } catch (e: any) {
        console.warn('[attachments] detectCategory failed:', e.message);
        // Fall through with whatever category was selected
      }
    }

    const category = catSelect.value;

    // If single file AND parseable AND category supports auto-plot → preview
    if (files.length === 1 && canAutoPlot(category) && isParseableFile(files[0])) {
      const file = files[0];
      try {
        setBusyMessage(`Đang đọc ${file.name}...`);
        progress.hidden = true;  // hide legacy progress (using overlay now)
        const parsed = await parseDataFile(file, category);
        setBusyMessage(`Đang vẽ biểu đồ...`);
        _currentPreview = { file, parsed, category, attachmentId: null };
        updateAxSaveBtnState();  // Round 88: new file -> disable save axis
        previewBox.hidden = false;
        // Round 94: CRITICAL — set state to 'preview' so CSS rules show canvas
        // (without this, .att-preview[data-state="empty"] .att-preview-canvas
        //  CSS rule hides the rendered chart, leaving canvas visually blank)
        (previewBox as HTMLElement).dataset.state = 'preview';
        if (axisCtrls) (axisCtrls as any).hidden = false;
        clearAxisDOM();  // New file: no saved settings
        const heuristicNote = parsed.matchedByHeuristic
          ? `cột: ${parsed.xLabel} → ${parsed.yLabel}`
          : `cột mặc định (heuristic không match — chọn lại bên dưới)`;
        previewMeta.textContent = `${file.name} · ${parsed.x.length} điểm · ${heuristicNote}`;

        // Populate column dropdowns
        const colsBox = panel.querySelector('.att-preview-cols');
        const xSelect = panel.querySelector('.att-col-x');
        const ySelect = panel.querySelector('.att-col-y');
        if (parsed.headers && parsed.headers.length >= 2) {
          colsBox.hidden = false;
          const opts = parsed.headers.map((h, i) =>
            `<option value="${i}">${escapeHtml(String(h))}</option>`
          ).join('');
          xSelect.innerHTML = opts;
          ySelect.innerHTML = opts;
          xSelect.value = String(parsed.xIdx);
          ySelect.value = String(parsed.yIdx);
        } else {
          colsBox.hidden = true;
        }

        const rerender = async () => {
          const xi = parseInt(xSelect.value, 10);
          const yi = parseInt(ySelect.value, 10);
          if (xi === yi) {
            showToast('Cột X và Y phải khác nhau', 'danger');
            return;
          }
          try {
            const np = await reparseWithColumns(file, category, xi, yi);
            _currentPreview.parsed = np;
            previewMeta.textContent = `${file.name} · ${np.x.length} điểm · cột: ${np.xLabel} → ${np.yLabel}`;
            if (_currentChart) { try { _currentChart.destroy(); } catch (e) {} }
            _currentChart = await renderPreview(previewCanvas, np, {
              title: `${category.toUpperCase()} — ${file.name}`,
              axisSettings: readAxisSettings(),
            });
          } catch (e) {
            showToast(`Không re-parse được: ${e.message}`, 'danger');
          }
        };
        xSelect.onchange = rerender;
        ySelect.onchange = rerender;

        showTaucControlsIfApplicable(category);
        _taucState.on = false;
        taucOn.checked = false;
        _currentChart = await renderPreview(previewCanvas, parsed, {
          title: `${category.toUpperCase()} — ${file.name}`,
          axisSettings: readAxisSettings(),
        });
        // Cũng upload file gốc luôn (background) — đồ thị save riêng khi user bấm "Lưu"
        const results = await uploadMany({
          refType, refId, category, files: [file],
          onItemProgress: () => {},
        });
        if (results[0]?.ok) {
          showToast(`Đã lưu file gốc: ${file.name}`, 'success');
        }
        await refresh();
      } catch (err) {
        progress.hidden = true;
        closePreview();
        showToast(`Không đọc được dữ liệu: ${err.message}. Sẽ upload nguyên file.`, 'danger');
        // Fallback: upload normally (overlay vẫn show vì còn trong try block)
        setBusyMessage(`Đang tải lên ${file.name}...`);
        const results = await uploadMany({
          refType, refId, category, files: Array.from(files),
          onItemProgress: (name, pct) => setBusyMessage(`Đang tải lên... ${pct}%`),
        });
        if (results.some(r => r.ok)) await refresh();
      }
      return;
    }

    // Default flow: bulk upload (Round 87: parallel + overlay progress)
    setBusyMessage(`Đang tải ${files.length} file...`);
    const itemProgress: Record<string, number> = {};
    const onItemProgress = (name: string, pct: number) => {
      itemProgress[name] = pct;
      const allPcts = Object.values(itemProgress);
      const avg = Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length);
      setBusyMessage(`Đang tải lên... ${avg}% (${allPcts.length}/${files.length})`);
    };

    const results = await uploadMany({
      refType, refId, category,
      files: Array.from(files), onItemProgress,
    });

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    if (okCount) showToast(`Đã tải ${okCount} file`, 'success');
    if (failCount) showToast(`${failCount} file lỗi`, 'danger');

    setBusyMessage('Đang làm mới danh sách...');
    await refresh();
    } finally {
      hideBusyOverlay(panel as HTMLElement);
    }
  };

  cancelPreviewBtn.addEventListener('click', closePreview);

  savePlotBtn.addEventListener('click', async () => {
    if (!_currentPreview) return;
    if (isBusy()) {
      showToast('Đang xử lý, vui lòng đợi...', 'warning' as any);
      return;
    }
    const { file, parsed, category } = _currentPreview;
    savePlotBtn.disabled = true;
    savePlotBtn.querySelector('span').textContent = 'Đang xuất PNG 300 DPI...';
    showBusyOverlay(panel as HTMLElement, 'Đang xuất PNG 300 DPI...');
    try {
      // Round 82: build same parsed object that preview is currently showing
      // (raw or tauc-transformed) so saved PNG matches preview exactly.
      let parsedToRender: any = parsed;
      let plotTitle = `${category.toUpperCase()} — ${file.name.replace(/\.[^.]+$/, '')}`;
      let bandgapForRender: any = undefined;
      if (_taucState.on && _taucState.displayed === 'tauc') {
        try {
          const tauc = transformToTauc(parsed, _taucState.n,
            (taucModeSelect as HTMLSelectElement | null)?.value || 'direct');
          parsedToRender = {
            ...tauc,
            spec: parsed.spec,
            plotXLabel: tauc.xLabel,
            plotYLabel: tauc.yLabel,
            category: parsed.category,
          };
          plotTitle = `${plotTitle} (Tauc, n=${formatN(_taucState.n)})`;
          bandgapForRender = _bandgapFit;
        } catch (e) {
          console.warn('[savePlot] tauc transform failed, fallback raw:', e);
        }
      }
      const blob = await renderHighResPNG(parsedToRender, {
        title: plotTitle,
        axisSettings: readAxisSettings(),
        bandgapFit: bandgapForRender,
      });
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const pngName = `${baseName}_plot.png`;
      const pngFile = new File([blob], pngName, { type: 'image/png' });
      const results = await uploadMany({
        refType, refId, category,
        files: [pngFile], onItemProgress: () => {},
      });
      if (results[0]?.ok) {
        showToast(`Đã lưu đồ thị: ${pngName}`, 'success');
        closePreview();
        await refresh();
      } else {
        showToast(`Không lưu được đồ thị: ${results[0]?.error}`, 'danger');
      }
    } catch (err) {
      showToast(`Lỗi xuất PNG: ${err.message}`, 'danger');
    } finally {
      savePlotBtn.disabled = false;
      savePlotBtn.querySelector('span').textContent = 'Lưu đồ thị (PNG 300 DPI)';
      // Round 92: ensure overlay hides even if worker resolves successfully
      // (Round 89 worker path was missing this in finally block)
      hideBusyOverlay(panel as HTMLElement);
    }
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    e.target.value = ''; // allow re-uploading same file
  });

  // R124 Bug F: explicit click handler trên label "Chọn file" để fallback
  // nếu native <label>↔<input> association không trigger được file picker
  // trong một số browser (đặc biệt khi input bị hidden hoặc CSP strict).
  const uploadBtn = panel.querySelector('.att-upload-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', (e) => {
      // Chỉ trigger nếu click vào label/span, không phải input bên trong
      // (tránh double-fire khi label tự động delegate vào input).
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT') return;
      e.preventDefault();
      e.stopPropagation();
      (fileInput as HTMLInputElement).click();
    });
  }

  // Drag & drop — Round 90: drop trong empty state (upload moi) HOAC
  // preview state (thay the file dang preview). Cancel drop chi khi
  // dang busy upload (overlay che).
  const isEmptyState = () => (dropzone as HTMLElement).dataset.state === 'empty';
  const isPreviewState = () => (dropzone as HTMLElement).dataset.state === 'preview';

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      if (isEmptyState() || isPreviewState()) dropzone.classList.add('att-dropzone-active');
    }),
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('att-dropzone-active');
    }),
  );
  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;
    // Round 90: in preview state, drop replaces current preview
    if (isPreviewState()) {
      // Show subtle confirmation that we're replacing
      showToast('Đang thay file preview...', 'success' as any);
      closePreview();  // clear current preview state
      // After closePreview, state = 'empty' — handleFiles will work
    }
    handleFiles(files);
  });

  // Round 85: click handler — chi trigger file picker khi:
  //   a) state='empty' (chua co preview)
  //   b) target khong phai interactive child (axis input, select dropdown,
  //      buttons trong header/preview-actions/etc)
  dropzone.addEventListener('click', (e) => {
    if (!isEmptyState()) return;
    const t = e.target as HTMLElement;
    // Skip if click came from any interactive element
    if (t.closest('button, input, textarea, select, a, label, .cs-filter-trigger, .cs-filter-dropdown, [data-action], [data-att-action]')) {
      return;
    }
    fileInput.click();
  });
  dropzone.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && isEmptyState()) {
      e.preventDefault();
      fileInput.click();
    }
  });

  // Helper: download a stored file via Firebase SDK (bypasses CORS).
  // Uses storagePath from cache to call getBytes() — auth token included automatically.
  const fetchAsFile = async (attachmentId, fileName) => {
    const items = await listAttachments(refType, refId);
    const meta = items.find((it) => it.id === attachmentId);
    if (!meta) throw new Error('Không tìm thấy metadata file');
    const { getBytes, stRef } = await import('firebase/storage').then(m => ({
      getBytes: m.getBytes, stRef: m.ref,
    }));
    const { storage } = await import('../firebase.js');
    const ref = stRef(storage, meta.storagePath);
    const bytes = await getBytes(ref);
    return new File([bytes], fileName, { type: meta.mimeType || 'application/octet-stream' });
  };

  const previewExisting = async (attachmentId, url, fileName, category) => {
    const fakeFile = { name: fileName };
    if (!canAutoPlot(category) || !isParseableFile(fakeFile)) {
      // Round 82: open in-app lightbox (was window.open _blank)
      const catLabel = ATTACHMENT_CATEGORIES[category]?.label || category;
      openImageLightbox({ url, fileName, caption: catLabel });
      return;
    }
    try {
      progress.hidden = false;
      progress.textContent = `Đang đọc ${fileName}...`;
      const file = await fetchAsFile(attachmentId, fileName);
      const parsed = await parseDataFile(file, category);
      progress.hidden = true;
      _currentPreview = { file, parsed, category };
      previewBox.hidden = false;
      previewBox.dataset.state = 'preview';  // Round 83: hide empty-state, show chart
      const heuristicNote = parsed.matchedByHeuristic
        ? `cột: ${parsed.xLabel} → ${parsed.yLabel}`
        : `cột mặc định (heuristic không match — chọn lại bên dưới)`;
      previewMeta.textContent = `${fileName} · ${parsed.x.length} điểm · ${heuristicNote}`;

      const colsBox = panel.querySelector('.att-preview-cols');
      const xSelect = panel.querySelector('.att-col-x');
      const ySelect = panel.querySelector('.att-col-y');
      if (parsed.headers && parsed.headers.length >= 2) {
        colsBox.hidden = false;
        const opts = parsed.headers.map((h, i) =>
          `<option value="${i}">${escapeHtml(String(h))}</option>`
        ).join('');
        xSelect.innerHTML = opts;
        ySelect.innerHTML = opts;
        xSelect.value = String(parsed.xIdx);
        ySelect.value = String(parsed.yIdx);
      } else {
        colsBox.hidden = true;
      }

      const rerender = async () => {
        const xi = parseInt(xSelect.value, 10);
        const yi = parseInt(ySelect.value, 10);
        if (xi === yi) {
          showToast('Cột X và Y phải khác nhau', 'danger');
          return;
        }
        try {
          const np = await reparseWithColumns(file, category, xi, yi);
          _currentPreview.parsed = np;
          previewMeta.textContent = `${fileName} · ${np.x.length} điểm · cột: ${np.xLabel} → ${np.yLabel}`;
          if (_currentChart) { try { _currentChart.destroy(); } catch (e) {} }
          _currentChart = await renderPreview(previewCanvas, np, {
            title: `${category.toUpperCase()} — ${fileName}`,
            axisSettings: readAxisSettings(),
          });
        } catch (e) {
          showToast(`Không re-parse được: ${e.message}`, 'danger');
        }
      };
      xSelect.onchange = rerender;
      ySelect.onchange = rerender;

      showTaucControlsIfApplicable(category);
      _taucState.on = false;
      taucOn.checked = false;
      if (_currentChart) { try { _currentChart.destroy(); } catch (e) {} }
      _currentChart = await renderPreview(previewCanvas, parsed, {
        title: `${category.toUpperCase()} — ${fileName}`,
        axisSettings: readAxisSettings(),
      });
      previewBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      progress.hidden = true;
      showToast(`Không xem trước được: ${err.message}`, 'danger');
    }
  };

  // ─── Round 75a: Inline category edit dropdown ──────────────────
  // When badge is clicked, replace it with a <select> right in place.
  // On change, update Firebase + refresh list. Click outside or Escape to revert.
  let _activeEditBadge: HTMLButtonElement | null = null;

  const closeEditBadge = () => {
    if (!_activeEditBadge) return;
    const editingBadge = _activeEditBadge;
    _activeEditBadge = null;
    // Restore original badge HTML (re-render the parent row)
    refresh();
    editingBadge.dispatchEvent(new CustomEvent('badge-closed'));
  };

  const openEditBadge = (badgeBtn: HTMLButtonElement) => {
    if (_activeEditBadge) closeEditBadge();
    _activeEditBadge = badgeBtn;

    const id = badgeBtn.dataset.id || '';
    const currentCat = badgeBtn.dataset.category || '';
    const optsHTML = Object.entries(ATTACHMENT_CATEGORIES)
      .map(([key, def]) => `<option value="${escapeHtml(key)}"${key === currentCat ? ' selected' : ''}>${escapeHtml(def.label)}</option>`)
      .join('');
    // Replace badge with select in place
    const select = document.createElement('select');
    select.className = 'att-cat-select-inline';
    select.innerHTML = optsHTML;
    select.dataset.id = id;
    select.dataset.oldCategory = currentCat;
    badgeBtn.replaceWith(select);

    select.focus();
    select.addEventListener('change', async () => {
      const newCat = select.value;
      const oldCat = select.dataset.oldCategory || '';
      if (newCat === oldCat) {
        _activeEditBadge = null;
        refresh();
        return;
      }
      try {
        select.disabled = true;
        await updateAttachmentCategory({
          refType, refId, attachmentId: id, newCategory: newCat,
        });
        const oldLabel = ATTACHMENT_CATEGORIES[oldCat]?.label || oldCat;
        const newLabel = ATTACHMENT_CATEGORIES[newCat]?.label || newCat;
        showToast(`Đã đổi: ${oldLabel} → ${newLabel}`, 'success');
        _activeEditBadge = null;
        await refresh();
      } catch (err: any) {
        showToast(`Lỗi: ${err.message}`, 'danger');
        select.disabled = false;
      }
    });
    select.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeEditBadge();
      }
    });
    // Close on click outside the select
    setTimeout(() => {
      document.addEventListener('click', onDocClickOutside, true);
    }, 0);
  };

  const onDocClickOutside = (e: Event) => {
    if (!_activeEditBadge) {
      document.removeEventListener('click', onDocClickOutside, true);
      return;
    }
    const target = e.target as HTMLElement;
    const inSelect = target.closest('.att-cat-select-inline');
    if (!inSelect) {
      document.removeEventListener('click', onDocClickOutside, true);
      closeEditBadge();
    }
  };

  // Click delegation: edit-category | delete | preview | open
  list.addEventListener('click', async (e) => {
    // Edit category badge — open inline dropdown
    const editBadge = (e.target as HTMLElement).closest('.att-badge-edit') as HTMLButtonElement | null;
    if (editBadge) {
      e.preventDefault();
      e.stopPropagation();
      openEditBadge(editBadge);
      return;
    }

    // Round 95+96: Origin launch button (with auto-plot LabTalk script)
    const originBtn = e.target.closest('.att-origin-btn');
    if (originBtn) {
      e.preventDefault();
      e.stopPropagation();
      const url = originBtn.dataset.url;
      const fileName = originBtn.dataset.filename;
      const itemCategory = originBtn.dataset.category;
      const itemId = originBtn.dataset.id;
      if (!url || !fileName) return;
      try {
        originBtn.disabled = true;
        showToast(`Đang tải ${fileName} về Downloads...`, 'info' as any);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();

        // Round 96: generate LabTalk auto-plot script with axis settings
        // matching what user has configured in the web preview (if available
        // for this attachment from saved metadata)
        let ogsScript: string | undefined = undefined;
        try {
          // Lookup attachment metadata to get saved axisSettings (Round 82)
          const meta = await listAttachments(refType, refId)
            .then((arr) => arr.find((a) => a.id === itemId));
          const cat = itemCategory || 'other';
          ogsScript = generateOgsScript({
            dataFilename: fileName,
            category: cat,
            // Labels & ranges are derived in origin-labtalk.ts based on category;
            // user-set axis settings (Round 82) override defaults if present
            axisSettings: (meta as any)?.axisSettings,
            reverseX: false,
          });
        } catch (e) {
          console.warn('[origin] Failed to generate .ogs script:', e);
          // Fall through — launch Origin without auto-plot script
        }

        await downloadAndOpenInOrigin(blob, fileName, ogsScript);
        showToast(
          ogsScript
            ? `Đã tải ${fileName} + script · Origin sẽ tự mở và vẽ đồ thị`
            : `Đã tải ${fileName} · Origin sẽ mở`,
          'success', null, 6000,
        );
      } catch (err: any) {
        showToast(`Lỗi: ${err.message}`, 'danger');
      } finally {
        originBtn.disabled = false;
      }
      return;
    }

    // Delete button
    const delBtn = e.target.closest('.att-del');
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = delBtn.dataset.id;
      if (!id) return;
      if (!confirm('Xoá tài liệu này? Không thể hoàn tác.')) return;
      try {
        delBtn.disabled = true;
        await deleteAttachment({ refType, refId, attachmentId: id });
        showToast('Đã xoá', 'success');
        await refresh();
      } catch (err) {
        showToast(`Lỗi: ${err.message}`, 'danger');
        delBtn.disabled = false;
      }
      return;
    }

    // Item click (preview or open)
    const item = e.target.closest('.att-link');
    if (!item) return;
    e.preventDefault();
    const action = item.dataset.action;
    const url = item.dataset.url;
    const fileName = item.dataset.filename;
    const category = item.dataset.category;
    const attachmentId = item.dataset.id;
    if (action === 'preview') {
      await previewExisting(attachmentId, url, fileName, category);
    } else {
      // Round 82: open in-app lightbox (was window.open _blank)
      const catLabel = ATTACHMENT_CATEGORIES[category]?.label || category;
      openImageLightbox({ url, fileName, caption: catLabel });
    }
  });

  // ─── Round 75b: Custom axis controls helpers ─────────────────────
  const axInputs = {
    xMin:   panel.querySelector('.att-ax-x-min'),
    xMax:   panel.querySelector('.att-ax-x-max'),
    xStep:  panel.querySelector('.att-ax-x-step'),
    xMinor: panel.querySelector('.att-ax-x-minor'),
    yMin:   panel.querySelector('.att-ax-y-min'),
    yMax:   panel.querySelector('.att-ax-y-max'),
    yStep:  panel.querySelector('.att-ax-y-step'),
    yMinor: panel.querySelector('.att-ax-y-minor'),
  };

  const _readNum = (el: any) => {
    const v = el?.value;
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  };

  const readAxisSettings = () => {
    return {
      x: {
        min: _readNum(axInputs.xMin),
        max: _readNum(axInputs.xMax),
        stepMajor: _readNum(axInputs.xStep),
        minorPerMajor: _readNum(axInputs.xMinor),
      },
      y: {
        min: _readNum(axInputs.yMin),
        max: _readNum(axInputs.yMax),
        stepMajor: _readNum(axInputs.yStep),
        minorPerMajor: _readNum(axInputs.yMinor),
      },
    };
  };

  // Set form inputs from a saved axisSettings object (for previewExisting)
  const writeAxisToDOM = (s: any) => {
    const setVal = (el: any, v: any) => {
      if (el) el.value = (v === null || v === undefined) ? '' : String(v);
    };
    setVal(axInputs.xMin,   s?.x?.min);
    setVal(axInputs.xMax,   s?.x?.max);
    setVal(axInputs.xStep,  s?.x?.stepMajor);
    setVal(axInputs.xMinor, s?.x?.minorPerMajor);
    setVal(axInputs.yMin,   s?.y?.min);
    setVal(axInputs.yMax,   s?.y?.max);
    setVal(axInputs.yStep,  s?.y?.stepMajor);
    setVal(axInputs.yMinor, s?.y?.minorPerMajor);
  };

  const clearAxisDOM = () => writeAxisToDOM(null);

  // Re-render the current chart with current axis settings.
  // Called after input change (debounced) and from save/reset.
  const reRenderWithAxis = async () => {
    if (!_currentPreview) return;
    const { parsed } = _currentPreview;
    const axisSettings = readAxisSettings();
    if (_currentChart) { try { _currentChart.destroy(); } catch (e) {} _currentChart = null; }
    const previewCanvas = panel.querySelector('.att-preview-canvas');
    _currentChart = await renderPreview(previewCanvas, parsed, {
      title: '', axisSettings,
    });
  };

  // Wire input listeners (debounce 200ms)
  Object.values(axInputs).forEach((inp: any) => {
    if (!inp) return;
    inp.addEventListener('input', () => {
      if (_axisLiveTimer) clearTimeout(_axisLiveTimer);
      _axisLiveTimer = setTimeout(reRenderWithAxis, 200);
    });
  });

  // Reset button: clear all inputs + re-render auto + clear DB if persisted
  if (axResetBtn) {
    axResetBtn.addEventListener('click', async () => {
      clearAxisDOM();
      if (axStatus) axStatus.textContent = '';
      await reRenderWithAxis();
      // Persist reset only if file already saved (has attachmentId)
      const aid = _currentPreview?.attachmentId;
      if (aid) {
        try {
          (axResetBtn as any).disabled = true;
          await updateAttachmentAxisSettings({ refType, refId, attachmentId: aid, axisSettings: null });
          showToast('Đã reset cài đặt trục', 'success');
          if (axStatus) axStatus.textContent = '✓ đã reset';
        } catch (e: any) {
          showToast(`Lỗi reset: ${e.message}`, 'danger');
        } finally {
          (axResetBtn as any).disabled = false;
        }
      }
    });
  }

  // Round 88: helper to update axSaveBtn enable/disable state based on
  // whether the current preview is for an already-uploaded attachment.
  // For new files (preview before upload), nut nay disabled — user dung
  // 'Luu do thi (PNG 300 DPI)' de luu PNG voi axis hien tai.
  const updateAxSaveBtnState = () => {
    if (!axSaveBtn) return;
    const aid = _currentPreview?.attachmentId;
    if (aid) {
      (axSaveBtn as HTMLButtonElement).disabled = false;
      axSaveBtn.setAttribute('title', 'Lưu cài đặt trục cho file này (xem lại sẽ giữ đúng cài đặt)');
    } else {
      (axSaveBtn as HTMLButtonElement).disabled = true;
      axSaveBtn.setAttribute('title', 'Cài đặt sẽ áp dụng vào PNG khi bấm "Lưu đồ thị" (file mới)');
    }
  };
  // Round 88: expose helper so preview-init code can call it
  (panel as any)._updateAxSaveBtnState = updateAxSaveBtnState;
  // Initial state
  updateAxSaveBtnState();

  // Save button: persist current settings to RTDB
  if (axSaveBtn) {
    axSaveBtn.addEventListener('click', async () => {
      const aid = _currentPreview?.attachmentId;
      if (!aid) {
        // Defensive: shouldn't happen since button is disabled, but keep guard
        showToast('Cài đặt này sẽ tự áp dụng khi bấm "Lưu đồ thị"', 'success' as any);
        return;
      }
      const settings = readAxisSettings();
      try {
        (axSaveBtn as any).disabled = true;
        await updateAttachmentAxisSettings({
          refType, refId, attachmentId: aid, axisSettings: settings,
        });
        showToast('Đã lưu cài đặt trục', 'success');
        if (axStatus) axStatus.textContent = '✓ đã lưu';
      } catch (e: any) {
        showToast(`Lỗi lưu: ${e.message}`, 'danger');
      } finally {
        (axSaveBtn as any).disabled = false;
      }
    });
  }

  // Round 77b: "Tổng quan" button → open overview modal
  const overviewBtn = panel.querySelector('.att-overview-btn');
  if (overviewBtn) {
    overviewBtn.addEventListener('click', () => {
      const fn = (window as any).openOverviewModal;
      if (typeof fn === 'function') {
        // Pull title from parent attachments modal title if available
        const attTitle = document.querySelector('#modal-attachments-title')?.textContent || '';
        fn({ refType, refId, title: attTitle.replace(/^Tài liệu\s*[—-]\s*/, '') });
      } else {
        console.warn('[panel] openOverviewModal not available');
      }
    });
  }

  // Listen for cache updates pushed from listeners.js
  const onCacheUpdate = (e) => {
    if (e.detail?.col === 'attachments') refresh();
  };
  window.addEventListener('cache-update', onCacheUpdate);

  // Cleanup hook (caller can store this)
  panel._cleanup = () => {
    window.removeEventListener('cache-update', onCacheUpdate);
  };

  refresh();

  // Wrap select Loại bằng custom-select (giống các filter status khác trong app)
  setTimeout(() => {
    if (typeof window.initCustomFilters === 'function') {
      try { window.initCustomFilters(); } catch (e) { console.warn('[att] initCustomFilters:', e); }
    }
  }, 50);

  return panel;
}

/**
 * Convenience: open as a standalone modal (used by row "📎" button).
 * Requires global `openModal` from ui/modal.js.
 */
export function openAttachmentsModal({ refType, refId, title = '' }) {
  const modalId = 'modal-attachments';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${modalId}-title">
        <div class="modal-header">
          <div class="modal-title" id="${modalId}-title">Tài liệu thí nghiệm</div>
          <button class="modal-close" type="button" aria-label="Đóng" data-att-action="close-modal" data-modal-id="${modalId}">✕</button>
        </div>
        <div class="modal-body" style="padding:16px">
          <div class="att-host"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  modal.querySelector(`#${modalId}-title`).textContent =
    title || 'Tài liệu thí nghiệm';
  const host = modal.querySelector('.att-host');
  // Cleanup previous mount if any
  host._panel?._cleanup?.();
  host.innerHTML = '';
  const panel = mountAttachmentsPanel(host, { refType, refId });
  host._panel = panel;

  // Click overlay → close (with confirm if preview/upload in progress)
  // Idempotent: chỉ gắn listener 1 lần cho element modal
  if (!modal.dataset.clickOutsideBound) {
    modal.dataset.clickOutsideBound = '1';
    modal.addEventListener('click', (e) => {
      // Click vào content (.modal trắng) → ignore
      if (e.target.closest('.modal')) return;
      // Click vào overlay → check state
      const currentHost = modal.querySelector('.att-host');
      const currentPanel = currentHost?._panel;
      if (!currentPanel) {
        window.closeModal?.(modalId);
        return;
      }
      const previewBox = currentPanel.querySelector('.att-preview');
      const progress = currentPanel.querySelector('.att-progress');
      const hasPreview = previewBox && !previewBox.hidden;
      const isUploading = progress && !progress.hidden;
      if (hasPreview || isUploading) {
        const msg = isUploading
          ? 'Đang tải file. Đóng modal sẽ hủy thao tác. Tiếp tục?'
          : 'Bạn đang xem trước đồ thị. Nếu chưa lưu sẽ mất xem trước. Đóng?';
        if (!confirm(msg)) return;
      }
      window.closeModal?.(modalId);
    });
  }

  window.openModal?.(modalId);
}

// ─── Round 70: Event delegation for attachments-panel close button ────────
function attachAttachmentsPanelDelegation(): void {
  const flag = '__attDelegationAttached';
  if ((document.body as any)[flag]) return;
  (document.body as any)[flag] = true;

  document.body.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-att-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.attAction;
    if (action === 'close-modal') {
      const modalId = target.dataset.modalId || '';
      if (modalId && typeof (window as any).closeModal === 'function') {
        (window as any).closeModal(modalId);
      }
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAttachmentsPanelDelegation);
  } else {
    attachAttachmentsPanelDelegation();
  }
}
