/**
 * pages/experiments.js
 * Render 3 page TN chính: Hydrothermal, Electrode, Electrochem
 *
 * Phụ thuộc:
 *  - cache qua window.cache
 *  - escapeHtml, escapeJs, vals, fuzzy, formatChemical từ utils/format.js
 *  - getPersonName, canDelete từ utils/auth-helpers.js
 *  - statusBadge qua window.statusBadge (chưa được tách, vẫn ở main.js)
 *  - getElectrodeMaterial qua window.getElectrodeMaterial (chưa được tách)
 *  - currentAuth qua window.currentAuth (cho isAdmin check để toggle lock button)
 *
 * Lưu ý kiến trúc:
 *  Phần 4 này CHỈ tách render functions (đọc cache → vẽ DOM, không có side-effect).
 *  Save/edit/image handlers vẫn ở main.js, sẽ tách ở Phần sau.
 */

import { escapeHtml, escapeJs, vals, fuzzy, formatChemical } from '../utils/format.js'
import { applyTableSort, initTableSort } from '../services/table-sort.js'
import { getPersonName, canDelete } from '../utils/auth-helpers.js'
import { applyDisplayLimit } from '../utils/display-limit.js'

// SVG icons dùng chung — định nghĩa 1 lần ở module-level để không lặp string trong template
const LOCK_ICON_ON = '<svg height="16" viewBox="0 0 100 100" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M30,46V38a20,20,0,0,1,40,0v8a8,8,0,0,1,8,8V74a8,8,0,0,1-8,8H30a8,8,0,0,1-8-8V54A8,8,0,0,1,30,46Zm32-8v8H38V38a12,12,0,0,1,24,0Z" fill-rule="evenodd"/></svg>';
const LOCK_ICON_OFF = '<svg height="16" viewBox="0 0 100 100" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M50,18A19.9,19.9,0,0,0,30,38v8a8,8,0,0,0-8,8V74a8,8,0,0,0,8,8H70a8,8,0,0,0,8-8V54a8,8,0,0,0-8-8H38V38a12,12,0,0,1,23.6-3,4,4,0,1,0,7.8-2A20.1,20.1,0,0,0,50,18Z"/></svg>';
const DEL_SVG = '<svg class="w-4 h-4 fill-none stroke-white" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke-linejoin="round" stroke-linecap="round"></path></svg>';

// ───────────────────────────────────────────────────────────
// Render Hydrothermal (Thí nghiệm thuỷ nhiệt)
// ───────────────────────────────────────────────────────────
export function renderHydro() {
  const cache = window.cache;
  if (!cache) return;
  const isAdmin = !!window.currentAuth?.isAdmin;
  const statusBadge = window.statusBadge || (s => s || '');

  const q = (document.getElementById('hydro-search') || {}).value || '';
  const sf = (document.getElementById('hydro-status-filter') || {}).value || '';
  const myName = getPersonName();

  let rows = vals(cache.hydro)
    .filter(r =>
      (!q || [r.code, r.person, r.material, r.note].some(v => fuzzy(v || '', q))) &&
      (!sf || r.status === sf) &&
      (window.passMemberFilter ? window.passMemberFilter('hydro', r.person) : true)
    )
    ;
  // Apply table sort (override default nếu user đã click header)
  initTableSort('hydro-tbody', renderHydro);
  rows = applyTableSort('hydro-tbody', rows, (a, b) => (b.date || '').localeCompare(a.date || ''));
  rows = applyDisplayLimit(rows, 'hydro', 'hydro-limit-hint', 'hydro-tbody');

  const tbody = document.getElementById('hydro-tbody');
  if (!tbody) return;

  tbody.innerHTML = rows.length
    ? rows.map(r =>
        '<tr class="clickable-row" onclick="flashRow(this);' + (!r.locked ? 'editHydro(\'' + r._key + '\')' : '') + '" title="' + (!r.locked ? 'Nhấn để sửa' : 'Đã khóa') + '">' +
        '<td><strong style="font-family:\'Courier New\',monospace;font-size:14px;cursor:pointer;color:var(--blue2)" onclick="event.stopPropagation();showHydroImage(\'' + r._key + '\')">' + escapeHtml(r.code) + '</strong></td>' +
        '<td style="text-align:center">' + escapeHtml(r.createdAt || '') + '</td>' +
        '<td style="text-align:center">' + escapeHtml(r.person) + '</td>' +
        '<td style="text-align:center"><strong>' + formatChemical(escapeHtml(r.material)) + '</strong></td>' +
        '<td class="mono" style="text-align:center">' + escapeHtml(r.temp) + ' °C</td>' +
        '<td class="mono" style="text-align:center">' + escapeHtml(r.time) + 'h</td>' +
        '<td class="mono" style="text-align:center">' + escapeHtml(r.ph) + '</td>' +
        '<td style="text-align:center">' + (r.isSample ? '...' : statusBadge(r.status)) + '</td>' +
        '<td style="text-align:center;max-width:150px;font-size:12px;color:var(--text-2)">' + escapeHtml(r.note || '—') + '</td>' +
        '<td class="action-cell" onclick="event.stopPropagation()" style="text-align:left">' +
          '<label class="lock-toggle hydro-lock-btn" style="display:none" onclick="event.stopPropagation();' + (r.locked ? 'unlockItem(\'hydro\',\'' + r._key + '\')' : 'lockItem(\'hydro\',\'' + r._key + '\')') + '">' +
            '<div class="lock-track ' + (r.locked ? 'locked' : 'unlocked') + '">' +
              '<span class="lock-icon">' + (r.locked ? LOCK_ICON_ON : LOCK_ICON_OFF) + '</span><div class="lock-thumb"></div>' +
            '</div>' +
          '</label>' +
          '<button class="plusButton" onclick="duplicateItem(\'hydro\',\'' + r._key + '\')" title="Nhân bản"><svg class="plusIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14"/></svg></button>' +
          '<button class="del-btn" onclick="delItem(\'hydro\',\'' + r._key + '\',\'' + escapeJs(r.code) + '\')" style="' + (r.locked ? 'visibility:hidden' : (!canDelete(r) ? 'visibility:hidden' : '')) + '">' + DEL_SVG + '</button>' +
        '</td></tr>'
      ).join('')
    : '<tr><td colspan="99">' + '<div class="empty-state"><div class="empty-state-icon-wrap"><svg class="empty-state-icon" viewBox="0 0 64 64" fill="none"><path d="M22 4 L42 4 L42 8 L40 8 L40 26 L52 50 Q54 56 48 56 L16 56 Q10 56 12 50 L24 26 L24 8 L22 8 Z" fill="var(--teal-light)" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round"/><ellipse cx="32" cy="46" rx="14" ry="3" fill="var(--teal)" opacity="0.5"/><circle cx="28" cy="40" r="2" fill="var(--teal)"/><circle cx="36" cy="42" r="1.5" fill="var(--teal)" opacity="0.7"/><circle cx="32" cy="44" r="1" fill="var(--teal)" opacity="0.5"/><line x1="22" y1="8" x2="42" y2="8" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"/></svg><span class="badge-dot"></span></div><div class="empty-state-text">Sẵn sàng cho thí nghiệm đầu tiên</div><div class="empty-state-sub">Ghi lại nhiệt độ, thời gian và quá trình phản ứng để theo dõi tiến độ nghiên cứu một cách có hệ thống.</div><div class="empty-state-steps"><div class="empty-state-step"><div class="empty-state-step-num">1</div><div class="empty-state-step-text">Click <strong>"Thêm thí nghiệm"</strong></div></div><div class="empty-state-step"><div class="empty-state-step-num">2</div><div class="empty-state-step-text">Nhập vật liệu, nhiệt độ, thời gian</div></div><div class="empty-state-step"><div class="empty-state-step-num">3</div><div class="empty-state-step-text">Lưu và theo dõi tiến độ</div></div></div><button class="empty-state-btn member-only" onclick="openModal(\'modal-hydrothermal\')"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Bắt đầu</button></div>' + '</td></tr>';

  document.querySelectorAll('.hydro-lock-btn').forEach(btn => {
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  });
}

// ───────────────────────────────────────────────────────────
// Render Electrode (Điện cực)
// ───────────────────────────────────────────────────────────
export function renderElectrode() {
  const cache = window.cache;
  if (!cache) return;
  const isAdmin = !!window.currentAuth?.isAdmin;
  const statusBadge = window.statusBadge || (s => s || '');

  const q = (document.getElementById('electrode-search') || {}).value || '';
  const sf = (document.getElementById('electrode-status-filter') || {}).value || '';

  let rows = vals(cache.electrode);
  if (q) rows = rows.filter(r => [r.code, r.person, r.material, r.substrate].some(v => fuzzy(v || '', q)));
  // Apply table sort
  initTableSort('electrode-tbody', renderElectrode);
  rows = applyTableSort('electrode-tbody', rows, (a, b) => (b.date || '').localeCompare(a.date || ''));
  rows = applyDisplayLimit(rows, 'electrode', 'electrode-limit-hint', 'electrode-tbody');

  if (sf) rows = rows.filter(r => r.status === sf);
  if (window.passMemberFilter) {
    rows = rows.filter(r => window.passMemberFilter('electrode', r.person));
  }

  const tbody = document.getElementById('electrode-tbody');
  if (!tbody) return;

  tbody.innerHTML = rows.length
    ? rows.map(r =>
        '<tr class="clickable-row" onclick="flashRow(this);' + (!r.locked ? 'editElectrode(\'' + r._key + '\')' : '') + '" title="' + (!r.locked ? 'Nhấn để sửa' : 'Đã khóa') + '">' +
        '<td><strong style="font-family:\'Courier New\',monospace;font-size:14px;cursor:pointer;color:var(--blue2)" onclick="event.stopPropagation();showElectrodeImage(\'' + r._key + '\')">' + r.code + '</strong></td>' +
        '<td style="text-align:center">' + (r.createdAt || '') + '</td>' +
        '<td style="text-align:center">' + r.person + '</td>' +
        '<td style="text-align:center"><strong>' + formatChemical(r.material) + '</strong></td>' +
        '<td class="mono" style="text-align:center">' + r.substrate + '</td>' +
        '<td class="mono" style="text-align:center">' + r.vol + '</td>' +
        '<td class="mono" style="text-align:center">' + r.area + '</td>' +
        '<td class="mono" style="text-align:center;color:var(--blue2);font-weight:600">' + r.loading + '</td>' +
        '<td class="mono" style="text-align:center">' + r.annealT + ' °C/' + r.annealH + 'h</td>' +
        '<td style="text-align:center">' + statusBadge(r.status || '') + '</td>' +
        '<td class="action-cell" onclick="event.stopPropagation()" style="text-align:left">' +
          '<label class="lock-toggle electrode-lock-btn" style="display:none" onclick="event.stopPropagation();' + (r.locked ? 'unlockItem(\'electrode\',\'' + r._key + '\')' : 'lockItem(\'electrode\',\'' + r._key + '\')') + '">' +
            '<div class="lock-track ' + (r.locked ? 'locked' : 'unlocked') + '">' +
              '<span class="lock-icon">' + (r.locked ? LOCK_ICON_ON : LOCK_ICON_OFF) + '</span><div class="lock-thumb"></div>' +
            '</div>' +
          '</label>' +
          '<button class="plusButton" onclick="duplicateItem(\'electrode\',\'' + r._key + '\')" title="Nhân bản"><svg class="plusIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14"/></svg></button>' +
          '<button class="del-btn" onclick="delItem(\'electrode\',\'' + r._key + '\',\'' + r.code + '\')" style="' + (r.locked ? 'visibility:hidden' : (!canDelete(r) ? 'visibility:hidden' : '')) + '">' + DEL_SVG + '</button>' +
        '</td>' +
        '</tr>'
      ).join('')
    : '<tr><td colspan="99">' + '<div class="empty-state"><div class="empty-state-icon-wrap"><svg class="empty-state-icon" viewBox="0 0 64 64" fill="none"><path d="M22 4 L42 4 L42 8 L40 8 L40 26 L52 50 Q54 56 48 56 L16 56 Q10 56 12 50 L24 26 L24 8 L22 8 Z" fill="var(--teal-light)" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round"/><ellipse cx="32" cy="46" rx="14" ry="3" fill="var(--teal)" opacity="0.5"/><circle cx="28" cy="40" r="2" fill="var(--teal)"/><circle cx="36" cy="42" r="1.5" fill="var(--teal)" opacity="0.7"/><circle cx="32" cy="44" r="1" fill="var(--teal)" opacity="0.5"/><line x1="22" y1="8" x2="42" y2="8" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"/></svg><span class="badge-dot"></span></div><div class="empty-state-text">Sẵn sàng tạo điện cực đầu tiên</div><div class="empty-state-sub">Quản lý các điện cực đã chế tạo và theo dõi quá trình hoàn thiện chúng.</div><div class="empty-state-steps"><div class="empty-state-step"><div class="empty-state-step-num">1</div><div class="empty-state-step-text">Click <strong>"Thêm điện cực"</strong></div></div><div class="empty-state-step"><div class="empty-state-step-num">2</div><div class="empty-state-step-text">Nhập vật liệu, nền ĐC, V, S</div></div><div class="empty-state-step"><div class="empty-state-step-num">3</div><div class="empty-state-step-text">Lưu và theo dõi tải lượng</div></div></div><button class="empty-state-btn member-only" onclick="openModal(\'modal-electrode\')"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Bắt đầu</button></div>' + '</td></tr>';

  // [Quirk legacy] Click chỉ áp .electrode-lock-btn nhưng selector cũ gồm .hydro-lock-btn để
  // toggle visibility cùng lúc khi role thay đổi. Giữ nguyên cho backward compatible.
  document.querySelectorAll('.hydro-lock-btn,.electrode-lock-btn').forEach(btn => {
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  });
}

// ───────────────────────────────────────────────────────────
// Render Electrochem (Phép đo điện hoá)
// ───────────────────────────────────────────────────────────
export function renderElectrochem() {
  const cache = window.cache;
  if (!cache) return;
  const isAdmin = !!window.currentAuth?.isAdmin;
  const statusBadge = window.statusBadge || (s => s || '');
  const getElectrodeMaterial = window.getElectrodeMaterial || (() => '');

  const q = (document.getElementById('ec-search') || {}).value || '';
  const sf = (document.getElementById('ec-status-filter') || {}).value || '';

  let rows = vals(cache.electrochem);
  if (q) rows = rows.filter(r => [r.code, r.person, r.electrode, r.type, r.electrolyte].some(v => fuzzy(v || '', q)));
  // Apply table sort
  initTableSort('electrochem-tbody', renderElectrochem);
  rows = applyTableSort('electrochem-tbody', rows, (a, b) => (b.date || '').localeCompare(a.date || ''));
  rows = applyDisplayLimit(rows, 'electrochem', 'electrochem-limit-hint', 'electrochem-tbody');

  if (sf) rows = rows.filter(r => r.status === sf);
  if (window.passMemberFilter) {
    rows = rows.filter(r => window.passMemberFilter('ec', r.person));
  }

  const tbody = document.getElementById('electrochem-tbody');
  if (!tbody) return;

  tbody.innerHTML = rows.length
    ? rows.map(r => {
        const locked = !!r.locked;
        const k = r._key;
        const isAI = window.__currentUserEmail === 'nvhn.7202@gmail.com';
        const delStyle = (locked || !canDelete(r)) ? 'visibility:hidden' : '';
        const lockOnclick = locked ? "unlockItem('electrochem','" + k + "')" : "lockItem('electrochem','" + k + "')";

        return '<tr class="clickable-row" data-key="' + k + '" onclick="flashRow(this);' + (!locked ? "editElectrochem('" + k + "')" : '') + '" title="' + (!locked ? 'Nhấn để sửa' : 'Đã khóa') + '">' +
          '<td><strong style="font-size:13px">' + escapeHtml(r.code) + '</strong></td>' +
          '<td style="text-align:center">' + (r.createdAt || '') + '</td>' +
          '<td style="text-align:center">' + escapeHtml(r.person || '') + '</td>' +
          '<td style="text-align:center"><strong>' + formatChemical(getElectrodeMaterial(r.electrode)) + '</strong></td>' +
          '<td style="text-align:center">' + escapeHtml(r.electrode || '') + '</td>' +
          '<td style="text-align:center"><span class="tag">' + escapeHtml(r.type || '') + '</span></td>' +
          '<td style="text-align:center">' + escapeHtml(r.electrolyte || '') + '</td>' +
          '<td style="text-align:center;color:var(--blue2);font-weight:600">' + (r.eta10 ? r.eta10 + ' mV' : '—') + '</td>' +
          '<td style="text-align:center">' + (r.tafel ? r.tafel + ' mV/dec' : '—') + '</td>' +
          '<td style="text-align:center">' + statusBadge(r.status) + '</td>' +
          '<td class="action-cell" onclick="event.stopPropagation()" style="text-align:left">' +
            '<button class="btn btn-xs btn-ai" title="Phân tích AI" style="' + (isAI ? '' : 'display:none;') + 'background:linear-gradient(135deg,var(--teal),var(--teal-2));color:white;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap" onclick="event.stopPropagation();analyzeElectrochemAI({...cache.electrochem[\'' + k + '\'],_key:\'' + k + '\'})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 8v4m0 4h.01"/></svg> AI</button>' +
            '<label class="lock-toggle ec-lock-btn" style="display:none" onclick="event.stopPropagation();' + lockOnclick + '">' +
              '<div class="lock-track ' + (locked ? 'locked' : 'unlocked') + '">' +
                '<span class="lock-icon">' + (locked ? LOCK_ICON_ON : LOCK_ICON_OFF) + '</span><div class="lock-thumb"></div>' +
              '</div>' +
            '</label>' +
            '<button class="plusButton" onclick="duplicateItem(\'electrochem\',\'' + k + '\')" title="Nhân bản"><svg class="plusIcon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>' +
            '<button class="del-btn" onclick="delItem(\'electrochem\',\'' + k + '\',\'' + escapeJs(r.code) + '\')" style="' + delStyle + '">' + DEL_SVG + '</button>' +
          '</td></tr>';
      }).join('')
    : '<tr><td colspan="99">' + '<div class="empty-state"><div class="empty-state-icon-wrap"><svg class="empty-state-icon" viewBox="0 0 64 64" fill="none"><path d="M22 4 L42 4 L42 8 L40 8 L40 26 L52 50 Q54 56 48 56 L16 56 Q10 56 12 50 L24 26 L24 8 L22 8 Z" fill="var(--teal-light)" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round"/><ellipse cx="32" cy="46" rx="14" ry="3" fill="var(--teal)" opacity="0.5"/><circle cx="28" cy="40" r="2" fill="var(--teal)"/><circle cx="36" cy="42" r="1.5" fill="var(--teal)" opacity="0.7"/><circle cx="32" cy="44" r="1" fill="var(--teal)" opacity="0.5"/><line x1="22" y1="8" x2="42" y2="8" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"/></svg><span class="badge-dot"></span></div><div class="empty-state-text">Sẵn sàng đo điện hóa đầu tiên</div><div class="empty-state-sub">Ghi lại phép đo điện hóa với loại đo, chất điện ly và kết quả η, Tafel.</div><div class="empty-state-steps"><div class="empty-state-step"><div class="empty-state-step-num">1</div><div class="empty-state-step-text">Click <strong>"Thêm phép đo"</strong></div></div><div class="empty-state-step"><div class="empty-state-step-num">2</div><div class="empty-state-step-text">Chọn loại đo và chất điện ly</div></div><div class="empty-state-step"><div class="empty-state-step-num">3</div><div class="empty-state-step-text">Nhập kết quả η@10, Tafel</div></div></div><button class="empty-state-btn member-only" onclick="openModal(\'modal-electrochem\')"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Bắt đầu</button></div>' + '</td></tr>';

  document.querySelectorAll('.ec-lock-btn').forEach(btn => {
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  });
}
