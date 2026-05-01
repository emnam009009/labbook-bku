/**
 * services/date-range-filter.js (v4)
 *
 * v4: bỏ entry 'ink' khỏi PAGES vì #page-ink không tồn tại độc lập
 *     (tab Mực nằm trong #page-electrode), nên filter ink bị inject sai
 *     vào tab Điện cực gây dư 1 ô filter. Tab Mực không cần filter.
 *
 * v3 fixes:
 *  - Fallback page IDs cho electrochem: thử nhiều ID
 *  - min-height: 38px khớp với .cs-modal-trigger / search-input
 *  - Padding: 6px 12px (giống select khác)
 */

(function setupDateRangeFilter() {
  'use strict';

  const PAGES = [
    {
      id: 'hydro',
      pageIds: ['page-hydrothermal', 'page-hydro'],
      tbodyId: 'hydro-tbody',
      cacheKey: 'hydro',
      dateField: 'date',
    },
    {
      id: 'electrode',
      pageIds: ['page-electrode'],
      tbodyId: 'electrode-tbody',
      cacheKey: 'electrode',
      dateField: 'date',
    },
    {
      id: 'electrochem',
      pageIds: ['page-electrochem', 'page-ec', 'page-electrochemistry', 'page-electrochemical'],
      tbodyId: 'electrochem-tbody',
      cacheKey: 'electrochem',
      dateField: 'date',
    },
    {
      id: 'booking',
      pageIds: ['page-booking'],
      tbodyId: 'booking-tbody',
      cacheKey: 'bookings',
      dateField: 'date',
    },
  ];

  const _ranges = {};
  PAGES.forEach(p => { _ranges[p.id] = { from: '', to: '' }; });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function findPageEl(page) {
    for (const id of page.pageIds) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    // Fallback: tìm page chứa tbody
    const tbody = document.getElementById(page.tbodyId);
    if (tbody) {
      let p = tbody.closest('[id^="page-"]');
      if (p) return p;
    }
    return null;
  }

  function autoFormatDateInput(input) {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/[^\d]/g, '');
      if (v.length > 8) v = v.slice(0, 8);
      let formatted = v;
      if (v.length >= 5) formatted = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
      else if (v.length >= 3) formatted = v.slice(0, 2) + '/' + v.slice(2);
      e.target.value = formatted;
    });
    input.addEventListener('blur', (e) => {
      const v = e.target.value.trim();
      if (!v) { e.target.style.color = ''; return; }
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) {
        e.target.style.color = '#ef4444';
        return;
      }
      e.target.style.color = '';
    });
  }

  function parseDdMmYyyy(s) {
    if (!s) return null;
    const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, d, mo, y] = m;
    const date = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), 0, 0, 0, 0);
    if (isNaN(date.getTime())) return null;
    return date;
  }

  function parseIso(s) {
    if (!s) return null;
    const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [, y, mo, d] = m;
    const date = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), 0, 0, 0, 0);
    if (isNaN(date.getTime())) return null;
    return date;
  }

  function getRecordDate(record, page) {
    const v = record[page.dateField];
    if (!v) return null;
    if (page.dateFieldFormat === 'dmy') return parseDdMmYyyy(v);
    return parseIso(v);
  }

  function isInRange(recordDate, fromDate, toDate) {
    if (!recordDate) return true;
    if (fromDate && recordDate < fromDate) return false;
    if (toDate) {
      const endOfToDate = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
      if (recordDate >= endOfToDate) return false;
    }
    return true;
  }

  function applyFilter(page) {
    const tbody = document.getElementById(page.tbodyId);
    if (!tbody) return;
    const cache = window.cache;
    if (!cache || !cache[page.cacheKey]) return;

    const range = _ranges[page.id];
    const fromDate = parseDdMmYyyy(range.from);
    const toDate = parseDdMmYyyy(range.to);

    if (!fromDate && !toDate) {
      tbody.querySelectorAll('tr').forEach(tr => {
        if (tr.dataset._dateFilterHidden) {
          tr.style.display = '';
          delete tr.dataset._dateFilterHidden;
        }
      });
      updateBadge(page, null);
      return;
    }

    let visibleCount = 0;
    tbody.querySelectorAll('tr').forEach(tr => {
      const tds = tr.querySelectorAll(':scope > td');
      if (tds.length === 1 && tds[0].hasAttribute('colspan')) return;
      if (tr.classList.contains('chem-group-header')) return;

      const key = getRowKey(tr, page);
      if (!key) return;

      const record = cache[page.cacheKey][key];
      if (!record) return;

      const recordDate = getRecordDate(record, page);
      const inRange = isInRange(recordDate, fromDate, toDate);

      if (inRange) {
        if (tr.dataset._dateFilterHidden) {
          tr.style.display = '';
          delete tr.dataset._dateFilterHidden;
        }
        visibleCount++;
      } else {
        tr.style.display = 'none';
        tr.dataset._dateFilterHidden = '1';
      }
    });

    updateBadge(page, { visible: visibleCount });
  }

  function getRowKey(tr, page) {
    if (tr.dataset.key) return tr.dataset.key;
    if (tr.dataset.bkKey) return tr.dataset.bkKey;
    const allOnclicks = [];
    if (tr.getAttribute('onclick')) allOnclicks.push(tr.getAttribute('onclick'));
    tr.querySelectorAll('[onclick]').forEach(el => {
      const oc = el.getAttribute('onclick');
      if (oc) allOnclicks.push(oc);
    });
    const patterns = [
      new RegExp(`(?:delItem|lockItem|unlockItem|duplicateItem)\\s*\\(\\s*['"]${page.cacheKey}['"]\\s*,\\s*['"]([^'"]+)['"]`),
      /(?:edit\w+|showInkImage|showChemicalImage|showElectrodeImage|showHydroImage|showEcImage)\s*\(\s*['"]([^'"]+)['"]/,
      /_key\s*:\s*['"]([^'"]+)['"]/,
      /(?:approveBooking|rejectBooking|cancelBooking|checkInBooking|checkOutBooking|deleteBooking|openBookingDetail)\s*\(\s*['"]([^'"]+)['"]/,
    ];
    for (const oc of allOnclicks) {
      for (const re of patterns) {
        const m = oc.match(re);
        if (m && m[1]) return m[1];
      }
    }
    return null;
  }

  function updateBadge(page, info) {
    const badge = document.getElementById(`date-range-badge-${page.id}`);
    if (!badge) return;
    if (info) {
      badge.textContent = `${info.visible} kết quả`;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function createFilterUI(page) {
    const wrap = document.createElement('div');
    wrap.className = 'date-range-filter-wrap';
    wrap.dataset.page = page.id;
    wrap.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--surface);
      border: 1.5px solid var(--border);
      border-radius: 999px;
      padding: 0 12px;
      min-height: 38px;
      box-sizing: border-box;
      transition: border 0.15s, box-shadow 0.15s;
      flex-shrink: 0;
      vertical-align: middle;
      font-size: 13px;
    `;
    wrap.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <input type="text" id="date-range-from-${page.id}" placeholder="dd/mm/yyyy" maxlength="10" autocomplete="off"
             style="border:none;background:transparent;outline:none;font-size:13px;width:88px;font-family:'JetBrains Mono',monospace;color:var(--text);text-align:center;padding:0;height:34px;line-height:34px">
      <span style="color:var(--text-3);font-size:12px">→</span>
      <input type="text" id="date-range-to-${page.id}" placeholder="dd/mm/yyyy" maxlength="10" autocomplete="off"
             style="border:none;background:transparent;outline:none;font-size:13px;width:88px;font-family:'JetBrains Mono',monospace;color:var(--text);text-align:center;padding:0;height:34px;line-height:34px">
      <button type="button" id="date-range-clear-${page.id}" title="Xóa lọc"
              style="display:none;background:#f87171;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;padding:0">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" style="display:block">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <span id="date-range-badge-${page.id}"
            style="display:none;align-items:center;background:var(--teal-light);color:var(--teal);font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;margin-left:2px"></span>
    `;

    const fromInp = wrap.querySelector(`#date-range-from-${page.id}`);
    const toInp = wrap.querySelector(`#date-range-to-${page.id}`);
    const clearBtn = wrap.querySelector(`#date-range-clear-${page.id}`);

    autoFormatDateInput(fromInp);
    autoFormatDateInput(toInp);

    function onChange() {
      _ranges[page.id].from = fromInp.value.trim();
      _ranges[page.id].to = toInp.value.trim();
      const hasValue = _ranges[page.id].from || _ranges[page.id].to;
      clearBtn.style.display = hasValue ? 'inline-flex' : 'none';
      applyFilter(page);
    }

    fromInp.addEventListener('change', onChange);
    fromInp.addEventListener('blur', onChange);
    toInp.addEventListener('change', onChange);
    toInp.addEventListener('blur', onChange);

    clearBtn.addEventListener('click', () => {
      fromInp.value = '';
      toInp.value = '';
      _ranges[page.id] = { from: '', to: '' };
      clearBtn.style.display = 'none';
      fromInp.style.color = '';
      toInp.style.color = '';
      applyFilter(page);
    });

    [fromInp, toInp].forEach(inp => {
      inp.addEventListener('focus', () => {
        wrap.style.borderColor = 'var(--teal)';
        wrap.style.boxShadow = '0 0 0 3px rgba(13, 148, 136, 0.1)';
      });
      inp.addEventListener('blur', () => {
        wrap.style.borderColor = 'var(--border)';
        wrap.style.boxShadow = '';
      });
    });

    return wrap;
  }

  // Tìm Excel button trong page (theo text content)
  function findExcelButtonInPage(pageEl) {
    const btns = pageEl.querySelectorAll('button');
    for (const btn of btns) {
      if (/excel/i.test(btn.textContent.trim())) return btn;
    }
    return null;
  }

  function injectUI(page) {
    if (document.querySelector(`.date-range-filter-wrap[data-page="${page.id}"]`)) return true;

    const pageEl = findPageEl(page);
    if (!pageEl) return false;

    const excelBtn = findExcelButtonInPage(pageEl);
    if (!excelBtn) return false;

    const wrap = createFilterUI(page);
    const pdfBtn = pageEl.querySelector('button[onclick*="openPdfReportModal"]');
    const anchor = pdfBtn || excelBtn;
    anchor.parentElement.insertBefore(wrap, anchor.nextSibling);

    applyFilter(page);
    return true;
  }

  function injectAll() {
    PAGES.forEach(page => injectUI(page));
  }

  function init() {
    injectAll();
    setTimeout(injectAll, 500);
    setTimeout(injectAll, 1000);
    setTimeout(injectAll, 2000);
    setTimeout(injectAll, 3000);
    setTimeout(injectAll, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  const obs = new MutationObserver((muts) => {
    if (obs._pending) return;
    let needReapply = false;
    let needInject = false;
    for (const m of muts) {
      if (m.type === 'childList') {
        const target = m.target;
        if (target.id && PAGES.some(p => p.tbodyId === target.id)) {
          needReapply = true;
        }
        if (target.id && PAGES.some(p => p.pageIds.includes(target.id))) {
          needInject = true;
        }
      }
    }
    if (needReapply || needInject) {
      obs._pending = true;
      queueMicrotask(() => {
        obs._pending = false;
        if (needInject) injectAll();
        PAGES.forEach(page => {
          const r = _ranges[page.id];
          if (r.from || r.to) applyFilter(page);
        });
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

  window.addEventListener('hashchange', () => {
    setTimeout(injectAll, 100);
    setTimeout(injectAll, 500);
  });

  // Periodic re-inject for safety (every 2s in 30s after load)
  let count = 0;
  const periodicInject = setInterval(() => {
    injectAll();
    count++;
    if (count >= 15) clearInterval(periodicInject);
  }, 2000);

  console.log('[date-range-filter v4] loaded');
})();
