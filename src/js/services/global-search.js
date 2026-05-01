/**
 * services/global-search.js
 * Global search trên header — search xuyên qua mọi loại dữ liệu trong cache.
 *
 * Match: Thí nghiệm (hydro/electrode/electrochem), Hóa chất, Thiết bị, Thành viên, Booking.
 * Hiển thị: dropdown panel ngay dưới ô search, max 10 kết quả/loại, tổng max 30.
 * Click 1 kết quả → navigate sang trang tương ứng + flash row + scroll vào.
 * Keyboard: ArrowUp/Down để chọn, Enter để mở, Esc để đóng.
 *
 * Phụ thuộc: window.cache, window.showPage, window.flashRow, fuzzy() từ utils/format.js
 */

import { fuzzy, vals, escapeHtml } from '../utils/format.js'

// ── Config ────────────────────────────────────────────────────────────
const MAX_PER_TYPE = 5;     // tối đa 5 kết quả mỗi loại
const MAX_TOTAL = 15;       // tổng max
const DEBOUNCE_MS = 180;

// ── Loại dữ liệu + cách match + cách hiển thị ────────────────────────
const SEARCHABLES = [
  {
    type: 'hydro',
    label: 'Thí nghiệm Thủy nhiệt',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 2v6l-5 9a3 3 0 003 3h10a3 3 0 003-3l-5-9V2"/></svg>',
    pageId: 'hydrothermal',
    cacheKey: 'hydro',
    fields: ['code', 'material', 'person'],
    titleFn: r => r.code || '—',
    subFn: r => [r.material, r.person].filter(Boolean).join(' · '),
  },
  {
    type: 'electrode',
    label: 'Điện cực',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/></svg>',
    pageId: 'electrode',
    cacheKey: 'electrode',
    fields: ['code', 'material', 'person'],
    titleFn: r => r.code || '—',
    subFn: r => [r.material, r.person].filter(Boolean).join(' · '),
  },
  {
    type: 'electrochem',
    label: 'Đo điện hóa',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    pageId: 'electrochemistry',
    cacheKey: 'electrochem',
    fields: ['code', 'electrode', 'person', 'reaction'],
    titleFn: r => r.code || '—',
    subFn: r => [r.electrode, r.person].filter(Boolean).join(' · '),
  },
  {
    type: 'chemical',
    label: 'Hóa chất',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 3h6v4l4 8a3 3 0 01-3 3H8a3 3 0 01-3-3l4-8V3z"/></svg>',
    pageId: 'chemicals',
    cacheKey: 'chemicals',
    fields: ['name', 'formula', 'cas'],
    titleFn: r => r.name || '—',
    subFn: r => [r.formula, r.cas].filter(Boolean).join(' · '),
  },
  {
    type: 'equipment',
    label: 'Thiết bị',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    pageId: 'equipment',
    cacheKey: 'equipment',
    fields: ['name', 'model', 'vendor', 'serial'],
    titleFn: r => r.name || '—',
    subFn: r => [r.model, r.vendor].filter(Boolean).join(' · '),
  },
  {
    type: 'member',
    label: 'Thành viên',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    pageId: 'members',
    cacheKey: 'members',
    fields: ['name', 'email'],
    titleFn: r => r.name || '—',
    subFn: r => r.email || '',
  },
  {
    type: 'booking',
    label: 'Đăng ký thiết bị',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    pageId: 'booking',
    cacheKey: 'bookings',
    fields: ['equipment', 'equipmentName', 'requesterName', 'purpose'],
    titleFn: r => r.equipmentName || r.equipment || '—',
    subFn: r => [r.requesterName, r.purpose].filter(Boolean).join(' · '),
  },
];

// ── Search logic ──────────────────────────────────────────────────────
function searchAll(query) {
  const q = (query || '').trim();
  if (!q) return [];
  const cache = window.cache || {};
  const results = [];

  for (const def of SEARCHABLES) {
    const items = vals(cache[def.cacheKey] || {});
    const matched = [];
    for (const r of items) {
      if (def.fields.some(f => fuzzy(r[f] || '', q))) {
        matched.push({ def, item: r });
        if (matched.length >= MAX_PER_TYPE) break;
      }
    }
    results.push(...matched);
  }
  return results.slice(0, MAX_TOTAL);
}

// ── Render dropdown panel ─────────────────────────────────────────────
function renderDropdown(results, query) {
  const dd = document.getElementById('header-search-dropdown');
  if (!dd) return;

  if (!query.trim()) {
    dd.style.display = 'none';
    dd.innerHTML = '';
    return;
  }

  if (!results.length) {
    dd.style.display = 'block';
    dd.innerHTML = `<div class="gs-empty" role="status">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <div>Không tìm thấy kết quả cho <strong>${escapeHtml(query)}</strong></div>
    </div>`;
    return;
  }

  // Group results by type
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.def.type]) grouped[r.def.type] = { def: r.def, items: [] };
    grouped[r.def.type].items.push(r.item);
  }

  let html = '<div class="gs-list" role="listbox" aria-label="Kết quả tìm kiếm">';
  let idx = 0;
  for (const type in grouped) {
    const { def, items } = grouped[type];
    html += `<div class="gs-group">
      <div class="gs-group-header">${def.icon}<span>${escapeHtml(def.label)}</span><span class="gs-count">${items.length}</span></div>`;
    for (const item of items) {
      const title = escapeHtml(def.titleFn(item) || '—');
      const sub = escapeHtml(def.subFn(item) || '');
      const key = item._key || item.uid || item.id || '';
      html += `<div class="gs-item" role="option" tabindex="-1"
        data-idx="${idx}" data-page="${def.pageId}" data-key="${escapeHtml(String(key))}" data-type="${def.type}">
        <div class="gs-item-title">${highlight(title, query)}</div>
        ${sub ? `<div class="gs-item-sub">${highlight(sub, query)}</div>` : ''}
      </div>`;
      idx++;
    }
    html += '</div>';
  }
  html += '</div>';

  dd.innerHTML = html;
  dd.style.display = 'block';

  // Bind clicks
  dd.querySelectorAll('.gs-item').forEach(el => {
    el.addEventListener('click', () => navigateToResult(el));
  });
}

// Highlight match — case-insensitive, ascii-fold
function highlight(text, query) {
  if (!text || !query) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const re = new RegExp(`(${escaped})`, 'gi');
    return text.replace(re, '<mark>$1</mark>');
  } catch {
    return text;
  }
}

// ── Navigate ──────────────────────────────────────────────────────────
function navigateToResult(el) {
  const page = el.dataset.page;
  const key = el.dataset.key;
  if (!page) return;

  // Đóng dropdown
  closeDropdown();

  // Navigate
  if (typeof window.showPage === 'function') {
    // Click vào sidebar item tương ứng (để có active state)
    const sidebarItem = document.querySelector(`.sidebar-item[onclick*="'${page}'"]`);
    window.showPage(page, sidebarItem);
  }

  // Sau khi page render xong, scroll + flash row
  setTimeout(() => {
    if (key) flashItemRow(key);
  }, 250);
}

function flashItemRow(key) {
  // Tìm row có data-key hoặc onclick chứa key
  const escapedKey = key.replace(/'/g, "\\'");
  const selectors = [
    `tr[data-key="${escapedKey}"]`,
    `tr[onclick*="'${escapedKey}'"]`,
    `[data-id="${escapedKey}"]`,
  ];
  let target = null;
  for (const sel of selectors) {
    target = document.querySelector(sel);
    if (target) break;
  }
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof window.flashRow === 'function') {
      window.flashRow(target);
    } else {
      target.classList.add('row-flash');
      setTimeout(() => target.classList.remove('row-flash'), 2500);
    }
  }
}

// ── Keyboard navigation ───────────────────────────────────────────────
let _selectedIdx = -1;

function moveSelection(delta) {
  const items = document.querySelectorAll('#header-search-dropdown .gs-item');
  if (!items.length) return;
  _selectedIdx = (_selectedIdx + delta + items.length) % items.length;
  items.forEach((el, i) => {
    if (i === _selectedIdx) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('selected');
    }
  });
}

function activateSelection() {
  const items = document.querySelectorAll('#header-search-dropdown .gs-item');
  if (_selectedIdx >= 0 && items[_selectedIdx]) {
    navigateToResult(items[_selectedIdx]);
  } else if (items[0]) {
    navigateToResult(items[0]);
  }
}

function closeDropdown() {
  const dd = document.getElementById('header-search-dropdown');
  if (dd) {
    dd.style.display = 'none';
    dd.innerHTML = '';
  }
  _selectedIdx = -1;
  // Collapse search box back nếu input rỗng
  const input = document.getElementById('header-search-input');
  if (input) {
    input.value = '';
    input.blur();
    const box = document.getElementById('header-search-box');
    if (box) {
      box.style.width = '40px';
      box.style.borderColor = '#e2e8f0';
      box.style.borderRadius = '50%';
      input.style.width = '0';
      input.style.padding = '0';
    }
  }
}

// ── Init ─────────────────────────────────────────────────────────────
let _debounceTimer = null;

export function initGlobalSearch() {
  const input = document.getElementById('header-search-input');
  if (!input || input.dataset.gsInit) return;
  input.dataset.gsInit = '1';

  // Tạo dropdown panel nếu chưa có
  let dd = document.getElementById('header-search-dropdown');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'header-search-dropdown';
    dd.className = 'gs-dropdown';
    dd.setAttribute('role', 'region');
    dd.setAttribute('aria-label', 'Kết quả tìm kiếm');
    dd.style.display = 'none';
    const wrap = document.getElementById('header-search-wrap');
    if (wrap) wrap.appendChild(dd);
  }

  // Input handler — debounced
  input.addEventListener('input', () => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      const q = input.value;
      const results = searchAll(q);
      renderDropdown(results, q);
      _selectedIdx = -1;
    }, DEBOUNCE_MS);
  });

  // Keyboard
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); activateSelection(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeDropdown(); }
  });

  // Click outside → close
  document.addEventListener('click', e => {
    const wrap = document.getElementById('header-search-wrap');
    if (wrap && !wrap.contains(e.target)) closeDropdown();
  });

  // ARIA roles cho input
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', 'header-search-dropdown');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');
}

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGlobalSearch);
} else {
  initGlobalSearch();
}
// Re-init sau auth (có thể search box bị render lại)
setTimeout(initGlobalSearch, 1500);

// Expose for debugging
window.initGlobalSearch = initGlobalSearch;
