// src/js/ui/attachments-panel.js
// Renders attachments management UI for one experiment.
// Designed to be embedded inside hydro/electrode edit modal.

import {
  ATTACHMENT_CATEGORIES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_EXPERIMENT,
  listAttachments,
  uploadMany,
  deleteAttachment,
} from '../services/attachments.js';
import { showToast } from './toast.js';
import { canDelete } from '../utils/auth-helpers.js';
import { escapeHtml, fmtDate } from '../utils/format.js';
import { canAutoPlot, isParseableFile, parseDataFile, reparseWithColumns } from '../services/parsers/index.js';
import { renderPreview, renderHighResPNG } from '../services/plot/plot-preview.js';
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
          <input type="file" class="att-file-input" multiple hidden />
          <span>Chọn file</span>
        </label>
        <span class="att-counter" aria-live="polite"></span>
      </div>

      <div class="att-workspace">
        <div class="att-dropzone" tabindex="0" role="button"
             aria-label="Kéo thả file vào đây để tải lên">
          <span>Kéo thả file vào đây hoặc bấm <strong class="att-pick-link">Chọn file</strong></span>
          <small>Tối đa ${MAX_FILES_PER_EXPERIMENT} file, mỗi file ≤ ${formatBytes(MAX_FILE_BYTES)}</small>
        </div>
        <div class="att-preview" hidden>
          <div class="att-preview-header">
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
          <div class="att-preview-canvas-wrap">
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
  const dropzone = panel.querySelector('.att-dropzone');
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
            <small>
              <span class="att-badge att-badge-${escapeHtml(it.category)}">${escapeHtml(catLabel)}</span>
              · ${formatBytes(it.size)} · ${fmtDate(it.uploadedAt)}
            </small>
          </div>
        </button>
        ${delBtn}
      </li>
    `;
  };

  // ----- Upload handlers -----

  // State for preview
  const previewBox = panel.querySelector('.att-preview');
  const previewCanvas = panel.querySelector('.att-preview-canvas');
  const previewMeta = panel.querySelector('.att-preview-meta');
  const savePlotBtn = panel.querySelector('.att-save-plot');
  const cancelPreviewBtn = panel.querySelector('.att-cancel-preview');
  let _currentPreview = null; // { file, parsed, category }
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
      _currentChart = await renderPreview(previewCanvas, parsed, { title: titleBase });
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
    previewBox.hidden = true;
  };

  const handleFiles = async (files) => {
    if (!files || !files.length) return;
    const category = catSelect.value;

    // If single file AND parseable AND category supports auto-plot → preview
    if (files.length === 1 && canAutoPlot(category) && isParseableFile(files[0])) {
      const file = files[0];
      try {
        progress.hidden = false;
        progress.textContent = `Đang đọc ${file.name}...`;
        const parsed = await parseDataFile(file, category);
        progress.hidden = true;
        _currentPreview = { file, parsed, category };
        previewBox.hidden = false;
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
        // Fallback: upload normally
        const results = await uploadMany({
          refType, refId, category, files: Array.from(files),
          onItemProgress: () => {},
        });
        if (results.some(r => r.ok)) await refresh();
      }
      return;
    }

    // Default flow: bulk upload
    progress.hidden = false;
    progress.textContent = `Đang tải ${files.length} file...`;
    const itemProgress = {};
    const onItemProgress = (name, pct) => {
      itemProgress[name] = pct;
      const parts = Object.entries(itemProgress)
        .map(([n, p]) => `${n}: ${p}%`)
        .join(' · ');
      progress.textContent = parts;
    };

    const results = await uploadMany({
      refType, refId, category,
      files: Array.from(files), onItemProgress,
    });

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    progress.hidden = true;
    if (okCount) showToast(`Đã tải ${okCount} file`, 'success');
    if (failCount) showToast(`${failCount} file lỗi`, 'danger');

    await refresh();
  };

  cancelPreviewBtn.addEventListener('click', closePreview);

  savePlotBtn.addEventListener('click', async () => {
    if (!_currentPreview) return;
    const { file, parsed, category } = _currentPreview;
    savePlotBtn.disabled = true;
    savePlotBtn.querySelector('span').textContent = 'Đang xuất PNG 300 DPI...';
    try {
      const blob = await renderHighResPNG(parsed, {
        title: `${category.toUpperCase()} — ${file.name.replace(/\.[^.]+$/, '')}`,
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
    }
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    e.target.value = ''; // allow re-uploading same file
  });

  // Drag & drop
  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('att-dropzone-active');
    }),
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('att-dropzone-active');
    }),
  );
  dropzone.addEventListener('drop', (e) => {
    handleFiles(e.dataTransfer?.files);
  });
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
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
      window.open(url, '_blank', 'noopener');
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
      });
      previewBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      progress.hidden = true;
      showToast(`Không xem trước được: ${err.message}`, 'danger');
    }
  };

  // Click delegation: delete | preview | open
  list.addEventListener('click', async (e) => {
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
      window.open(url, '_blank', 'noopener');
    }
  });

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
          <button class="modal-close" type="button" aria-label="Đóng" onclick="closeModal('${modalId}')">✕</button>
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
