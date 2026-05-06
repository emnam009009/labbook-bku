/**
 * ui/toast.ts
 * Toast notification: thong bao noi (success/danger/info) + nut Undo
 *
 * State noi bo:
 *  - _undoData: closure cua hanh dong hoan tac (goi khi user bam Undo)
 *  - _toastTimer: timer auto-hide
 */

type ToastType = 'success' | 'danger' | 'info' | 'error' | 'warn' | 'warning';
type UndoFn = (() => Promise<void> | void) | null;

let _undoData: UndoFn = null;
let _toastTimer: ReturnType<typeof setTimeout> | null = null;

// ── Hien thi toast ─────────────────────────────────────
// msg: noi dung; type: 'success' | 'danger' | 'info'
// undoFn: neu co, hien nut Undo va luu callback; dur: ms tu an (default 3500)
export function showToast(msg: string, type: ToastType = 'success', undoFn: UndoFn = null, dur: number = 3500): void {
  if (_toastTimer) clearTimeout(_toastTimer);
  const t = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const undoBtn = document.getElementById('toast-undo') as HTMLElement | null;
  const msgEl = document.getElementById('toast-msg');
  if (!t || !icon || !msgEl) return;
  msgEl.textContent = msg;

  // Round 92: normalize 'warn' alias to 'warning' for CSS class consistency
  const normalizedType = (type === 'warn' || type === 'warning') ? 'warning'
    : (type === 'error' ? 'danger' : type);
  icon.className = 'toast-icon ' + normalizedType;
  const icons: Record<string, string> = {
    success: '<svg width="12" height="12" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    danger:  '<svg width="12" height="12" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info:    '<svg width="12" height="12" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    // Round 92: triangle exclamation icon (warning)
    warning: '<svg width="12" height="12" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  };
  icon.innerHTML = icons[normalizedType] || icons.success;

  if (undoFn && undoBtn) {
    _undoData = undoFn;
    undoBtn.style.display = 'inline-block';
  } else if (undoBtn) {
    _undoData = null;
    undoBtn.style.display = 'none';
  }

  t.classList.add('show');
  _toastTimer = setTimeout(() => t.classList.remove('show'), dur);
}

// ── An toast ngay lap tuc ──────────────────────────────
export function hideToast(): void {
  if (_toastTimer) clearTimeout(_toastTimer);
  const t = document.getElementById('toast');
  if (t) t.classList.remove('show');
}

// ── Hoan tac (goi khi user bam nut Undo tren toast) ────
export async function undoDelete(): Promise<void> {
  if (!_undoData) return;
  hideToast();
  try {
    await _undoData();
    _undoData = null;
    showToast('Da hoan tac!', 'success');
  } catch (err: any) {
    console.error('[undoDelete]', err);
    showToast('Loi hoan tac: ' + (err.message || err), 'danger');
    _undoData = null;
  }
}
