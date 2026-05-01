/**
 * ui/toast.js
 * Toast notification: thông báo nổi (success/danger/info) + nút Undo
 *
 * State nội bộ:
 *  - _undoData: closure của hành động hoàn tác (gọi khi user bấm Undo)
 *  - _toastTimer: timer auto-hide
 */

let _undoData = null;
let _toastTimer = null;

// ── Hiển thị toast ─────────────────────────────────────
// msg: nội dung; type: 'success' | 'danger' | 'info'
// undoFn: nếu có, hiện nút Undo và lưu callback; dur: ms tự ẩn (default 3500)
export function showToast(msg, type = 'success', undoFn = null, dur = 3500) {
  if (_toastTimer) clearTimeout(_toastTimer);
  const t = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const undoBtn = document.getElementById('toast-undo');
  const msgEl = document.getElementById('toast-msg');
  if (!t || !icon || !msgEl) return;
  msgEl.textContent = msg;

  icon.className = 'toast-icon ' + type;
  const icons = {
    success: '<svg width="12" height="12" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    danger:  '<svg width="12" height="12" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info:    '<svg width="12" height="12" viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };
  icon.innerHTML = icons[type] || icons.success;

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

// ── Ẩn toast ngay lập tức ──────────────────────────────
export function hideToast() {
  if (_toastTimer) clearTimeout(_toastTimer);
  const t = document.getElementById('toast');
  if (t) t.classList.remove('show');
}

// ── Hoàn tác (gọi khi user bấm nút Undo trên toast) ────
export async function undoDelete() {
  if (!_undoData) return;
  hideToast();
  try {
    await _undoData();
    _undoData = null;
    showToast('Đã hoàn tác!', 'success');
  } catch (err) {
    console.error('[undoDelete]', err);
    showToast('Lỗi hoàn tác: ' + (err.message || err), 'danger');
    _undoData = null;
  }
}
