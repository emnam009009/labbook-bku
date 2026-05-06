// src/ts/ui/pdf-export-modal.ts
// @ts-nocheck
// Modal "Xuất dữ liệu" — chọn ảnh + page size + orientation → preview → download

import { listAttachments, ATTACHMENT_CATEGORIES } from '../services/attachments.js';
import { generatePdfReport, downloadBlob, PAGE_SIZES } from '../services/pdf/pdf-report.js';
import { showToast } from './toast.js';

const MODAL_ID = 'modal-attachments-export';

let _currentBlob = null;
let _currentBlobURL = null;
let _currentFilename = '';

function ensureModalDOM() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-labelledby="${MODAL_ID}-title">
      <div class="modal-header">
        <h3 class="modal-title" id="${MODAL_ID}-title">Tạo PDF báo cáo</h3>
        <button class="modal-close" aria-label="Đóng" data-close>×</button>
      </div>
      <div class="modal-body">
        <div class="pdf-export-host"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('[data-close]').addEventListener('click', () => {
    cleanupBlob();
    window.closeModal?.(MODAL_ID);
  });

  modal.addEventListener('click', (e) => {
    if (e.target.closest('.modal')) return;
    cleanupBlob();
    window.closeModal?.(MODAL_ID);
  });

  return modal;
}

function cleanupBlob() {
  if (_currentBlobURL) {
    URL.revokeObjectURL(_currentBlobURL);
    _currentBlobURL = null;
  }
  _currentBlob = null;
  _currentFilename = '';
}

function buildConfigPanel({ refType, refId, record }) {
  const recordLabel = record?.code || refId;
  return `
    <div class="pdf-export-panel" data-stage="config">
      <div class="pdf-export-info">
        <strong>${refType === 'hydro' ? 'Hydrothermal' : 'Điện cực'}</strong>: ${recordLabel}
      </div>

      <div class="pdf-export-row">
        <label>Khổ giấy:</label>
        <select class="pdf-page-size">
          <option value="a4" selected>A4 (210×297 mm)</option>
          <option value="letter">Letter (216×279 mm)</option>
        </select>

        <label>Hướng:</label>
        <select class="pdf-orientation">
          <option value="portrait" selected>Dọc (2×2 = 4 ảnh/trang)</option>
          <option value="landscape">Ngang (3×2 = 6 ảnh/trang)</option>
        </select>
      </div>

      <div class="pdf-export-row">
        <strong>Chọn nội dung đưa vào PDF</strong>
        <div class="pdf-select-actions">
          <button type="button" class="btn-text pdf-select-all">Chọn tất cả ảnh</button>
          <span class="pdf-sep">·</span>
          <button type="button" class="btn-text pdf-deselect-all">Bỏ chọn</button>
        </div>
      </div>

      <ul class="pdf-file-list">
        <li class="pdf-file-loading">Đang tải danh sách...</li>
      </ul>

      <div class="pdf-export-progress" hidden>
        <div class="pdf-progress-bar"><div class="pdf-progress-fill"></div></div>
        <div class="pdf-progress-text">Đang tạo PDF...</div>
      </div>

      <div class="pdf-export-actions">
        <button type="button" class="btn-secondary pdf-cancel-btn">Hủy</button>
        <button type="button" class="btn-primary pdf-generate-btn" disabled>
          <span class="pdf-generate-label">Tạo PDF</span>
        </button>
      </div>
    </div>
  `;
}

function buildPreviewPanel(filename) {
  return `
    <div class="pdf-export-panel" data-stage="preview">
      <div class="pdf-preview-info">
        <strong>${filename}</strong>
        <span>Xem trước trước khi tải về máy</span>
      </div>
      <iframe class="pdf-preview-frame" title="PDF Preview"></iframe>
      <div class="pdf-export-actions">
        <button type="button" class="btn-secondary pdf-back-btn">← Quay lại</button>
        <button type="button" class="btn-secondary pdf-close-preview-btn">Đóng</button>
        <button type="button" class="btn-primary pdf-download-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Tải về</span>
        </button>
      </div>
    </div>
  `;
}

function renderFileList(panel, attachments) {
  const ul = panel.querySelector('.pdf-file-list');
  if (!attachments.length) {
    ul.innerHTML = '<li class="pdf-file-empty">Chưa có file đính kèm nào.</li>';
    return;
  }

  ul.innerHTML = attachments.map((att, idx) => {
    const isImage = /^image\//.test(att.mimeType);
    const cat = ATTACHMENT_CATEGORIES[att.category];
    const catLabel = cat?.label || att.category;
    const sizeKB = (att.size / 1024).toFixed(0);
    const dateStr = new Date(att.uploadedAt).toLocaleDateString('vi-VN');
    return `
      <li class="pdf-file-item ${isImage ? '' : 'is-non-image'}">
        <label>
          <input type="checkbox"
            class="pdf-file-cb"
            data-idx="${idx}"
            ${isImage ? 'checked' : 'disabled'} />
          <span class="pdf-file-meta">
            <span class="pdf-file-cat" style="background:${cat?.color || '#e5e7eb'};color:${cat?.fg || '#374151'}">${catLabel}</span>
            <span class="pdf-file-name">${att.fileName}</span>
            <span class="pdf-file-size">${sizeKB} KB · ${dateStr}</span>
            ${isImage ? '' : '<em class="pdf-file-skip">(không phải ảnh, sẽ bỏ qua)</em>'}
          </span>
        </label>
      </li>
    `;
  }).join('');
}

function getSelectedAttachments(panel, attachments) {
  const checks = panel.querySelectorAll('.pdf-file-cb:checked');
  return Array.from(checks).map(cb => attachments[parseInt(cb.dataset.idx, 10)]);
}

function updateGenerateButton(panel, count) {
  const btn = panel.querySelector('.pdf-generate-btn');
  const label = panel.querySelector('.pdf-generate-label');
  btn.disabled = count === 0;
  label.textContent = count > 0 ? `Tạo PDF (${count} ảnh)` : 'Tạo PDF';
}

function showPreview(host, filename) {
  cleanupBlob.__keep = true;  // dummy, ignore
  host.innerHTML = buildPreviewPanel(filename);

  const frame = host.querySelector('.pdf-preview-frame');
  _currentBlobURL = URL.createObjectURL(_currentBlob);
  frame.src = _currentBlobURL;

  const downloadBtn = host.querySelector('.pdf-download-btn');
  const closeBtn = host.querySelector('.pdf-close-preview-btn');
  const backBtn = host.querySelector('.pdf-back-btn');

  downloadBtn.addEventListener('click', () => {
    downloadBlob(_currentBlob, _currentFilename);
    showToast(`Đã tải xuống: ${_currentFilename}`, 'success');
  });

  closeBtn.addEventListener('click', () => {
    cleanupBlob();
    window.closeModal?.(MODAL_ID);
  });

  backBtn.addEventListener('click', () => {
    cleanupBlob();
    // Remount config panel (re-fetch attachments để reset state)
    host.dataset.remount = '1';
    host.dispatchEvent(new CustomEvent('pdf:back', { bubbles: true }));
  });
}

export async function openPdfExportModal(refType, refId) {
  const modal = ensureModalDOM();
  const host = modal.querySelector('.pdf-export-host');

  cleanupBlob();

  const record = window.cache?.[refType]?.[refId] || {};
  let attachments = [];

  const mountConfigStage = async () => {
    host.innerHTML = buildConfigPanel({ refType, refId, record });
    const panel = host.querySelector('.pdf-export-panel');

    const pageSizeSel = panel.querySelector('.pdf-page-size');
    const orientationSel = panel.querySelector('.pdf-orientation');
    const generateBtn = panel.querySelector('.pdf-generate-btn');
    const cancelBtn = panel.querySelector('.pdf-cancel-btn');
    const progressBox = panel.querySelector('.pdf-export-progress');
    const progressFill = panel.querySelector('.pdf-progress-fill');
    const progressText = panel.querySelector('.pdf-progress-text');

    cancelBtn.addEventListener('click', () => {
      cleanupBlob();
      window.closeModal?.(MODAL_ID);
    });

    if (!attachments.length) {
      try {
        attachments = await listAttachments(refType, refId);
      } catch (e) {
        showToast(`Lỗi tải danh sách: ${e.message}`, 'danger');
        return;
      }
    }
    renderFileList(panel, attachments);

    panel.addEventListener('change', (e) => {
      if (e.target.classList.contains('pdf-file-cb')) {
        const selected = getSelectedAttachments(panel, attachments);
        updateGenerateButton(panel, selected.length);
      }
    });

    panel.querySelector('.pdf-select-all').addEventListener('click', () => {
      panel.querySelectorAll('.pdf-file-cb:not(:disabled)').forEach(cb => cb.checked = true);
      updateGenerateButton(panel, getSelectedAttachments(panel, attachments).length);
    });
    panel.querySelector('.pdf-deselect-all').addEventListener('click', () => {
      panel.querySelectorAll('.pdf-file-cb:not(:disabled)').forEach(cb => cb.checked = false);
      updateGenerateButton(panel, 0);
    });

    const initialSelected = getSelectedAttachments(panel, attachments);
    updateGenerateButton(panel, initialSelected.length);

    generateBtn.addEventListener('click', async () => {
      const selected = getSelectedAttachments(panel, attachments);
      if (!selected.length) return;

      const pageSize = pageSizeSel.value;
      const orientation = orientationSel.value;

      generateBtn.disabled = true;
      cancelBtn.disabled = true;
      progressBox.hidden = false;
      progressFill.style.width = '0%';
      progressText.textContent = 'Đang chuẩn bị...';

      try {
        const blob = await generatePdfReport({
          record, refType, refId, attachments: selected, pageSize, orientation,
          onProgress: (cur, tot, name) => {
            const pct = Math.round((cur / tot) * 100);
            progressFill.style.width = pct + '%';
            progressText.textContent = `Đang xử lý ${cur}/${tot}: ${name}`;
          },
        });

        const recCode = record?.code || refId;
        const ts = new Date().toISOString().slice(0, 10);
        const fname = `${recCode}_report_${ts}.pdf`;

        _currentBlob = blob;
        _currentFilename = fname;

        // Switch to preview stage
        showPreview(host, fname);
      } catch (e) {
        console.error('[pdf-export]', e);
        showToast(`Lỗi tạo PDF: ${e.message}`, 'danger');
        generateBtn.disabled = false;
        cancelBtn.disabled = false;
        progressBox.hidden = true;
      }
    });
  };

  // Listen for back button → remount
  host.addEventListener('pdf:back', mountConfigStage);

  await mountConfigStage();
  window.openModal?.(MODAL_ID);
}

window.openPdfExportModal = openPdfExportModal;
