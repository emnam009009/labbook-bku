/**
 * services/table-sort.js — Generic sort by header click
 *
 * Usage trong HTML:
 *   <th data-sort="fieldName" data-sort-type="text|number|date">...</th>
 *
 * Usage trong renderXxx:
 *   import { applyTableSort, initTableSort } from '../services/table-sort.js';
 *   
 *   // 1 lần khi page render đầu
 *   initTableSort('hydro-tbody', renderHydro);
 *   
 *   // Trong render: replace .sort(...) cũ
 *   const rows = applyTableSort('hydro-tbody', filteredRows, defaultSortFn);
 *
 * State per table: window._tableSorts = { 'hydro-tbody': { key, dir }, ... }
 */

window._tableSorts = window._tableSorts || {};

/**
 * Apply sort cho 1 table dựa trên state hiện tại.
 * @param {string} tableId - id của <tbody>
 * @param {Array} rows - rows đã filter
 * @param {Function} defaultSortFn - hàm sort mặc định nếu chưa có sort key
 * @returns {Array} sorted rows
 */
export function applyTableSort(tableId, rows, defaultSortFn) {
  const state = window._tableSorts[tableId];
  if (!state || !state.key) {
    // Chưa có sort, dùng default
    if (defaultSortFn) {
      return [...rows].sort(defaultSortFn);
    }
    return rows;
  }
  
  const { key, dir, type } = state;
  const sorted = [...rows].sort((a, b) => {
    let va = a[key];
    let vb = b[key];
    
    // Null/undefined → cuối
    const naA = va == null || va === '';
    const naB = vb == null || vb === '';
    if (naA && naB) return 0;
    if (naA) return 1;
    if (naB) return -1;
    
    let cmp;
    if (type === 'number') {
      cmp = (parseFloat(va) || 0) - (parseFloat(vb) || 0);
    } else if (type === 'date') {
      // Date format DD/MM/YYYY hoặc YYYY-MM-DD → string compare
      cmp = String(va).localeCompare(String(vb));
    } else {
      // Text: vi locale
      cmp = String(va).localeCompare(String(vb), 'vi');
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  
  return sorted;
}

/**
 * Init sort behavior cho 1 table (gắn click handler vào headers + update arrows)
 * @param {string} tableId - id của <tbody>
 * @param {Function} reRender - hàm render lại để gọi sau khi đổi sort
 */
export function initTableSort(tableId, reRender) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  const table = tbody.closest('table');
  if (!table) return;
  
  // Skip nếu đã init
  if (table.dataset.sortInit === '1') {
    updateSortIndicators(tableId);
    return;
  }
  table.dataset.sortInit = '1';
  
  table.querySelectorAll('thead th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    
    // Thêm arrow span nếu chưa có
    if (!th.querySelector('.ts-arrow')) {
      const arrow = document.createElement('span');
      arrow.className = 'ts-arrow';
      arrow.style.marginLeft = '4px';
      arrow.style.fontSize = '10px';
      arrow.style.opacity = '0.6';
      th.appendChild(arrow);
    }
    
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const type = th.dataset.sortType || 'text';
      const state = window._tableSorts[tableId] || {};
      
      if (state.key === key) {
        // Toggle: asc → desc → reset
        if (state.dir === 'asc') {
          state.dir = 'desc';
        } else {
          window._tableSorts[tableId] = { key: '', dir: 'asc', type: '' };
          if (reRender) reRender();
          return;
        }
      } else {
        state.key = key;
        state.dir = 'asc';
        state.type = type;
      }
      window._tableSorts[tableId] = state;
      if (reRender) reRender();
    });
  });
  
  updateSortIndicators(tableId);
}

/**
 * Update arrow indicators (▲ / ▼) trên header
 */
export function updateSortIndicators(tableId) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  const table = tbody.closest('table');
  if (!table) return;
  
  const state = window._tableSorts[tableId] || {};
  
  table.querySelectorAll('thead th[data-sort]').forEach(th => {
    const arrow = th.querySelector('.ts-arrow');
    if (!arrow) return;
    if (state.key === th.dataset.sort) {
      arrow.textContent = state.dir === 'asc' ? '▲' : '▼';
      arrow.style.color = 'var(--teal)';
      arrow.style.opacity = '1';
    } else {
      arrow.textContent = '';
    }
  });
}
