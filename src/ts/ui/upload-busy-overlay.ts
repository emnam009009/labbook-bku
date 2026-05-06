// src/ts/ui/upload-busy-overlay.ts
// Round 87: spinner overlay + input lock khi dang upload/parse.
// Block user spam drop file lien tuc khi he thong dang xu ly.

let _overlayEl: HTMLElement | null = null;
let _busyCount = 0;

function _ensureOverlay(panel: HTMLElement): HTMLElement {
  if (_overlayEl && panel.contains(_overlayEl)) return _overlayEl;
  // Cleanup if attached to a different panel (e.g., re-render)
  if (_overlayEl && _overlayEl.parentElement) {
    _overlayEl.parentElement.removeChild(_overlayEl);
  }
  const ov = document.createElement('div');
  ov.className = 'att-busy-overlay';
  ov.setAttribute('aria-live', 'polite');
  ov.setAttribute('aria-busy', 'true');
  ov.innerHTML = `
    <div class="att-busy-card">
      <div class="att-busy-spinner" aria-hidden="true"></div>
      <div class="att-busy-msg">Đang xử lý...</div>
    </div>
  `;
  panel.appendChild(ov);
  _overlayEl = ov;
  return ov;
}

/**
 * Show the busy overlay. Multiple calls stack — overlay only hides
 * when matching hide() count is reached.
 */
export function showBusyOverlay(panel: HTMLElement, msg: string = 'Đang xử lý...'): void {
  _busyCount++;
  const ov = _ensureOverlay(panel);
  const msgEl = ov.querySelector('.att-busy-msg') as HTMLElement | null;
  if (msgEl) msgEl.textContent = msg;
  ov.classList.add('att-busy-visible');
  // Disable file input
  const input = panel.querySelector<HTMLInputElement>('.att-file-input');
  if (input) input.disabled = true;
  const pickBtn = panel.querySelector<HTMLElement>('.att-upload-btn');
  if (pickBtn) pickBtn.style.pointerEvents = 'none';
}

/** Update the overlay message without changing visibility. */
export function setBusyMessage(msg: string): void {
  if (!_overlayEl) return;
  const msgEl = _overlayEl.querySelector('.att-busy-msg') as HTMLElement | null;
  if (msgEl) msgEl.textContent = msg;
}

/**
 * Hide the busy overlay. If multiple show() were called, must call
 * hide() the same number of times.
 */
export function hideBusyOverlay(panel: HTMLElement): void {
  _busyCount = Math.max(0, _busyCount - 1);
  if (_busyCount > 0) return;
  if (_overlayEl) {
    _overlayEl.classList.remove('att-busy-visible');
  }
  const input = panel.querySelector<HTMLInputElement>('.att-file-input');
  if (input) input.disabled = false;
  const pickBtn = panel.querySelector<HTMLElement>('.att-upload-btn');
  if (pickBtn) pickBtn.style.pointerEvents = '';
}

/** Whether any operation is currently busy. */
export function isBusy(): boolean {
  return _busyCount > 0;
}

/**
 * Round 93: escape hatch — reset busy counter when caller detects
 * inconsistent state (counter > 0 but overlay element not visible).
 * This can happen if an error path skipped hideBusyOverlay or if the
 * panel was unmounted and remounted while counter was non-zero.
 *
 * Also removes any stale overlay element from DOM.
 */
export function resetBusyCount(): void {
  _busyCount = 0;
  if (_overlayEl) {
    _overlayEl.classList.remove('att-busy-visible');
    if (_overlayEl.parentElement) {
      _overlayEl.parentElement.removeChild(_overlayEl);
    }
    _overlayEl = null;
  }
  // Re-enable any disabled inputs/buttons
  document.querySelectorAll<HTMLInputElement>('.att-file-input').forEach(i => {
    i.disabled = false;
  });
  document.querySelectorAll<HTMLElement>('.att-upload-btn').forEach(b => {
    b.style.pointerEvents = '';
  });
}
