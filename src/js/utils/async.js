/**
 * utils/async.js
 * Async error helper — bọc async ops để hiển thị toast khi lỗi
 * (thay cho silent failure)
 */

// Wrap async ops: log error, show toast nếu có, trả về null khi thất bại
export async function safeAsync(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error('[' + label + ']', err);
    if (typeof window.showToast === 'function') {
      window.showToast('Lỗi ' + label + ': ' + ((err && err.message) || err), 'danger');
    }
    return null;
  }
}
