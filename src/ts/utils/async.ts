/**
 * utils/async.ts
 * Async error helper — bọc async ops để hiển thị toast khi lỗi
 * (thay cho silent failure)
 */

// Wrap async ops: log error, show toast nếu có, trả về null khi thất bại
export async function safeAsync<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error('[' + label + ']', err);
    if (typeof window.showToast === 'function') {
      const msg = err instanceof Error ? err.message : String(err);
      window.showToast('Lỗi ' + label + ': ' + msg, 'danger' as any);
    }
    return null;
  }
}
