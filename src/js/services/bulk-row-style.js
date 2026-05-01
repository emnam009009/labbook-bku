/**
 * services/bulk-row-style.js (v10)
 *
 * v10 — Theme-aware checkbox + row highlight
 *  - Đọc CSS variable --teal tại runtime, không hardcode màu
 *  - Theo dõi theme change → re-apply tất cả checkbox + row
 *  - Hỗ trợ mọi theme (teal, cam, blue, etc.)
 */

(function setupBulkRowStyle() {
  'use strict';

  // ── Read theme color from CSS variable ─────────────────────────────
  function getThemeColor() {
    const root = getComputedStyle(document.documentElement);
    const teal = root.getPropertyValue('--teal').trim() || '#0d9488';
    const tealLight = root.getPropertyValue('--teal-light').trim() || 'rgba(13, 148, 136, 0.1)';
    return { primary: teal, light: tealLight };
  }

  // Convert hex to rgba
  function hexToRgba(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return `rgba(13, 148, 136, ${alpha})`;
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const style = document.createElement('style');
  style.id = 'bulk-row-style';
  style.textContent = `
    table:has(tbody#hydro-tbody),
    table:has(tbody#electrode-tbody),
    table:has(tbody#ec-tbody),
    table:has(tbody#chemicals-tbody),
    table:has(tbody#equipment-tbody),
    table:has(tbody#booking-tbody),
    table:has(tbody#member-tbody),
    table:has(tbody#ink-tbody) {
      width: 100% !important;
      min-width: 100% !important;
    }

    table colgroup.bulk-colgroup col {
      width: 36px !important;
      min-width: 36px !important;
      max-width: 36px !important;
    }

    .bulk-cb-cell,
    .bulk-cb-cell *,
    th.bulk-cb-cell,
    td.bulk-cb-cell,
    th.bulk-cb-cell *,
    td.bulk-cb-cell * {
      transition: none !important;
      animation: none !important;
      transform: none !important;
    }

    .bulk-cb-cell {
      width: 36px !important;
      min-width: 36px !important;
      max-width: 36px !important;
      padding: 0 4px !important;
      text-align: center !important;
      vertical-align: middle !important;
      box-sizing: border-box !important;
    }

    /* CHECKBOX BASE — colors set inline by JS để theo theme */
    html body input[type="checkbox"].bulk-cb,
    html body input[type="checkbox"].bulk-cb-all,
    table thead input[type="checkbox"].bulk-cb-all,
    table tbody input[type="checkbox"].bulk-cb {
      -webkit-appearance: none !important;
      -moz-appearance: none !important;
      appearance: none !important;
      width: 18px !important;
      height: 18px !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      vertical-align: middle !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      position: relative !important;
      transition: none !important;
      outline: none !important;
      flex-shrink: 0 !important;
      color: transparent !important;
      font-size: 0 !important;
      text-indent: -9999px !important;
      background-image: none !important;
    }

    /* Hide pseudo-elements */
    html body input[type="checkbox"].bulk-cb::before,
    html body input[type="checkbox"].bulk-cb::after,
    html body input[type="checkbox"].bulk-cb-all::before,
    table thead input[type="checkbox"].bulk-cb-all::before,
    table tbody input[type="checkbox"].bulk-cb::before {
      content: none !important;
      display: none !important;
    }

    /* Indeterminate state — gạch ngang trắng */
    html body input[type="checkbox"].bulk-cb-all:indeterminate::after,
    table thead input[type="checkbox"].bulk-cb-all:indeterminate::after {
      content: '' !important;
      display: block !important;
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 10px !important;
      height: 2px !important;
      background: white !important;
      border-radius: 1px !important;
    }

    /* Focus accessibility — dùng CSS var */
    html body input[type="checkbox"].bulk-cb:focus-visible,
    html body input[type="checkbox"].bulk-cb-all:focus-visible {
      outline: 2px solid var(--teal) !important;
      outline-offset: 2px !important;
    }

    /* ROW HIGHLIGHT — dùng CSS var thông qua color-mix nếu có */
    html body table tbody tr.bulk-selected > td:first-child {
      box-shadow: inset 3px 0 0 var(--teal) !important;
    }
  `;
  document.head.appendChild(style);

  function forceCheckboxStyle(cb) {
    if (!cb) return;
    cb.style.setProperty('-webkit-appearance', 'none', 'important');
    cb.style.setProperty('-moz-appearance', 'none', 'important');
    cb.style.setProperty('appearance', 'none', 'important');
    cb.style.setProperty('width', '18px', 'important');
    cb.style.setProperty('height', '18px', 'important');
    cb.style.setProperty('border-radius', '50%', 'important');
    cb.style.setProperty('box-sizing', 'border-box', 'important');
    cb.style.setProperty('color', 'transparent', 'important');
    cb.style.setProperty('font-size', '0', 'important');
    cb.style.setProperty('text-indent', '-9999px', 'important');
    cb.style.setProperty('margin', '0', 'important');
    cb.style.setProperty('padding', '0', 'important');
    cb.style.setProperty('cursor', 'pointer', 'important');
    cb.style.setProperty('vertical-align', 'middle', 'important');
    cb.style.setProperty('position', 'relative', 'important');
    cb.style.setProperty('background-image', 'none', 'important');
    cb.style.setProperty('flex-shrink', '0', 'important');
    cb.style.setProperty('outline', 'none', 'important');

    const isDark = document.documentElement.classList.contains('dark');
    const themeColor = getThemeColor();
    const primary = themeColor.primary;

    if (cb.indeterminate) {
      cb.style.setProperty('background', primary, 'important');
      cb.style.setProperty('background-color', primary, 'important');
      cb.style.setProperty('border', `1.5px solid ${primary}`, 'important');
    } else if (cb.checked) {
      cb.style.setProperty('background', primary, 'important');
      cb.style.setProperty('background-color', primary, 'important');
      cb.style.setProperty('border', `1.5px solid ${primary}`, 'important');
    } else {
      cb.style.setProperty('background', isDark ? '#1e293b' : 'white', 'important');
      cb.style.setProperty('background-color', isDark ? '#1e293b' : 'white', 'important');
      cb.style.setProperty('border', `1.5px solid ${isDark ? '#475569' : '#cbd5e1'}`, 'important');
    }
  }

  function applyRowBg(tr, on) {
    const isDark = document.documentElement.classList.contains('dark');
    const themeColor = getThemeColor();
    const bg = on
      ? hexToRgba(themeColor.primary, isDark ? 0.22 : 0.12)
      : '';

    if (on) tr.style.setProperty('background', bg, 'important');
    else tr.style.removeProperty('background');

    tr.querySelectorAll(':scope > td').forEach(td => {
      if (on) {
        td.dataset._origBg = td.style.background || '';
        td.style.setProperty('background', bg, 'important');
      } else {
        if (td.dataset._origBg !== undefined) {
          td.style.background = td.dataset._origBg;
          delete td.dataset._origBg;
        } else {
          td.style.removeProperty('background');
        }
      }
    });
  }

  function syncRowState(cb) {
    forceCheckboxStyle(cb);
    const tr = cb.closest('tr');
    if (!tr) return;
    if (cb.checked) {
      tr.classList.add('bulk-selected');
      applyRowBg(tr, true);
    } else {
      tr.classList.remove('bulk-selected');
      applyRowBg(tr, false);
    }
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.classList?.contains('bulk-cb')) {
      syncRowState(t);
      const allCb = document.querySelector(`.bulk-cb-all[data-tbody="${t.dataset.tbody}"]`);
      if (allCb) forceCheckboxStyle(allCb);
    } else if (t.classList?.contains('bulk-cb-all')) {
      forceCheckboxStyle(t);
      const tbodyId = t.dataset.tbody;
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      tbody.querySelectorAll('.bulk-cb').forEach(syncRowState);
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList?.contains('bulk-cb') || t.classList?.contains('bulk-cb-all')) {
      forceCheckboxStyle(t);
      requestAnimationFrame(() => forceCheckboxStyle(t));
      setTimeout(() => forceCheckboxStyle(t), 0);
      setTimeout(() => forceCheckboxStyle(t), 50);
    }
  }, true);

  function syncAllCheckboxes() {
    document.querySelectorAll('.bulk-cb, .bulk-cb-all').forEach(forceCheckboxStyle);
  }

  function syncAllRows() {
    syncAllCheckboxes();
    document.querySelectorAll('.bulk-cb').forEach(cb => {
      const tr = cb.closest('tr');
      if (!tr) return;
      if (cb.checked) {
        tr.classList.add('bulk-selected');
        applyRowBg(tr, true);
      } else {
        tr.classList.remove('bulk-selected');
        applyRowBg(tr, false);
      }
    });
  }

  function init() {
    syncAllRows();
    let count = 0;
    const interval = setInterval(() => {
      syncAllCheckboxes();
      count++;
      if (count >= 15) clearInterval(interval);
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  const obs = new MutationObserver(() => {
    if (!obs._pending) {
      obs._pending = true;
      queueMicrotask(() => {
        obs._pending = false;
        syncAllRows();
      });
    }
  });
  function startObs() {
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObs);
  } else {
    startObs();
  }

  // ── Watch theme change qua nhiều cách ────────────────────────────
  // 1. html.dark class change
  // 2. inline style change trên :root (theme picker dùng cái này)
  // 3. data-theme attribute change
  const themeObs = new MutationObserver(() => {
    syncAllRows();
  });
  themeObs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });

  // ── Watch Bulk Action Bar (background-color của bar đổi theo theme) ──
  const barObs = new MutationObserver(() => {
    syncAllRows();
  });
  function watchBar() {
    const bar = document.getElementById('bulk-action-bar');
    if (bar) {
      barObs.observe(bar, { attributes: true, attributeFilter: ['style'] });
    } else {
      setTimeout(watchBar, 500);
    }
  }
  setTimeout(watchBar, 1000);

  // Expose để debug
  window._bulkRowStyleSync = syncAllRows;

  console.log('[bulk-row-style v10] loaded — theme-aware');
})();
