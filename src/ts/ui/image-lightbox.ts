// src/ts/ui/image-lightbox.ts
// Round 82: Image lightbox modal — display attached images full-size
// inside the app (no new tab). Click overlay or ESC to close.

import { escapeHtml } from '../utils/format.js';

interface LightboxOpts {
  url: string;
  fileName?: string;
  caption?: string;  // e.g. "XRD • 260.8 KB"
}

const MODAL_ID = 'modal-image-lightbox';

let _modalEl: HTMLElement | null = null;
let _escHandler: ((e: KeyboardEvent) => void) | null = null;

function _ensureModal(): HTMLElement {
  if (_modalEl && document.body.contains(_modalEl)) return _modalEl;
  const m = document.createElement('div');
  m.id = MODAL_ID;
  m.className = 'img-lightbox-overlay';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-label', 'Xem ảnh');
  m.innerHTML = `
    <button type="button" class="img-lightbox-close" aria-label="Đóng">✕</button>
    <div class="img-lightbox-stage">
      <img class="img-lightbox-img" alt="" />
      <div class="img-lightbox-caption"></div>
    </div>
  `;
  document.body.appendChild(m);
  // Click overlay (but not the image/caption) → close
  m.addEventListener('click', (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.img-lightbox-img')) return;
    closeImageLightbox();
  });
  _modalEl = m;
  return m;
}

export function openImageLightbox(opts: LightboxOpts): void {
  const m = _ensureModal();
  const img = m.querySelector<HTMLImageElement>('.img-lightbox-img')!;
  const caption = m.querySelector<HTMLElement>('.img-lightbox-caption')!;
  // Reset state
  img.src = '';
  img.alt = opts.fileName || '';
  caption.textContent = '';
  // Show modal first (with loading state) then load image
  m.classList.add('img-lightbox-loading');
  m.classList.add('img-lightbox-visible');
  document.body.classList.add('img-lightbox-locked');

  img.onload = () => {
    m.classList.remove('img-lightbox-loading');
  };
  img.onerror = () => {
    m.classList.remove('img-lightbox-loading');
    caption.textContent = `Không tải được ảnh: ${opts.fileName || ''}`;
  };
  img.src = opts.url;

  // Caption text
  const parts: string[] = [];
  if (opts.fileName) parts.push(opts.fileName);
  if (opts.caption) parts.push(opts.caption);
  caption.innerHTML = parts.map(escapeHtml).join(' • ');

  // ESC handler
  if (_escHandler) document.removeEventListener('keydown', _escHandler);
  _escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeImageLightbox();
  };
  document.addEventListener('keydown', _escHandler);

  // Close button delegation
  m.querySelector<HTMLButtonElement>('.img-lightbox-close')!.onclick = () => closeImageLightbox();
}

export function closeImageLightbox(): void {
  if (!_modalEl) return;
  _modalEl.classList.remove('img-lightbox-visible', 'img-lightbox-loading');
  document.body.classList.remove('img-lightbox-locked');
  if (_escHandler) {
    document.removeEventListener('keydown', _escHandler);
    _escHandler = null;
  }
  // Clear src so we don't keep large images in memory
  const img = _modalEl.querySelector<HTMLImageElement>('.img-lightbox-img');
  if (img) img.src = '';
}
