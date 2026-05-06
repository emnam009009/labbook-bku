// src/ts/ui/pdf-preview-lightbox.ts
// Round 95: PDF preview lightbox — full-screen overlay similar to
// image-lightbox (Round 82). PDF.js viewer in iframe has built-in
// zoom/page nav toolbar, so we just give it generous viewport space.

interface PdfLightboxOpts {
  blob: Blob;
  filename: string;
  onDownload?: () => void;  // 'Tai ve' click
  onBack?: () => void;       // 'Quay lai' click (return to config)
}

const MODAL_ID = 'modal-pdf-lightbox';

let _modalEl: HTMLElement | null = null;
let _escHandler: ((e: KeyboardEvent) => void) | null = null;
let _currentBlobURL: string | null = null;

function _ensureModal(): HTMLElement {
  if (_modalEl && document.body.contains(_modalEl)) return _modalEl;
  const m = document.createElement('div');
  m.id = MODAL_ID;
  m.className = 'pdf-lightbox-overlay';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-label', 'Xem trước PDF');
  m.innerHTML = `
    <button type="button" class="pdf-lightbox-close" aria-label="Đóng">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div class="pdf-lightbox-stage">
      <div class="pdf-lightbox-info">
        <strong class="pdf-lightbox-filename"></strong>
        <span>Xem trước · sử dụng thanh công cụ PDF để zoom / chuyển trang</span>
      </div>
      <iframe class="pdf-lightbox-frame" title="PDF Preview"></iframe>
      <div class="pdf-lightbox-actions">
        <button type="button" class="pdf-lightbox-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span>Quay lại</span>
        </button>
        <button type="button" class="pdf-lightbox-download-btn">
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
  document.body.appendChild(m);
  // Click overlay (but not stage children) → close
  m.addEventListener('click', (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.pdf-lightbox-stage') || t.closest('.pdf-lightbox-close')) {
      // close button handled separately below
      return;
    }
    closePdfLightbox();
  });
  _modalEl = m;
  return m;
}

export function openPdfLightbox(opts: PdfLightboxOpts): void {
  const m = _ensureModal();
  const filenameEl = m.querySelector<HTMLElement>('.pdf-lightbox-filename')!;
  const frame = m.querySelector<HTMLIFrameElement>('.pdf-lightbox-frame')!;
  const downloadBtn = m.querySelector<HTMLButtonElement>('.pdf-lightbox-download-btn')!;
  const backBtn = m.querySelector<HTMLButtonElement>('.pdf-lightbox-back-btn')!;
  const closeBtn = m.querySelector<HTMLButtonElement>('.pdf-lightbox-close')!;

  // Cleanup any previous blob URL
  if (_currentBlobURL) {
    try { URL.revokeObjectURL(_currentBlobURL); } catch (e) {}
  }
  _currentBlobURL = URL.createObjectURL(opts.blob);

  filenameEl.textContent = opts.filename;
  frame.src = _currentBlobURL;

  m.classList.add('pdf-lightbox-visible');
  document.body.classList.add('pdf-lightbox-locked');

  downloadBtn.onclick = () => {
    if (opts.onDownload) opts.onDownload();
  };
  backBtn.onclick = () => {
    closePdfLightbox();
    if (opts.onBack) opts.onBack();
  };
  closeBtn.onclick = () => closePdfLightbox();

  // ESC handler
  if (_escHandler) document.removeEventListener('keydown', _escHandler);
  _escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePdfLightbox();
  };
  document.addEventListener('keydown', _escHandler);
}

export function closePdfLightbox(): void {
  if (!_modalEl) return;
  _modalEl.classList.remove('pdf-lightbox-visible');
  document.body.classList.remove('pdf-lightbox-locked');
  if (_escHandler) {
    document.removeEventListener('keydown', _escHandler);
    _escHandler = null;
  }
  // Clear iframe src so PDF doesn't keep rendering hidden
  const frame = _modalEl.querySelector<HTMLIFrameElement>('.pdf-lightbox-frame');
  if (frame) frame.src = 'about:blank';
  // Cleanup blob URL after a delay (let iframe finish unloading)
  if (_currentBlobURL) {
    const url = _currentBlobURL;
    _currentBlobURL = null;
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 100);
  }
}
