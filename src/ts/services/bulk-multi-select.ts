/**
 * services/bulk-multi-select.ts
 *
 * Thao tác chọn nâng cao cho bulk action:
 *  1. Ctrl + drag chuột trái: kéo qua nhiều row
 *     - Hướng đầu (xuống/lên) tự động xác định: chọn / bỏ chọn
 *     - Cụ thể: row đầu tiên drag qua sẽ TOGGLE → từ đó set "mode" = checked/unchecked
 *     - Mọi row tiếp theo drag qua sẽ set theo "mode" đã định
 *
 *  2. Click row → Ctrl+Shift+Click row khác:
 *     Chọn liên tục từ row đầu đến row cuối (range select)
 *
 * Phụ thuộc:
 *  - Bulk checkboxes đã được inject (.bulk-cb với data-key, data-tbody)
 *  - Selected state quản lý qua window._bulkSelected (export bởi bulk-actions.js)
 */

(function setupBulkMultiSelect() {
  'use strict';

  interface RowInfo {
    tr: HTMLTableRowElement;
    cb: HTMLInputElement;
  }
  interface RowData extends RowInfo {
    key: string;
  }

  // ── State ────────────────────────────────────────────────────────
  let _isDragging = false;
  let _dragMode: 'check' | 'uncheck' | null = null;
  let _dragTbodyId: string | null = null;
  let _dragVisited = new Set<string>();
  let _lastClickedRowKey: string | null = null;
  let _lastClickedTbodyId: string | null = null;

  // ── Helpers ──────────────────────────────────────────────────────

  function getRowFromEvent(e: MouseEvent): RowInfo | null {
    let el = e.target as HTMLElement | null;
    while (el && el !== document.body) {
      if (el.tagName === 'TR') {
        const cb = el.querySelector<HTMLInputElement>('.bulk-cb');
        if (cb) return { tr: el as HTMLTableRowElement, cb };
      }
      el = el.parentElement;
    }
    return null;
  }

  function setCheckbox(cb: HTMLInputElement, checked: boolean): boolean {
    if (cb.checked === checked) return false;
    cb.checked = checked;

    // Trigger change event để bulk-actions.js update _selected + bar
    const evt = new Event('change', { bubbles: true });
    cb.dispatchEvent(evt);
    return true;
  }

  // Lấy danh sách row data trong cùng tbody, theo thứ tự DOM
  function getRowsInTbody(tbodyId: string): RowData[] {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return [];
    const result: RowData[] = [];
    tbody.querySelectorAll<HTMLTableRowElement>('tr').forEach(tr => {
      const cb = tr.querySelector<HTMLInputElement>('.bulk-cb');
      if (cb) result.push({ tr, cb, key: cb.dataset.key! });
    });
    return result;
  }

  function findRowIndex(rows: RowData[], key: string): number {
    return rows.findIndex(r => r.key === key);
  }

  // ── 1. CTRL + DRAG ───────────────────────────────────────────────

  document.addEventListener('mousedown', (e: MouseEvent) => {
    // Chỉ kích hoạt khi: Ctrl/Cmd held + chuột trái + trên 1 row có checkbox
    if (e.button !== 0) return;
    if (!e.ctrlKey && !e.metaKey) return;

    const info = getRowFromEvent(e);
    if (!info) return;

    // Tránh trigger khi click trực tiếp vào checkbox (để check thường vẫn work)
    const target = e.target as HTMLElement | null;
    if (target?.classList?.contains('bulk-cb')) return;
    // Tránh khi click vào button trong action cell
    if (target?.closest('.action-cell, button, a, label')) return;

    e.preventDefault(); // Ngăn select text khi drag

    _isDragging = true;
    _dragTbodyId = info.cb.dataset.tbody!;
    _dragVisited = new Set();

    // Toggle row đầu để xác định mode
    const newState = !info.cb.checked;
    _dragMode = newState ? 'check' : 'uncheck';
    setCheckbox(info.cb, newState);
    _dragVisited.add(info.cb.dataset.key!);

    // Visual feedback: cursor crosshair
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'crosshair';
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!_isDragging) return;

    const info = getRowFromEvent(e);
    if (!info) return;

    // Chỉ áp dụng trong cùng tbody
    if (info.cb.dataset.tbody !== _dragTbodyId) return;

    const key = info.cb.dataset.key!;
    if (_dragVisited.has(key)) return;
    _dragVisited.add(key);

    const targetState = _dragMode === 'check';
    setCheckbox(info.cb, targetState);
  });

  document.addEventListener('mouseup', () => {
    if (_isDragging) {
      _isDragging = false;
      _dragMode = null;
      _dragTbodyId = null;
      _dragVisited.clear();
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  });

  // Cancel drag nếu mouse leave window
  document.addEventListener('mouseleave', () => {
    if (_isDragging) {
      _isDragging = false;
      _dragMode = null;
      _dragTbodyId = null;
      _dragVisited.clear();
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  });

  // ── 2. CTRL + SHIFT + CLICK = RANGE SELECT ────────────────────────

  // Lưu row được click cuối cùng (qua checkbox click thường hoặc click vào row)
  document.addEventListener('click', (e: MouseEvent) => {
    // Khi user Ctrl+Shift+Click → tính range
    if (e.ctrlKey && e.shiftKey) {
      const info = getRowFromEvent(e);
      if (!info) return;

      const tbodyId = info.cb.dataset.tbody!;

      // Cần có row được click trước đó trong cùng tbody
      if (!_lastClickedRowKey || _lastClickedTbodyId !== tbodyId) {
        // Không có anchor → coi như click thường
        _lastClickedRowKey = info.cb.dataset.key!;
        _lastClickedTbodyId = tbodyId;
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const rows = getRowsInTbody(tbodyId);
      const startIdx = findRowIndex(rows, _lastClickedRowKey);
      const endIdx = findRowIndex(rows, info.cb.dataset.key!);

      if (startIdx === -1 || endIdx === -1) return;

      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

      // Check tất cả rows trong range
      for (let i = from; i <= to; i++) {
        if (!rows[i].cb.checked) {
          setCheckbox(rows[i].cb, true);
        }
      }

      // Update anchor sang row mới click
      _lastClickedRowKey = info.cb.dataset.key!;
      _lastClickedTbodyId = tbodyId;
      return;
    }

    // Click thường (không Ctrl+Shift) → cập nhật anchor nếu click vào checkbox
    const target = e.target as HTMLElement | null;
    if (target?.classList?.contains('bulk-cb')) {
      _lastClickedRowKey = (target as HTMLInputElement).dataset.key!;
      _lastClickedTbodyId = (target as HTMLInputElement).dataset.tbody!;
    }
  }, true); // capture phase để intercept trước khi event lan

  console.log('[bulk-multi-select] loaded — ctrl+drag, ctrl+shift+click range');
})();

// Module marker
export {};
