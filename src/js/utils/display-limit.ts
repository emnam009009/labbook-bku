/**
 * utils/display-limit.ts
 *
 * Helper giới hạn số rows hiển thị trên table để tránh DOM bloat.
 * Cache vẫn giữ full data — chỉ display top N rows mới nhất.
 *
 * Lý do tách module:
 *  - Cùng pattern dùng ở nhiều pages (hydro, electrode, electrochem, ink, bookings)
 *  - Centralize config DEFAULT_LIMIT để dễ tweak
 *  - Tự động hiển thị hint "đang xem N/M records" khi cắt
 *
 * Usage trong renderXxx:
 *   const totalCount = rows.length
 *   rows = limitDisplayRows(rows, 'hydro')
 *   updateLimitHint('hydro-limit-hint', rows.length, totalCount)
 *
 * Hint element trong HTML (option, không bắt buộc):
 *   <div id="hydro-limit-hint" class="display-limit-hint" style="display:none"></div>
 */

// Default limit cho mọi table (có thể override per-collection)
const DEFAULT_LIMIT = 100;

// Per-collection override (nếu cần một số bảng hiển thị nhiều hơn/ít hơn)
const PER_COLLECTION_LIMIT: Record<string, number> = {
  hydro:       100,
  electrode:   100,
  electrochem: 100,
  ink:         100,
  bookings:    100,
  history:     200,  // History dùng nhiều hơn vì admin cần xem audit trail
};

/**
 * Cắt mảng rows xuống N rows mới nhất.
 * Giả định rows đã được sort theo thứ tự desc (mới nhất ở đầu).
 */
export function limitDisplayRows<T>(rows: T[], collection: string): T[] {
  if (!Array.isArray(rows)) return rows;
  const limit = PER_COLLECTION_LIMIT[collection] ?? DEFAULT_LIMIT;
  return rows.length > limit ? rows.slice(0, limit) : rows;
}

/**
 * Cập nhật element hint "đang hiển thị N/M records".
 * Tự ẩn nếu N === M (không cần hint).
 * Tự tạo hint element nếu chưa có (insert trước table)
 */
export function updateLimitHint(
  hintId: string,
  displayed: number,
  total: number,
  tableId: string | null = null
): void {
  let hint = document.getElementById(hintId);

  // Auto-create hint nếu chưa có (insert trước table)
  if (!hint && tableId && total > displayed) {
    const table = document.getElementById(tableId);
    const tableContainer = table?.closest('table')?.parentElement || table?.parentElement;
    if (tableContainer) {
      hint = document.createElement('div');
      hint.id = hintId;
      hint.className = 'display-limit-hint';
      hint.style.cssText = 'padding:8px 12px;margin:8px 0;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:4px;font-size:12.5px;color:#92400e';
      tableContainer.parentElement?.insertBefore(hint, tableContainer);
    }
  }

  if (!hint) return;

  if (total > displayed) {
    hint.innerHTML = `📋 Đang hiển thị <strong>${displayed}</strong>/${total} bản ghi mới nhất. Dùng tìm kiếm để lọc.`;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

/**
 * Combined helper: vừa cắt rows vừa update hint trong 1 call.
 * Tiện cho các renderXxx muốn fix nhanh.
 */
export function applyDisplayLimit<T>(
  rows: T[],
  collection: string,
  hintId: string,
  tableId: string | null = null
): T[] {
  const total = rows?.length || 0;
  const limited = limitDisplayRows(rows, collection);
  updateLimitHint(hintId, limited.length, total, tableId);
  return limited;
}
