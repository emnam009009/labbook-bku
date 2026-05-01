/**
 * pages/ink.js
 * Render Ink (Công thức mực) — danh sách công thức mực với thành phần rắn/lỏng
 *
 * Phạm vi Phần 5b: chỉ render. Save/edit/lock/image/addInkRow/updateInkSelects/fillInkFormula
 * vẫn ở main.js, sẽ tách sau.
 *
 * Phụ thuộc:
 *  - cache qua window.cache
 *  - vals, formatChemical từ utils/format.js
 *  - canDelete từ utils/auth-helpers.js
 *  - isAdmin qua window.isAdmin
 *
 * Đặc trưng:
 *  - Mỗi row có thành phần rắn (mass mg) + lỏng (vol μL) — render thành multi-line
 *  - DOI link nếu có (mở publication)
 *  - Lock toggle (admin only)
 */

import { vals, formatChemical } from '../utils/format.js'
import { applyTableSort, initTableSort } from '../services/table-sort.js'
import { canDelete } from '../utils/auth-helpers.js'

// SVG icons dùng chung
const LOCK_ICON_ON = '<svg height="16" viewBox="0 0 100 100" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M30,46V38a20,20,0,0,1,40,0v8a8,8,0,0,1,8,8V74a8,8,0,0,1-8,8H30a8,8,0,0,1-8-8V54A8,8,0,0,1,30,46Zm32-8v8H38V38a12,12,0,0,1,24,0Z" fill-rule="evenodd"/></svg>';
const LOCK_ICON_OFF = '<svg height="16" viewBox="0 0 100 100" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M50,18A19.9,19.9,0,0,0,30,38v8a8,8,0,0,0-8,8V74a8,8,0,0,0,8,8H70a8,8,0,0,0,8-8V54a8,8,0,0,0-8-8H38V38a12,12,0,0,1,23.6-3,4,4,0,1,0,7.8-2A20.1,20.1,0,0,0,50,18Z"/></svg>';
const DEL_SVG = '<svg class="w-4 h-4 fill-none stroke-white" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke-linejoin="round" stroke-linecap="round"></path></svg>';

export function renderInk() {
  const cache = window.cache;
  if (!cache) return;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);

  let rows = vals(cache.ink || {});
  
  // Apply table sort
  initTableSort('ink-tbody', renderInk);
  rows = applyTableSort('ink-tbody', rows, (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const tbody = document.getElementById('ink-tbody');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">' +
      '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.5 2a.5.5 0 01.5.5V4h4V2.5a.5.5 0 011 0V4h1a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h1V2.5a.5.5 0 01.5-.5z"/></svg>' +
      '<div class="empty-state-text">Chưa có công thức mực nào</div>' +
      '<div class="empty-state-sub">Chưa có dữ liệu</div>' +
      '<button class="empty-state-btn member-only" onclick="openModal(\'modal-ink\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        'Thêm công thức mực' +
      '</button>' +
    '</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function(r) {
    const solidStr = (r.solids || []).map(s =>
      s.name + ' <span style="color:#C2410C;font-weight:600">' + s.mass + 'mg</span>'
    ).join('<br>');
    const liquidStr = (r.liquids || []).map(l =>
      l.name + ' <span style="color:#1D4ED8;font-weight:600">' + l.vol + 'μL</span>'
    ).join('<br>');

    // Tên formula: nếu có DOI → link mở publication, không thì plain text
    const nameCell = r.doi
      ? '<a href="https://doi.org/' + r.doi + '" target="_blank" style="font-weight:600;color:var(--text);text-decoration:none" onmouseover="this.style.color=\'var(--blue2)\'" onmouseout="this.style.color=\'var(--text)\'">' + r.name + ' <svg width="11" height="11" viewBox="0 0 24 24" stroke="var(--blue2)" fill="none" stroke-width="2" style="vertical-align:middle"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>'
      : '<strong>' + r.name + '</strong>';

    return '<tr class="clickable-row" style="vertical-align:middle" onclick="' + (!r.locked ? 'editInk(\'' + r._key + '\')' : '') + '" title="' + (!r.locked ? 'Nhấn để sửa' : 'Đã khóa') + '">' +
      '<td onclick="event.stopPropagation()"><strong style="font-family:\'Courier New\',monospace;font-size:14px;cursor:pointer;color:var(--blue2)" onclick="showInkImage(\'' + r._key + '\')">' + r.code + '</strong></td>' +
      '<td style="text-align:center">' + nameCell + '</td>' +
      '<td style="text-align:center"><span class="tag">' + formatChemical(r.material) + '</span></td>' +
      '<td style="font-size:12px;text-align:center">' + (solidStr || '—') + '</td>' +
      '<td style="font-size:12px;text-align:center">' + (liquidStr || '—') + '</td>' +
      '<td class="mono" style="text-align:center">' + (r.totalVol || 0) + ' μL</td>' +
      '<td style="text-align:center">' + (r.createdAt || '') + '</td>' +
      '<td class="action-cell" onclick="event.stopPropagation()" style="text-align:left">' +
        '<label class="lock-toggle ink-lock-btn" style="display:none" onclick="event.stopPropagation();' + (r.locked ? 'unlockItem(\'ink\',\'' + r._key + '\')' : 'lockItem(\'ink\',\'' + r._key + '\')') + '">' +
          '<div class="lock-track ' + (r.locked ? 'locked' : 'unlocked') + '">' +
            '<span class="lock-icon">' + (r.locked ? LOCK_ICON_ON : LOCK_ICON_OFF) + '</span><div class="lock-thumb"></div>' +
          '</div>' +
        '</label>' +
        '<button class="plusButton" onclick="duplicateItem(\'ink\',\'' + r._key + '\')" title="Nhân bản"><svg class="plusIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14"/></svg></button>' +
        '<button class="del-btn" onclick="delItem(\'ink\',\'' + r._key + '\',\'' + r.code + '\')" style="' + (!canDelete(r) || r.locked ? 'visibility:hidden' : '') + '">' + DEL_SVG + '</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  document.querySelectorAll('.ink-lock-btn').forEach(function(btn) {
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  });
}
