/**
 * pages/equipment.js
 * Render Equipment (Thiết bị) — danh sách thiết bị với grouping
 *
 * Phạm vi Phần 5c: chỉ render + helpers (toggleEqGroup, restoreEqGroups, makeEqRow).
 * Save/edit/image/preview vẫn ở main.js, sẽ tách sau.
 *
 * Phụ thuộc:
 *  - cache qua window.cache (cho equipment data)
 *  - cacheEqGroups qua window.cacheEqGroups (eq groups — biến module riêng ở main.js)
 *  - vals, fuzzy từ utils/format.js
 *  - isAdmin qua window.isAdmin
 *
 * Đặc trưng:
 *  - Group rows theo r.group (key của cacheEqGroups)
 *  - Mỗi group có header collapsible (giống chemicals)
 *  - sessionStorage 'eqGroups' lưu trạng thái collapse
 *  - Drag & drop ảnh vào ô ảnh để upload (gọi window.dropImageToCell)
 *  - Edit chỉ admin (clickable-row + click cell ảnh)
 */

import { vals, fuzzy } from '../utils/format.js'
import { applyTableSort, initTableSort } from '../services/table-sort.js'

// ── toggleEqGroup: collapse/expand 1 group ────────────────
export function toggleEqGroup(eqGid) {
  const eqKey = eqGid.replace('eq-grp-', '') || 'other';
  const eqRows = document.querySelectorAll('.eq-row-' + eqKey);
  const eqChevron = document.getElementById(eqGid + '-chevron');
  const eqHeader = document.getElementById(eqGid + '-header');
  const eqCollapsed = eqHeader && eqHeader.dataset.collapsed === 'true';

  eqRows.forEach(row => { row.style.display = eqCollapsed ? '' : 'none'; });
  if (eqChevron) eqChevron.style.transform = eqCollapsed ? '' : 'rotate(-90deg)';
  if (eqHeader) eqHeader.dataset.collapsed = eqCollapsed ? 'false' : 'true';

  try {
    const eqSaved = JSON.parse(sessionStorage.getItem('eqGroups') || '{}');
    eqSaved[eqGid] = !eqCollapsed;
    sessionStorage.setItem('eqGroups', JSON.stringify(eqSaved));
  } catch (e) {}
}

// ── restoreEqGroups: phục hồi collapse state sau render ───
function restoreEqGroups() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('eqGroups') || '{}');
    Object.keys(saved).forEach(gid => {
      if (saved[gid]) {
        const eqKey = gid.replace('eq-grp-', '') || 'other';
        const rows = document.querySelectorAll('.eq-row-' + eqKey);
        const chevron = document.getElementById(gid + '-chevron');
        const header = document.getElementById(gid + '-header');
        rows.forEach(r => r.style.display = 'none');
        if (chevron) chevron.style.transform = 'rotate(-90deg)';
        if (header) header.dataset.collapsed = 'true';
      }
    });
  } catch (e) {}
}

// ── makeEqRow: render 1 row equipment ────────────────────
function makeEqRow(r) {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const sc = {
    'Đang sử dụng': 'badge-success',
    'Đang sửa': 'badge-warn',
    'Ngưng sử dụng': 'badge-danger'
  };
  const imgBox = r.image
    ? '<img src="' + r.image + '" style="width:100%;height:100%;object-fit:cover;border-radius:5px;pointer-events:none">'
    : '<svg width="16" height="16" viewBox="0 0 24 24" stroke="var(--teal)" fill="none" stroke-width="2" stroke-linecap="round" style="pointer-events:none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  const borderC = r.image ? 'transparent' : 'var(--teal-3)';
  const bgC = r.image ? 'transparent' : 'var(--teal-light)';

  // Format ngày: hỗ trợ ISO + plain string
  const dateStr = r.date ? (() => {
    try {
      const s = r.date;
      if (s.includes('T')) {
        const d = new Date(s);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
          '<br>' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      return s;
    } catch (e) { return r.date; }
  })() : '—';

  return '<tr class="eq-row-' + (r.group || 'other') + ' clickable-row" onclick="if(window.isAdmin)editEquipment(\'' + r._key + '\')" title="' + (isAdmin ? 'Nhấn để sửa' : '') + '">' +
    '<td><strong>' + (r.name || '') + '</strong></td>' +
    '<td class="mono" style="font-size:12px">' + (r.model || '—') + '<br><span style="color:var(--teal)">' + (r.serial || '—') + '</span></td>' +
    '<td class="mono">' + (r.vendor || '—') + '</td>' +
    '<td style="text-align:center" onclick="event.stopPropagation()">' +
      '<div onclick="showEquipmentImage(\'' + r._key + '\')" ' +
        'ondrop="event.preventDefault();event.stopPropagation();this.style.transform=\'\';this.style.boxShadow=\'\';this.style.zIndex=\'\';this.style.borderColor=\'' + borderC + '\';this.style.background=\'' + bgC + '\';dropImageToCell(\'equipment\',\'' + r._key + '\',event.dataTransfer.files[0])" ' +
        'ondragover="event.preventDefault();event.stopPropagation();this.style.borderColor=\'var(--blue2)\';this.style.background=\'var(--blue-light)\';this.style.transform=\'scale(3)\';this.style.boxShadow=\'0 0 0 2px rgba(37,99,235,0.15)\';this.style.zIndex=\'10\'" ' +
        'ondragleave="this.style.borderColor=\'' + borderC + '\';this.style.background=\'' + bgC + '\';this.style.transform=\'\';this.style.boxShadow=\'\';this.style.zIndex=\'\'" ' +
        'style="width:44px;height:44px;border:2px dashed ' + borderC + ';border-radius:8px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:' + bgC + ';transition:all 0.18s;margin:0 auto;position:relative;z-index:1">' +
        imgBox +
      '</div>' +
    '</td>' +
    '<td>' + (r.location || '—') + '</td>' +
    '<td class="mono">' + (r.qty || 1) + ' cái</td>' +
    '<td class="mono" style="font-size:12px;text-align:center">' + dateStr + '</td>' +
    '<td style="text-align:center"><span class="badge ' + (sc[r.status] || 'badge-gray') + '">' + (r.status || '—') + '</span></td>' +
    '<td class="action-cell" onclick="event.stopPropagation()" style="text-align:left;white-space:nowrap">' +
      '<button class="qr-btn" title="In nhãn QR" onclick="showLabelChoiceForEquip(\'' + r._key + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="2" height="2"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/></svg></button>' +
      '<button class="del-btn eq-admin-btn" style="display:none" onclick="delItem(\'equipment\',\'' + r._key + '\',\'' + (r.name || '').replace(/'/g, "\\'") + '\')"><svg class="w-4 h-4 fill-none stroke-white" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke-linejoin="round" stroke-linecap="round"/></svg></button>' +
    '</td>' +
  '</tr>';
}

// ───────────────────────────────────────────────────────────
// Render Equipment
// ───────────────────────────────────────────────────────────
export function renderEquipment() {
  const cache = window.cache;
  if (!cache) return;
  const cacheEqGroups = window.cacheEqGroups || {};
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);

  const cs1 = document.getElementById('eq-filter-cs1') && document.getElementById('eq-filter-cs1').checked;
  const cs2 = document.getElementById('eq-filter-cs2') && document.getElementById('eq-filter-cs2').checked;
  const q   = (document.getElementById('equipment-search') || {}).value || '';
  const sf  = (document.getElementById('equipment-status-filter') || {}).value || '';

  let rows = vals(cache.equipment || {}).filter(r =>
    (!q || [r.name, r.model, r.vendor, r.serial].some(v => fuzzy(v || '', q))) &&
    (!sf || r.status === sf) &&
    (!(cs1 || cs2) ||
      (cs1 && cs2 && r.location === 'Cả 2 cơ sở') ||
      (cs1 && !cs2 && (r.location === 'Cơ sở 1' || r.location === 'Cả 2 cơ sở')) ||
      (cs2 && !cs1 && (r.location === 'Cơ sở 2' || r.location === 'Cả 2 cơ sở'))
    )
  );

  // Apply table sort
  initTableSort('equipment-tbody', renderEquipment);
  rows = applyTableSort('equipment-tbody', rows, (a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

  const equipTbody = document.getElementById('equipment-tbody');
  if (!equipTbody) return;

  if (!rows.length) {
    equipTbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">' +
      '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' +
      '<div class="empty-state-text">Chưa có thiết bị nào</div>' +
      '<div class="empty-state-sub">Chưa có dữ liệu</div>' +
      (isAdmin ? '<button class="empty-state-btn" onclick="openModal(\'modal-equipment\')"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Thêm thiết bị</button>' : '') +
    '</div></td></tr>';
    return;
  }

  // Group by eq_groups
  const eqGL = {};
  vals(cacheEqGroups).forEach(g => { eqGL[g._key] = g.name; });
  const eqGrps = {};
  rows.forEach(r => {
    const g = eqGL[r.group] ? r.group : '';
    if (!eqGrps[g]) eqGrps[g] = [];
    eqGrps[g].push(r);
  });

  const eqOrder = vals(cacheEqGroups)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(g => g._key)
    .concat(['']);

  let eqHtml = '';
  eqOrder.forEach((gKey, gi) => {
    const gRows = eqGrps[gKey];
    if (!gRows || !gRows.length) return;

    const label = eqGL[gKey] || 'Chưa phân nhóm';
    const gid = 'eq-grp-' + (gKey || 'other');
    const badge = gKey
      ? '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--teal);color:white;font-size:10px;font-weight:700;flex-shrink:0">' + (gi + 1) + '</span>'
      : '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#94a3b8;color:white;font-size:12px;font-weight:700;flex-shrink:0">?</span>';
    const delBtn = (isAdmin && gKey)
      ? '<button onclick="event.stopPropagation();delEqGroup(\'' + gKey + '\')" style="margin-left:8px;width:18px;height:18px;border-radius:50%;background:#f87171;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background 0.15s" onmouseover="this.style.background=\'#dc2626\'" onmouseout="this.style.background=\'#f87171\'"><svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg></button>'
      : '';

    eqHtml += '<tr id="' + gid + '-header" onclick="toggleEqGroup(\'' + gid + '\')" data-collapsed="false" style="background:var(--surface-alt,var(--teal-light));cursor:pointer;user-select:none">' +
      '<td colspan="9" style="background:var(--surface-alt,var(--teal-light));padding:10px 14px;font-size:12px;font-weight:600;color:var(--text-2);border-bottom:1px solid var(--border)">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<svg id="' + gid + '-chevron" width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" style="transition:transform 0.2s;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>' +
          badge + '<span>' + label + '</span>' + delBtn +
          '<span style="margin-left:auto;font-weight:400;color:var(--teal);padding-right:8px">' + gRows.length + ' thiết bị</span>' +
        '</div>' +
      '</td>' +
    '</tr>';

    gRows.forEach(r => { eqHtml += makeEqRow(r); });
  });

  equipTbody.innerHTML = eqHtml;
  document.querySelectorAll('.eq-admin-btn').forEach(btn => {
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  });
  restoreEqGroups();
}
