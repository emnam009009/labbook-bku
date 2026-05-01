/**
 * services/bulk-actions.js (v11)
 *
 * v11 change:
 *  - Bỏ ResizeObserver + CSS transition `left` của bar
 *  - Dùng requestAnimationFrame loop khi sidebar đang animate
 *    → bar update left mỗi frame, KHÔNG bị transition lag
 *  - Trigger loop khi mouseenter/mouseleave sidebar
 *  - Loop dừng sau 500ms (đủ cho mọi sidebar animation)
 */

import { db, ref, update, remove } from '../firebase.js'
import { printBulkLabels } from './qr-labels.js'

(function setupBulkActions() {
  'use strict';

  const TABLES = {
    'hydro-tbody':       { col: 'hydro',       label: 'thí nghiệm thủy nhiệt',  canLock: true,  refundStock: 'usedChems',     excelHeaders: ['code','date','person','material','temp','time','ph','status','note'] },
    'electrode-tbody':   { col: 'electrode',   label: 'mẫu điện cực',           canLock: true,  refundStock: 'usedInkChems',  excelHeaders: ['code','date','person','material','substrate','note'] },
    'electrochem-tbody': { col: 'electrochem', label: 'phép đo điện hóa',       canLock: false, refundStock: null,            excelHeaders: ['code','date','person','electrode','technique','reaction','note'] },
    'chemicals-tbody':   { col: 'chemicals',   label: 'hóa chất',               canLock: false, refundStock: null,            excelHeaders: ['name','formula','mw','purity','cas','location','stock','unit','qty','group'] },
    'equipment-tbody':   { col: 'equipment',   label: 'thiết bị',               canLock: false, refundStock: null,            excelHeaders: ['name','model','vendor','serial','location','note'] },
    'booking-tbody':     { col: 'bookings',    label: 'đăng ký thiết bị',       canLock: false, refundStock: null,            excelHeaders: ['code','equipmentName','userName','date','startTime','endTime','purpose','status'] },
    'member-tbody':      { col: 'members',     label: 'thành viên',             canLock: false, refundStock: null,            excelHeaders: ['name','email','role','phone'] },
    'ink-tbody':         { col: 'ink',         label: 'công thức mực',          canLock: true,  refundStock: null,            excelHeaders: ['code','date','person','material','solvent','note'] },
  };

  const _selected = {};
  for (const id in TABLES) _selected[id] = new Set();

  function isAdmin() {
    return !!(window.isAdmin || window.currentAuth?.isAdmin || ['admin','superadmin'].includes(window.currentAuth?.role));
  }

  function getTableColCount(tbody) {
    const table = tbody.closest('table');
    if (!table) return null;
    const thead = table.querySelector('thead tr');
    if (!thead) return null;
    let count = 0;
    thead.querySelectorAll(':scope > th').forEach(th => {
      const cs = parseInt(th.getAttribute('colspan'), 10) || 1;
      count += cs;
    });
    return count;
  }

  function isNonDataRow(tr) {
    if (tr.classList.contains('chem-group-header')) return true;
    const tds = tr.querySelectorAll(':scope > td');
    if (tds.length === 1 && tds[0].hasAttribute('colspan')) return true;
    if (tds.length > 0 && tds[0].hasAttribute('colspan')) {
      const cs = parseInt(tds[0].getAttribute('colspan'), 10) || 1;
      if (cs > 1) return true;
    }
    return false;
  }

  function getRowKey(tr, tbodyId) {
    const cfg = TABLES[tbodyId];
    if (!cfg) return null;

    if (tr.dataset.key) return tr.dataset.key;
    if (tr.dataset.bkKey) return tr.dataset.bkKey;

    const allOnclicks = [];
    if (tr.getAttribute('onclick')) allOnclicks.push(tr.getAttribute('onclick'));
    tr.querySelectorAll('[onclick]').forEach(el => {
      allOnclicks.push(el.getAttribute('onclick'));
    });

    const patterns = [
      new RegExp(`(?:delItem|lockItem|unlockItem|duplicateItem)\\s*\\(\\s*['"]${cfg.col}['"]\\s*,\\s*['"]([^'"]+)['"]`),
      /(?:edit\w+|showInkImage|showChemicalImage|showElectrodeImage|showHydroImage|showEcImage)\s*\(\s*['"]([^'"]+)['"]/,
      /_key\s*:\s*['"]([^'"]+)['"]/,
      /(?:approveBooking|rejectBooking|cancelBooking|checkInBooking|checkOutBooking|deleteBooking|openBookingDetail)\s*\(\s*['"]([^'"]+)['"]/,
      /(?:approveUser|rejectUser|deleteUserAccount|changeUserRole|deleteMemberSafe)\s*\(\s*['"]([^'"]+)['"]/,
    ];

    for (const oc of allOnclicks) {
      for (const re of patterns) {
        const m = oc.match(re);
        if (m && m[1]) {
          const key = m[1];
          const cache = window.cache;
          if (cache && cache[cfg.col]) {
            if (cache[cfg.col][key]) return key;
          } else {
            return key;
          }
        }
      }
    }
    return null;
  }

  function setupTableStructure(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return false;
    const table = tbody.closest('table');
    if (!table) return false;

    const thead = table.querySelector('thead');
    if (thead && !thead.querySelector('.bulk-cb-all')) {
      const headerRow = thead.querySelector('tr');
      if (headerRow) {
        const th = document.createElement('th');
        th.className = 'bulk-cb-cell';
        th.setAttribute('scope', 'col');
        th.style.cssText = 'width:36px;min-width:36px;max-width:36px;padding:0 4px;text-align:center';
        th.innerHTML = `<input type="checkbox" class="bulk-cb-all" data-tbody="${tbodyId}" aria-label="Chọn tất cả">`;
        headerRow.insertBefore(th, headerRow.firstChild);
      }
    }

    if (!table.querySelector('colgroup.bulk-colgroup')) {
      const colgroup = document.createElement('colgroup');
      colgroup.className = 'bulk-colgroup';
      const col = document.createElement('col');
      col.style.cssText = 'width:36px';
      col.setAttribute('span', '1');
      colgroup.appendChild(col);
      table.insertBefore(colgroup, table.firstChild);
    }

    return true;
  }

  function injectCheckboxes(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const cfg = TABLES[tbodyId];
    if (!cfg) return;

    setupTableStructure(tbodyId);
    const totalCols = getTableColCount(tbody);

    tbody.querySelectorAll('tr').forEach(tr => {
      if (tr.querySelector('.bulk-cb-cell')) return;

      if (isNonDataRow(tr)) {
        const firstTd = tr.querySelector(':scope > td[colspan]');
        if (firstTd && totalCols && !firstTd.dataset._colspanFixed) {
          firstTd.dataset._colspanFixed = '1';
          firstTd.setAttribute('colspan', String(totalCols));
        }
        return;
      }

      const rowKey = getRowKey(tr, tbodyId);
      if (!rowKey) return;

      const td = document.createElement('td');
      td.className = 'bulk-cb-cell';
      td.style.cssText = 'width:36px;min-width:36px;max-width:36px;padding:0 4px;text-align:center;vertical-align:middle';
      td.onclick = (e) => e.stopPropagation();
      td.innerHTML = `<input type="checkbox" class="bulk-cb" data-key="${rowKey}" data-tbody="${tbodyId}" aria-label="Chọn dòng">`;
      tr.insertBefore(td, tr.firstChild);
    });

    tbody.querySelectorAll('.bulk-cb').forEach(cb => {
      const key = cb.dataset.key;
      if (_selected[tbodyId].has(key)) cb.checked = true;
    });
    syncSelectAll(tbodyId);
  }

  function syncSelectAll(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const allCb = document.querySelector(`.bulk-cb-all[data-tbody="${tbodyId}"]`);
    if (!allCb) return;
    const cbs = tbody.querySelectorAll('.bulk-cb');
    if (cbs.length === 0) {
      allCb.checked = false;
      allCb.indeterminate = false;
      return;
    }
    const checkedCount = [...cbs].filter(c => c.checked).length;
    if (checkedCount === 0) {
      allCb.checked = false;
      allCb.indeterminate = false;
    } else if (checkedCount === cbs.length) {
      allCb.checked = true;
      allCb.indeterminate = false;
    } else {
      allCb.checked = false;
      allCb.indeterminate = true;
    }
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.classList?.contains('bulk-cb')) {
      const key = t.dataset.key;
      const tbodyId = t.dataset.tbody;
      if (t.checked) _selected[tbodyId].add(key);
      else _selected[tbodyId].delete(key);
      syncSelectAll(tbodyId);
      updateBar();
    } else if (t.classList?.contains('bulk-cb-all')) {
      const tbodyId = t.dataset.tbody;
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      const cbs = tbody.querySelectorAll('.bulk-cb');
      cbs.forEach(cb => {
        cb.checked = t.checked;
        if (t.checked) _selected[tbodyId].add(cb.dataset.key);
        else _selected[tbodyId].delete(cb.dataset.key);
      });
      updateBar();
    }
  });

  // ── BAR — follow sidebar realtime via rAF loop ────────────────────
  function updateBarPositionOnce() {
    const bar = document.getElementById('bulk-action-bar');
    if (!bar) return;
    const sidebar = document.querySelector('nav.site-sidebar');
    if (sidebar) {
      const rect = sidebar.getBoundingClientRect();
      bar.style.left = `${rect.right}px`;
    } else {
      bar.style.left = '0';
    }
  }

  // rAF loop — chạy liên tục trong `duration` ms
  // Bar sẽ luôn khớp với sidebar.right tại mọi frame
  let _rafActive = false;
  let _rafEndTime = 0;
  function startBarFollowLoop(duration = 1100) {
    _rafEndTime = performance.now() + duration;
    if (_rafActive) return; // đã đang loop, chỉ cần extend duration
    _rafActive = true;

    const tick = () => {
      updateBarPositionOnce();
      if (performance.now() < _rafEndTime) {
        requestAnimationFrame(tick);
      } else {
        _rafActive = false;
        // Final sync để chắc chắn
        updateBarPositionOnce();
      }
    };
    requestAnimationFrame(tick);
  }

  function setupSidebarFollow() {
    const sidebar = document.querySelector('nav.site-sidebar');
    if (!sidebar) {
      setTimeout(setupSidebarFollow, 500);
      return;
    }

    // Khi mouse enter sidebar → sidebar bắt đầu mở rộng → start loop
    sidebar.addEventListener('mouseenter', () => startBarFollowLoop(1100));
    // Khi mouse leave → sidebar bắt đầu thu lại → start loop
    sidebar.addEventListener('mouseleave', () => startBarFollowLoop(1100));
    // Phòng case toggle qua class change
    const classObs = new MutationObserver(() => startBarFollowLoop(1100));
    classObs.observe(sidebar, { attributes: true, attributeFilter: ['class'] });

    // Window resize
    window.addEventListener('resize', updateBarPositionOnce);

    // Initial sync
    updateBarPositionOnce();
  }

  function ensureBar() {
    if (document.getElementById('bulk-action-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'bulk-action-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Thao tác hàng loạt');
    // KHÔNG có transition `left` — bar update qua rAF mỗi frame
    bar.style.cssText = `
      position:fixed;top:60px;left:80px;right:0;z-index:90;
      background:linear-gradient(135deg,var(--teal),var(--teal-2));
      color:white;padding:10px 24px;
      display:none;align-items:center;gap:12px;
      box-shadow:0 4px 12px rgba(13,148,136,0.3);
      transform:translateY(-100%);
      transition:transform 0.25s ease;
    `;
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex:1">
        <button id="bulk-clear" type="button" aria-label="Bỏ chọn tất cả" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
        </button>
        <span id="bulk-count" style="font-weight:600;font-size:14px"></span>
      </div>
      <button id="bulk-export" type="button" class="bulk-action-btn" style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.4);color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px;transition:all 0.15s">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Xuất Excel
      </button>
      <button id="bulk-qr-label" type="button" class="bulk-action-btn" style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.4);color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;display:none;align-items:center;gap:6px;transition:all 0.15s">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="2" height="2"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/></svg>
        In nhãn QR
      </button>
      <button id="bulk-lock" type="button" class="bulk-action-btn" style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.4);color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;display:none;align-items:center;gap:6px;transition:all 0.15s">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Khóa
      </button>
      <button id="bulk-unlock" type="button" class="bulk-action-btn" style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.4);color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;display:none;align-items:center;gap:6px;transition:all 0.15s">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
        Mở khóa
      </button>
      <button id="bulk-delete" type="button" class="bulk-action-btn" style="background:rgba(220,38,38,0.85);border:1px solid rgba(220,38,38,0.6);color:white;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px;transition:all 0.15s">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        Xóa
      </button>
    `;
    document.body.appendChild(bar);

    bar.querySelectorAll('.bulk-action-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        if (btn.id === 'bulk-delete') btn.style.background = 'rgba(220,38,38,1)';
        else btn.style.background = 'rgba(255,255,255,0.3)';
      });
      btn.addEventListener('mouseleave', () => {
        if (btn.id === 'bulk-delete') btn.style.background = 'rgba(220,38,38,0.85)';
        else btn.style.background = 'rgba(255,255,255,0.18)';
      });
    });

    bar.querySelector('#bulk-clear').addEventListener('click', clearAll);
    bar.querySelector('#bulk-export').addEventListener('click', () => doAction('export'));
    bar.querySelector('#bulk-qr-label').addEventListener('click', () => doAction('qrlabel'));
    bar.querySelector('#bulk-lock').addEventListener('click', () => doAction('lock'));
    bar.querySelector('#bulk-unlock').addEventListener('click', () => doAction('unlock'));
    bar.querySelector('#bulk-delete').addEventListener('click', () => doAction('delete'));

    setupSidebarFollow();
  }

  function getActiveTbody() {
    for (const id in _selected) {
      if (_selected[id].size > 0) return id;
    }
    return null;
  }

  function updateBar() {
    ensureBar();
    const bar = document.getElementById('bulk-action-bar');
    const tbodyId = getActiveTbody();
    if (!tbodyId) {
      bar.style.transform = 'translateY(-100%)';
      setTimeout(() => { if (getActiveTbody() === null) bar.style.display = 'none'; }, 250);
      return;
    }
    const cfg = TABLES[tbodyId];
    const count = _selected[tbodyId].size;
    bar.querySelector('#bulk-count').textContent = `Đã chọn ${count} ${cfg.label}`;
    bar.querySelector('#bulk-lock').style.display   = (cfg.canLock && isAdmin()) ? 'flex' : 'none';
    bar.querySelector('#bulk-unlock').style.display = (cfg.canLock && isAdmin()) ? 'flex' : 'none';
    // QR label: hiện cho chemicals + equipment, mọi role đều dùng được
    const isQrTable = tbodyId === 'chemicals-tbody' || tbodyId === 'equipment-tbody';
    bar.querySelector('#bulk-qr-label').style.display = isQrTable ? 'flex' : 'none';
    bar.querySelector('#bulk-delete').style.display = isAdmin() ? 'flex' : 'none';
    bar.style.display = 'flex';
    updateBarPositionOnce();
    requestAnimationFrame(() => { bar.style.transform = 'translateY(0)'; });
  }

  function clearAll() {
    for (const id in _selected) _selected[id].clear();
    document.querySelectorAll('.bulk-cb, .bulk-cb-all').forEach(cb => {
      cb.checked = false;
      cb.indeterminate = false;
    });
    updateBar();
  }

  function validateKeys(col, keys) {
    const cache = window.cache;
    if (!cache || !cache[col]) return keys;
    const validKeys = keys.filter(k => cache[col][k]);
    const invalidKeys = keys.filter(k => !cache[col][k]);
    if (invalidKeys.length > 0) {
      console.warn('[bulk-actions] Skipped invalid keys:', invalidKeys);
    }
    return validKeys;
  }

  function computeStockRefund(col, keys, refundField) {
    const cache = window.cache;
    if (!cache || !cache[col] || !cache.chemicals) return { refunds: new Map(), historyLogs: [] };

    const refunds = new Map();
    const historyLogs = [];

    for (const k of keys) {
      const record = cache[col][k];
      if (!record) continue;
      if (record.isSample) continue;
      const usedArr = record[refundField];
      if (!Array.isArray(usedArr)) continue;

      for (const u of usedArr) {
        if (!u.key) continue;
        const mass = parseFloat(u.mass || 0);
        if (mass <= 0) continue;
        const cur = refunds.get(u.key) || 0;
        refunds.set(u.key, cur + mass);
      }

      const code = record.code || k;
      historyLogs.push({ code, refundField, items: usedArr });
    }

    return { refunds, historyLogs };
  }

  async function applyStockRefund(refunds) {
    const cache = window.cache;
    if (!cache?.chemicals) return [];

    const updates = [];
    const summary = [];

    for (const [chemKey, refundMass] of refunds.entries()) {
      const chem = cache.chemicals[chemKey];
      if (!chem) continue;
      const curStock = parseFloat(chem.stock || 0);
      const newStock = parseFloat((curStock + refundMass).toFixed(5));
      updates.push(update(ref(db, `chemicals/${chemKey}`), { stock: newStock }));
      summary.push({ name: chem.name, unit: chem.unit || 'g', refund: refundMass, newStock });
    }

    await Promise.all(updates);
    return summary;
  }

  function logHistoryRefunds(col, refundSummary, deletedCodes) {
    if (typeof window.logHistory !== 'function') return;
    refundSummary.forEach(s => {
      window.logHistory(
        `Hoàn tồn kho: ${s.name}`,
        `+${s.refund}${s.unit} (xóa hàng loạt ${col})`
      );
    });
    if (deletedCodes.length > 0) {
      window.logHistory(
        `Xóa hàng loạt ${col}`,
        `${deletedCodes.length} bản ghi: ${deletedCodes.slice(0, 5).join(', ')}${deletedCodes.length > 5 ? '...' : ''}`
      );
    }
  }

  async function doAction(type) {
    const tbodyId = getActiveTbody();
    if (!tbodyId) return;
    const cfg = TABLES[tbodyId];
    let keys = [...(_selected[tbodyId] || [])];
    if (keys.length === 0) return;

    keys = validateKeys(cfg.col, keys);
    if (keys.length === 0) {
      window.showToast?.('Không có dữ liệu hợp lệ để xử lý', 'danger');
      clearAll();
      return;
    }

    if (type === 'export') {
      exportToExcel(tbodyId, cfg, keys);
      return;
    }

    if (type === 'qrlabel') {
      // Map tbodyId → type (chem|equip) cho qr-labels
      const qrType = tbodyId === 'chemicals-tbody' ? 'chem' :
                     tbodyId === 'equipment-tbody' ? 'equip' : null;
      if (!qrType) return;

      // Hỏi user chọn cách: in trực tiếp hay PDF
      const choice = window.prompt(
        `Bạn muốn xử lý ${keys.length} nhãn QR như thế nào?\n\n` +
        `1 = In trực tiếp (mở tab mới + Ctrl+P)\n` +
        `2 = Tải PDF về máy\n\n` +
        `Nhập 1 hoặc 2:`,
        '1'
      );
      if (choice === '1') {
        await printBulkLabels(keys, qrType, 'print');
      } else if (choice === '2') {
        await printBulkLabels(keys, qrType, 'pdf');
      }
      return;
    }

    if (type === 'delete') {
      if (!isAdmin()) {
        window.showToast?.('Không có quyền xóa', 'danger');
        return;
      }

      let refundInfo = null;
      let confirmMsg = `Xóa ${keys.length} ${cfg.label}? Không thể hoàn tác.`;

      if (cfg.refundStock) {
        refundInfo = computeStockRefund(cfg.col, keys, cfg.refundStock);
        if (refundInfo.refunds.size > 0) {
          const cache = window.cache;
          const refundLines = [...refundInfo.refunds.entries()].slice(0, 5).map(([chemKey, mass]) => {
            const chem = cache?.chemicals?.[chemKey];
            return `  • ${chem?.name || chemKey}: +${mass}${chem?.unit || 'g'}`;
          });
          confirmMsg += `\n\nSẽ hoàn tồn kho:\n${refundLines.join('\n')}`;
          if (refundInfo.refunds.size > 5) {
            confirmMsg += `\n  ... và ${refundInfo.refunds.size - 5} hóa chất khác`;
          }
        }
      }

      if (!confirm(confirmMsg)) return;

      try {
        let refundSummary = [];
        if (refundInfo && refundInfo.refunds.size > 0) {
          refundSummary = await applyStockRefund(refundInfo.refunds);
        }
        const deletedCodes = keys.map(k => window.cache?.[cfg.col]?.[k]?.code || k);
        const deleteOps = keys.map(k => remove(ref(db, `${cfg.col}/${k}`)));
        await Promise.all(deleteOps);
        logHistoryRefunds(cfg.col, refundSummary, deletedCodes);

        const refundMsg = refundSummary.length > 0 ? ` (hoàn ${refundSummary.length} loại hóa chất)` : '';
        window.showToast?.(`Đã xóa ${keys.length} ${cfg.label}${refundMsg}`, 'success');
        clearAll();
      } catch (e) {
        console.error('[bulk-delete]', e);
        window.showToast?.('Lỗi khi xóa: ' + e.message, 'danger');
      }
      return;
    }

    if (type === 'lock' || type === 'unlock') {
      if (!cfg.canLock) return;
      if (!isAdmin()) { window.showToast?.('Không có quyền', 'danger'); return; }
      const lockValue = type === 'lock';
      try {
        const ops = keys.map(k => update(ref(db, `${cfg.col}/${k}`), { locked: lockValue }));
        await Promise.all(ops);
        window.showToast?.(`Đã ${type === 'lock' ? 'khóa' : 'mở khóa'} ${keys.length} ${cfg.label}`, 'success');
        clearAll();
      } catch (e) {
        console.error('[bulk-lock]', e);
        window.showToast?.('Lỗi: ' + e.message, 'danger');
      }
      return;
    }
  }

  function exportToExcel(tbodyId, cfg, keys) {
    if (typeof window.XLSX === 'undefined') {
      window.showToast?.('Thư viện Excel chưa sẵn sàng', 'danger');
      return;
    }
    const cache = window.cache || {};
    const colData = cache[cfg.col] || {};
    const rows = keys.map(k => colData[k]).filter(Boolean);
    if (rows.length === 0) {
      window.showToast?.('Không có dữ liệu để xuất', 'info');
      return;
    }
    const headers = cfg.excelHeaders;
    const data = [headers, ...rows.map(r => headers.map(h => formatCell(r[h])))];
    try {
      const ws = window.XLSX.utils.aoa_to_sheet(data);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, cfg.label.substring(0, 30));
      const fname = `${cfg.col}_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      window.XLSX.writeFile(wb, fname);
      window.showToast?.(`Đã xuất ${rows.length} ${cfg.label}`, 'success');
    } catch (e) {
      console.error('[bulk-export]', e);
      window.showToast?.('Lỗi xuất Excel: ' + e.message, 'danger');
    }
  }

  function formatCell(v) {
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function observeTbody(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (tbody._bulkObserved) return;
    tbody._bulkObserved = true;

    setupTableStructure(tbodyId);
    injectCheckboxes(tbodyId);

    const obs = new MutationObserver(() => {
      setupTableStructure(tbodyId);
      if (!tbody._bulkPending) {
        tbody._bulkPending = true;
        queueMicrotask(() => {
          tbody._bulkPending = false;
          injectCheckboxes(tbodyId);
        });
      }
    });
    obs.observe(tbody, { childList: true, subtree: false });
  }

  function init() {
    ensureBar();
    Object.keys(TABLES).forEach(observeTbody);
    setTimeout(() => Object.keys(TABLES).forEach(observeTbody), 1000);
    setTimeout(() => Object.keys(TABLES).forEach(observeTbody), 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && getActiveTbody()) clearAll();
  });

  window._bulkSelected = _selected;
  console.log('[bulk-actions v11.1] loaded — rAF 1100ms (slower)');
})();
