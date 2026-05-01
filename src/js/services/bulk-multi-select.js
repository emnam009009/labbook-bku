/**
 * services/bulk-multi-select.js
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

  // ── State ────────────────────────────────────────────────────────
  let _isDragging = false;
  let _dragMode = null;        // 'check' | 'uncheck' — xác định bởi action trên row đầu
  let _dragTbodyId = null;     // Chỉ drag trong cùng 1 tbody
  let _dragVisited = new Set(); // Tránh toggle 1 row nhiều lần khi rê qua lại
  let _lastClickedRowKey = null;
  let _lastClickedTbodyId = null;

  // ── Helpers ──────────────────────────────────────────────────────

  function getRowFromEvent(e) {
    let el = e.target;
    while (el && el !== document.body) {
      if (el.tagName === 'TR') {
        const cb = el.querySelector('.bulk-cb');
        if (cb) return { tr: el, cb };
      }
      el = el.parentElement;
    }
    return null;
  }

  function setCheckbox(cb, checked) {
    if (cb.checked === checked) return false;
    cb.checked = checked;

    // Trigger change event để bulk-actions.js update _selected + bar
    const evt = new Event('change', { bubbles: true });
    cb.dispatchEvent(evt);
    return true;
  }

  // Lấy danh sách row data trong cùng tbody, theo thứ tự DOM
  function getRowsInTbody(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return [];
    const result = [];
    tbody.querySelectorAll('tr').forEach(tr => {
      const cb = tr.querySelector('.bulk-cb');
      if (cb) result.push({ tr, cb, key: cb.dataset.key });
    });
    return result;
  }

  function findRowIndex(rows, key) {
    return rows.findIndex(r => r.key === key);
  }

  // ── 1. CTRL + DRAG ───────────────────────────────────────────────

  document.addEventListener('mousedown', (e) => {
    // Chỉ kích hoạt khi: Ctrl/Cmd held + chuột trái + trên 1 row có checkbox
    if (e.button !== 0) return;
    if (!e.ctrlKey && !e.metaKey) return;

    const info = getRowFromEvent(e);
    if (!info) return;

    // Tránh trigger khi click trực tiếp vào checkbox (để check thường vẫn work)
    if (e.target.classList?.contains('bulk-cb')) return;
    // Tránh khi click vào button trong action cell
    if (e.target.closest('.action-cell, button, a, label')) return;

    e.preventDefault(); // Ngăn select text khi drag

    _isDragging = true;
    _dragTbodyId = info.cb.dataset.tbody;
    _dragVisited = new Set();

    // Toggle row đầu để xác định mode
    const newState = !info.cb.checked;
    _dragMode = newState ? 'check' : 'uncheck';
    setCheckbox(info.cb, newState);
    _dragVisited.add(info.cb.dataset.key);

    // Visual feedback: cursor crosshair
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'crosshair';
  });

  document.addEventListener('mousemove', (e) => {
    if (!_isDragging) return;

    const info = getRowFromEvent(e);
    if (!info) return;

    // Chỉ áp dụng trong cùng tbody
    if (info.cb.dataset.tbody !== _dragTbodyId) return;

    const key = info.cb.dataset.key;
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
  document.addEventListener('click', (e) => {
    // Khi user Ctrl+Shift+Click → tính range
    if (e.ctrlKey && e.shiftKey) {
      const info = getRowFromEvent(e);
      if (!info) return;

      const tbodyId = info.cb.dataset.tbody;

      // Cần có row được click trước đó trong cùng tbody
      if (!_lastClickedRowKey || _lastClickedTbodyId !== tbodyId) {
        // Không có anchor → coi như click thường
        _lastClickedRowKey = info.cb.dataset.key;
        _lastClickedTbodyId = tbodyId;
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const rows = getRowsInTbody(tbodyId);
      const startIdx = findRowIndex(rows, _lastClickedRowKey);
      const endIdx = findRowIndex(rows, info.cb.dataset.key);

      if (startIdx === -1 || endIdx === -1) return;

      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

      // Check tất cả rows trong range
      for (let i = from; i <= to; i++) {
        if (!rows[i].cb.checked) {
          setCheckbox(rows[i].cb, true);
        }
      }

      // Update anchor sang row mới click
      _lastClickedRowKey = info.cb.dataset.key;
      _lastClickedTbodyId = tbodyId;
      return;
    }

    // Click thường (không Ctrl+Shift) → cập nhật anchor nếu click vào checkbox
    if (e.target.classList?.contains('bulk-cb')) {
      _lastClickedRowKey = e.target.dataset.key;
      _lastClickedTbodyId = e.target.dataset.tbody;
    }
  }, true); // capture phase để intercept trước khi event lan

  console.log('[bulk-multi-select] loaded — ctrl+drag, ctrl+shift+click range');
})();
