/**
 * services/table-align.js (v2)
 *
 * v2 fix: 'electrochem-tbody' (không phải 'ec-tbody')
 */

(function setupTableAlign() {
  'use strict';

  const TARGET_TBODIES = ['hydro-tbody', 'electrode-tbody', 'electrochem-tbody', 'ink-tbody'];

  function alignTable(tbody) {
    const table = tbody.closest('table');
    if (!table) return;

    const thead = table.querySelector('thead tr');
    if (thead) {
      const headers = thead.querySelectorAll(':scope > th');
      headers.forEach((th, idx) => {
        if (th.classList.contains('bulk-cb-cell')) return;
        if (idx === headers.length - 1) {
          th.style.setProperty('text-align', 'right', 'important');
        } else {
          th.style.setProperty('text-align', 'left', 'important');
        }
      });
    }

    tbody.querySelectorAll('tr').forEach(tr => {
      const tds = tr.querySelectorAll(':scope > td');
      if (tds.length === 1 && tds[0].hasAttribute('colspan')) return;
      if (tr.classList.contains('chem-group-header')) return;

      tds.forEach((td, idx) => {
        if (td.classList.contains('bulk-cb-cell')) return;
        if (idx === tds.length - 1) {
          td.style.setProperty('text-align', 'right', 'important');
        } else {
          td.style.setProperty('text-align', 'left', 'important');
        }
      });
    });
  }

  function alignAll() {
    TARGET_TBODIES.forEach(id => {
      const tbody = document.getElementById(id);
      if (tbody) alignTable(tbody);
    });
  }

  function init() {
    alignAll();
    setTimeout(alignAll, 300);
    setTimeout(alignAll, 1000);
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
        alignAll();
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

  console.log('[table-align v2] loaded — fixed electrochem-tbody');
})();
