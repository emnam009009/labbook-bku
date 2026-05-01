/**
 * ui/custom-selects.js
 * Custom select UI wrappers + search-as-you-type dropdowns + form helpers nhỏ
 *
 * Phạm vi:
 *  - makeCustomSelect: wrap <select> bằng div đẹp với label + dropdown
 *  - rebuildCustomSelect: rebuild khi options thay đổi (vd: thêm group)
 *  - initCustomFilters: tự động wrap mọi select.search-input thành filter dropdown (hover-to-open)
 *  - searchChem + selectChem: search dropdown cho hóa chất trong row TN/Ink
 *  - searchElectrode + selectElectrode: search dropdown cho điện cực ở Electrochem modal
 *  - syncUnit: sync unit dropdown (g/mL) ↔ label trong form chemical
 *  - calcMol: tính số mol = mass / MW, fill ô mol readonly
 *
 * Phụ thuộc:
 *  - cache qua window.cache (vals đọc cache.chemicals/electrode)
 *  - vals từ utils/format.js
 *
 * 3 document-level event listeners:
 *  - click outside chem-search → ẩn .chem-dropdown
 *  - click outside electrode-search → ẩn .electrode-dropdown
 *  - input number normalization (xóa leading 0)
 *
 * Init:
 *  - 3 click outside listeners + 1 input listener attach 1 lần khi module được import
 *  - initCustomFilters phải được caller gọi từ DOMContentLoaded của main.js
 */

import { vals } from '../utils/format.js'

// ═══════════════════════════════════════════════════════════
// FORM HELPERS
// ═══════════════════════════════════════════════════════════

// Sync unit dropdown ↔ label hiển thị (form chemical)
export function syncUnit() {
  const unitSel = document.getElementById('c-unit');
  const lblEl = document.getElementById('c-unit-label');
  if (!unitSel || !lblEl) return;
  lblEl.textContent = unitSel.value;
}

// Tính số mol = mass / MW, fill ô mol readonly trong row chem
export function calcMol(inp) {
  const tr = inp.closest('tr');
  const mw = parseFloat(tr.querySelector('.chem-mw')?.value) || 0;
  const mass = parseFloat(inp.value) || 0;
  const molInput = tr.querySelectorAll('input')[3];
  if (mass && mw && molInput) molInput.value = (mass / mw).toFixed(3);
}

// ═══════════════════════════════════════════════════════════
// SEARCH DROPDOWNS — Chemical
// ═══════════════════════════════════════════════════════════

// Search hoá chất khi gõ trong row TN/Ink (khớp prefix tên hoặc công thức)
export function searchChem(inp) {
  const cache = window.cache;
  if (!cache) return;
  const q = inp.value.toLowerCase();
  const dropdown = inp.nextElementSibling;
  if (!q) { dropdown.style.display = 'none'; return; }

  const chems = vals(cache.chemicals).sort((a, b) => a.name.localeCompare(b.name));
  const matches = chems.filter(c =>
    c.name.toLowerCase().startsWith(q) || c.formula.toLowerCase().startsWith(q)
  );
  if (!matches.length) { dropdown.style.display = 'none'; return; }

  dropdown.innerHTML = matches.map(c =>
    `<div onclick="selectChem(this,'${c._key}','${c.name}','${c.formula}',${c.mw})">${c.name} <span style="color:var(--teal);font-size:11px">${c.formula}</span></div>`
  ).join('');
  dropdown.style.display = 'block';
}

// Chọn hoá chất → fill row + lưu key vào dataset
export function selectChem(el, key, name, formula, mw) {
  const tr = el.closest('tr');
  const search = tr.querySelector('.chem-search');
  search.value = name;
  search.dataset.chemKey = key;
  const mwInput = tr.querySelector('.chem-mw');
  if (mwInput) mwInput.value = mw;
  el.closest('.chem-dropdown').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// SEARCH DROPDOWNS — Electrode (cho Electrochem modal)
// ═══════════════════════════════════════════════════════════

export function searchElectrode(inp) {
  const cache = window.cache;
  if (!cache) return;
  const q = inp.value.toLowerCase();
  const dropdown = inp.nextElementSibling;
  if (!q) { dropdown.style.display = 'none'; return; }

  const electrodes = vals(cache.electrode).sort((a, b) => a.code.localeCompare(b.code));
  const matches = electrodes.filter(e =>
    e.code.toLowerCase().startsWith(q) || e.material.toLowerCase().startsWith(q)
  );
  if (!matches.length) { dropdown.style.display = 'none'; return; }

  dropdown.innerHTML = matches.map(e =>
    `<div style="padding:7px 10px;font-size:13px;cursor:pointer" onmouseover="this.style.background='var(--blue-light)'" onmouseout="this.style.background=''" onclick="selectElectrode(this,'${e.code}')">${e.code} <span style="color:var(--teal);font-size:11px">${e.material} / ${e.substrate}</span></div>`
  ).join('');
  dropdown.style.display = 'block';
}

export function selectElectrode(el, code) {
  document.getElementById('ec-electrode').value = code;
  el.closest('.electrode-dropdown').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// CUSTOM SELECT WRAPPERS — replace native <select> với div đẹp
// ═══════════════════════════════════════════════════════════

// Wrap 1 <select> bằng custom UI: trigger + dropdown options
export function makeCustomSelect(sel) {
  if (!sel) return;
  if (sel.dataset.csBuilt) {
    const oldWrap = sel.previousElementSibling;
    if (oldWrap && oldWrap.classList.contains('cs-modal-wrap')) oldWrap.remove();
  }
  sel.dataset.csBuilt = '1';
  sel.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'cs-modal-wrap';
  wrap.style.cssText = 'position:relative;width:100%';

  const trigger = document.createElement('div');
  trigger.className = 'cs-modal-trigger';
  trigger.dataset.selId = sel.id;

  const label = document.createElement('span');
  label.className = 'cs-modal-label';
  label.textContent = sel.options[sel.selectedIndex]?.text || 'Chọn';

  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('width', '12');
  arrow.setAttribute('height', '12');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', 'currentColor');
  arrow.setAttribute('stroke-width', '2.5');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.style.flexShrink = '0';
  arrow.style.transition = 'transform 0.2s';
  arrow.style.color = '#94a3b8';
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', '6 9 12 15 18 9');
  arrow.appendChild(poly);

  trigger.appendChild(label);
  trigger.appendChild(arrow);

  const dropdown = document.createElement('div');
  dropdown.className = 'cs-modal-dropdown';

  function buildOptions() {
    dropdown.innerHTML = '';
    Array.from(sel.options).forEach(opt => {
      const item = document.createElement('div');
      item.className = 'cs-modal-opt' + (opt.value === sel.value ? ' selected' : '');
      item.textContent = opt.text;
      item.dataset.value = opt.value;
      item.addEventListener('click', e => {
        e.stopPropagation();
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change'));
        label.textContent = opt.text;
        dropdown.querySelectorAll('.cs-modal-opt').forEach(o => o.classList.remove('selected'));
        item.classList.add('selected');
        trigger.classList.remove('open');
        dropdown.classList.remove('open');
        arrow.style.transform = '';
      });
      dropdown.appendChild(item);
    });
  }
  buildOptions();

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    // Đóng tất cả dropdown khác
    document.querySelectorAll('.cs-modal-dropdown.open').forEach(d => {
      d.classList.remove('open');
      const t = document.querySelector(`.cs-modal-trigger[data-sel-id="${d.dataset.forSel}"]`);
      if (t) {
        t.classList.remove('open');
        const svg = t.querySelector('svg');
        if (svg) svg.style.transform = '';
      }
    });
    if (!isOpen) {
      dropdown.style.minWidth = trigger.offsetWidth + 'px';
      trigger.classList.add('open');
      dropdown.classList.add('open');
      dropdown.dataset.forSel = sel.id;
      arrow.style.transform = 'rotate(180deg)';
    }
  });

  wrap.appendChild(trigger);
  wrap.appendChild(dropdown);
  sel.parentNode.insertBefore(wrap, sel);

  // Đóng khi click ngoài
  document.addEventListener('click', () => {
    if (dropdown.classList.contains('open')) {
      dropdown.classList.remove('open');
      trigger.classList.remove('open');
      arrow.style.transform = '';
    }
  });

  // Lưu reference để rebuild dùng được
  sel._csLabel = label;
  sel._csBuildOptions = buildOptions;
}

// Rebuild custom select khi options thay đổi (vd: thêm/xoá group)
export function rebuildCustomSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const prev = sel.previousElementSibling;
  if (prev && prev.classList.contains('cs-modal-wrap')) prev.remove();
  sel.dataset.csBuilt = '';
  makeCustomSelect(sel);
  // Sync selected label
  if (sel._csLabel) sel._csLabel.textContent = sel.options[sel.selectedIndex]?.text || 'Chọn';
}

// ═══════════════════════════════════════════════════════════
// CUSTOM FILTERS — replace native select.search-input (hover-to-open)
// ═══════════════════════════════════════════════════════════

// Tự wrap mọi <select class="search-input"> thành filter dropdown đẹp
// Caller phải gọi từ DOMContentLoaded của main.js
export function initCustomFilters() {
  document.querySelectorAll('select.search-input:not(#c-unit)').forEach(sel => {
    if (sel.dataset.customized) return;
    sel.dataset.customized = '1';
    sel.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = 'cs-filter-wrap';

    const trigger = document.createElement('div');
    trigger.className = 'cs-filter-trigger';
    trigger.style.minWidth = 'fit-content';

    const label = document.createElement('span');
    label.textContent = sel.options[sel.selectedIndex]?.text || '';

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('width', '12');
    arrow.setAttribute('height', '12');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2.5');
    arrow.setAttribute('stroke-linecap', 'round');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', '6 9 12 15 18 9');
    arrow.appendChild(poly);

    trigger.appendChild(label);
    trigger.appendChild(arrow);

    const dropdown = document.createElement('div');
    dropdown.className = 'cs-filter-dropdown';

    Array.from(sel.options).forEach((opt, i) => {
      const item = document.createElement('div');
      item.className = 'cs-filter-opt' + (i === sel.selectedIndex ? ' selected' : '');
      item.textContent = opt.text;
      item.dataset.value = opt.value;
      item.addEventListener('click', () => {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change'));
        label.textContent = opt.text;
        dropdown.querySelectorAll('.cs-filter-opt').forEach(o => o.classList.remove('selected'));
        item.classList.add('selected');
        trigger.classList.remove('open');
        dropdown.classList.remove('open');
      });
      dropdown.appendChild(item);
    });

    let _hideTimer = null;
    const openDrop = () => {
      clearTimeout(_hideTimer);
      document.querySelectorAll('.cs-filter-dropdown.open').forEach(d => {
        if (d !== dropdown) {
          d.classList.remove('open');
          d.previousElementSibling?.classList.remove('open');
        }
      });
      // Set width = trigger width để dropdown khớp với ô trên
      dropdown.style.minWidth = trigger.offsetWidth + 'px';
      trigger.classList.add('open');
      dropdown.classList.add('open');
    };
    const hideDrop = () => {
      _hideTimer = setTimeout(() => {
        trigger.classList.remove('open');
        dropdown.classList.remove('open');
      }, 280);
    };

    // Hover để mở (desktop)
    wrap.addEventListener('mouseenter', openDrop);
    wrap.addEventListener('mouseleave', hideDrop);

    // Click cho mobile
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      if (dropdown.classList.contains('open')) hideDrop();
      else openDrop();
    });

    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);
    sel.parentNode.insertBefore(wrap, sel);
  });

  // Click anywhere → close all (capture phase)
  document.addEventListener('click', () => {
    document.querySelectorAll('.cs-filter-dropdown.open').forEach(d => {
      d.classList.remove('open');
      d.previousElementSibling?.classList.remove('open');
    });
  }, { capture: true });
}

// ═══════════════════════════════════════════════════════════
// DOCUMENT-LEVEL LISTENERS (attach 1 lần ở module init)
// ═══════════════════════════════════════════════════════════
let _listenersAttached = false;
function attachSelectListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;

  // Click outside chem-search → ẩn .chem-dropdown
  document.addEventListener('click', e => {
    if (!e.target.classList.contains('chem-search')) {
      document.querySelectorAll('.chem-dropdown').forEach(d => d.style.display = 'none');
    }
  });

  // Click outside electrode-search → ẩn .electrode-dropdown
  document.addEventListener('click', e => {
    if (!e.target.classList.contains('electrode-search')) {
      document.querySelectorAll('.electrode-dropdown').forEach(d => d.style.display = 'none');
    }
  });

  // Input normalization: xóa leading 0 ở number input (vd: "0123" → "123")
  document.addEventListener('input', e => {
    if (e.target.type === 'number') {
      const v = e.target.value;
      if (v.startsWith('0') && v.length > 1 && !v.startsWith('0.')) {
        e.target.value = parseFloat(v);
      }
    }
  });
}
attachSelectListeners();

// ═══════════════════════════════════════════════════════════
// REBUILD CUSTOM FILTER — gọi khi options của native select thay đổi
// ═══════════════════════════════════════════════════════════
export function rebuildCustomFilter(selOrId) {
  const sel = typeof selOrId === 'string' ? document.getElementById(selOrId) : selOrId;
  if (!sel) return;
  
  // Xóa wrap cũ (nếu có)
  const prev = sel.previousElementSibling;
  if (prev && prev.classList.contains('cs-filter-wrap')) {
    prev.remove();
  }
  
  // Reset flag để initCustomFilters wrap lại
  sel.dataset.customized = '';
  
  // Re-run init (sẽ chỉ wrap select chưa có customized=1)
  initCustomFilters();
}

// Expose
window.rebuildCustomFilter = rebuildCustomFilter;
