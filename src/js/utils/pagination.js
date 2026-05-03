/**
 * utils/pagination.js
 *
 * Client-side pagination cho mọi table.
 *
 * Architecture:
 *  - State per-collection lưu trong module (pageSize, currentPage)
 *  - PageSize persist vào localStorage để giữ nguyên giữa session
 *  - UI: dropdown pageSize + nút Prev/Next + label "1-50 of 600"
 *  - Auto-reset page khi total giảm (do search/filter)
 *
 * Usage trong renderXxx:
 *   const totalCount = rows.length
 *   const visible = paginate(rows, 'hydro')
 *   renderPaginationUI('hydro', 'hydro-pagination', renderXxx)
 *   tbody.innerHTML = visible.map(...)
 *
 * Reset page khi search:
 *   resetPage('hydro')  // gọi trước renderXxx khi search input change
 */

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];
const DEFAULT_PAGE_SIZE = 50;
const STORAGE_KEY = 'labbook.pagination.pageSize';

// State per-collection
const _state = {};

function _loadPageSize() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
  } catch (e) { /* corrupted, ignore */ }
  return {};
}

function _savePageSize(stateMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateMap));
  } catch (e) { /* quota exceeded, ignore */ }
}

function _getState(collection) {
  if (!_state[collection]) {
    const persisted = _loadPageSize();
    _state[collection] = {
      page: 1,
      pageSize: persisted[collection] || DEFAULT_PAGE_SIZE,
    };
  }
  return _state[collection];
}

/**
 * Cắt rows theo page hiện tại.
 * Tự clamp page nếu total đã giảm (vd sau search).
 *
 * @param {Array} rows - Mảng đã sort
 * @param {string} collection - Tên collection
 * @returns {Array} - Slice của rows cho page hiện tại
 */
export function paginate(rows, collection) {
  if (!Array.isArray(rows)) return rows;
  const state = _getState(collection);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));

  // Clamp page nếu total giảm (vd khi search)
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  const start = (state.page - 1) * state.pageSize;
  const end = start + state.pageSize;
  return rows.slice(start, end);
}

/**
 * Render UI pagination control (dropdown pageSize + prev/next + label).
 * Tự attach event handlers gọi onChange (thường là renderXxx).
 *
 * @param {string} collection - Tên collection
 * @param {string} containerId - ID của <div> để inject UI
 * @param {Function} onChange - Callback khi user đổi page hoặc pageSize
 * @param {number} total - Tổng records (chưa cắt). Tính từ caller để tránh re-call paginate
 */
export function renderPaginationUI(collection, containerId, onChange, total) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const state = _getState(collection);
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;

  const start = total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
  const end = Math.min(state.page * state.pageSize, total);

  // Hide nếu total <= pageSize nhỏ nhất (ko cần phân trang)
  if (total <= PAGE_SIZE_OPTIONS[0]) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';

  const sizeOptions = PAGE_SIZE_OPTIONS
    .map(n => `<option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${n}</option>`)
    .join('');

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;padding:10px 12px;background:var(--surface-2,#f8fafc);border-radius:8px;font-size:13px;color:#475569">
      <div style="display:flex;align-items:center;gap:8px">
        <span>Hiển thị</span>
        <select id="${containerId}-size" style="padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;background:#fff">${sizeOptions}</select>
        <span>dòng | <strong>${start}-${end}</strong> trong tổng <strong>${total}</strong></span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <button id="${containerId}-prev" ${state.page <= 1 ? 'disabled' : ''}
          style="padding:5px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;${state.page <= 1 ? 'opacity:0.4;cursor:not-allowed' : ''}">‹ Trước</button>
        <span style="font-weight:600;color:#0f172a;min-width:80px;text-align:center">Trang ${state.page}/${totalPages}</span>
        <button id="${containerId}-next" ${state.page >= totalPages ? 'disabled' : ''}
          style="padding:5px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;${state.page >= totalPages ? 'opacity:0.4;cursor:not-allowed' : ''}">Sau ›</button>
      </div>
    </div>
  `;

  // Wire handlers
  const sel = document.getElementById(containerId + '-size');
  if (sel) {
    sel.onchange = () => {
      state.pageSize = parseInt(sel.value, 10) || DEFAULT_PAGE_SIZE;
      // Tính page mới để giữ vị trí (rough: giữ first row visible)
      const firstRowIndex = (state.page - 1) * state.pageSize;
      state.page = Math.floor(firstRowIndex / state.pageSize) + 1;
      // Persist
      const persisted = _loadPageSize();
      persisted[collection] = state.pageSize;
      _savePageSize(persisted);
      if (typeof onChange === 'function') onChange();
    };
  }
  const prev = document.getElementById(containerId + '-prev');
  if (prev) {
    prev.onclick = () => {
      if (state.page > 1) {
        state.page--;
        if (typeof onChange === 'function') onChange();
      }
    };
  }
  const next = document.getElementById(containerId + '-next');
  if (next) {
    next.onclick = () => {
      if (state.page < totalPages) {
        state.page++;
        if (typeof onChange === 'function') onChange();
      }
    };
  }
}

/**
 * Reset về trang 1 — gọi khi search/filter thay đổi.
 *
 * @param {string} collection
 */
export function resetPage(collection) {
  const state = _getState(collection);
  state.page = 1;
}

/**
 * Combined helper: paginate + render UI trong 1 call.
 *
 * @param {Array} rows - Đã sort
 * @param {string} collection
 * @param {string} paginationContainerId - ID <div> để chứa pagination UI
 * @param {Function} onChange - Re-render callback
 * @returns {Array} - Visible rows cho page hiện tại
 */
export function applyPagination(rows, collection, paginationContainerId, onChange) {
  const total = rows?.length || 0;
  const visible = paginate(rows, collection);
  renderPaginationUI(collection, paginationContainerId, onChange, total);
  return visible;
}
