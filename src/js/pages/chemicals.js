/**
 * pages/chemicals.js
 * Render Chemicals (Hoá chất) — danh sách hoá chất với grouping + collapse
 *
 * Phạm vi Phần 5a: chỉ render + helpers (toggleChemGroup, restoreChemGroups).
 * Save/edit/delete/image/addChem/searchChem/selectChem vẫn ở main.js, sẽ tách sau.
 *
 * Phụ thuộc:
 *  - cache qua window.cache
 *  - escapeHtml, vals, fuzzy, formatChemical từ utils/format.js
 *  - isAdmin qua window.isAdmin (hoặc window.currentAuth?.isAdmin)
 *
 * Đặc trưng renderChemicals:
 *  - Group rows theo r.group (key của cache.groups)
 *  - Mỗi group có row header collapsible (chevron + count + admin actions)
 *  - Empty group "Chưa phân nhóm" gom các chemicals chưa gán group
 *  - sessionStorage 'chemGroups' lưu trạng thái collapse
 */

import { vals, fuzzy, formatChemical } from '../utils/format.js'
import { applyTableSort, initTableSort } from '../services/table-sort.js'

// ── toggleChemGroup: collapse/expand 1 group ──────────────
// Lưu trạng thái vào sessionStorage để giữ qua F5
export function toggleChemGroup(gid) {
  const rows = document.querySelectorAll('.' + gid + '-row');
  const chevron = document.getElementById(gid + '-chevron');
  const header = document.getElementById(gid + '-header');
  const isCollapsed = header && header.dataset.collapsed === 'true';

  rows.forEach(r => { r.style.display = isCollapsed ? '' : 'none'; });
  if (chevron) chevron.style.transform = isCollapsed ? '' : 'rotate(-90deg)';
  if (header) header.dataset.collapsed = isCollapsed ? 'false' : 'true';

  try {
    const saved = JSON.parse(sessionStorage.getItem('chemGroups') || '{}');
    saved[gid] = !isCollapsed;
    sessionStorage.setItem('chemGroups', JSON.stringify(saved));
  } catch (e) {}
}

// ── restoreChemGroups: phục hồi collapse state sau khi render ──
function restoreChemGroups() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('chemGroups') || '{}');
    Object.keys(saved).forEach(gid => {
      if (saved[gid]) {
        const rows = document.querySelectorAll('.' + gid + '-row');
        const chevron = document.getElementById(gid + '-chevron');
        const header = document.getElementById(gid + '-header');
        rows.forEach(r => r.style.display = 'none');
        if (chevron) chevron.style.transform = 'rotate(-90deg)';
        if (header) header.dataset.collapsed = 'true';
      }
    });
  } catch (e) {}
}

// ───────────────────────────────────────────────────────────
// Render Chemicals
// ───────────────────────────────────────────────────────────
export function renderChemicals() {
  const cache = window.cache;
  if (!cache) return;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);

  const sf  = (document.getElementById('chem-status-filter') || {}).value || '';
  const cs1 = document.getElementById('filter-cs1') && document.getElementById('filter-cs1').checked;
  const cs2 = document.getElementById('filter-cs2') && document.getElementById('filter-cs2').checked;
  const q   = (document.getElementById('chem-search') || {}).value || '';

  let rows = vals(cache.chemicals).sort((a, b) => a.name.localeCompare(b.name));

  // Filter theo cơ sở (CS1/CS2/cả 2)
  if (cs1 || cs2) {
    rows = rows.filter(r =>
      (cs1 && cs2 && r.location === 'Cả 2 cơ sở') ||
      (cs1 && !cs2 && (r.location === 'Cơ sở 1' || r.location === 'Cả 2 cơ sở')) ||
      (cs2 && !cs1 && (r.location === 'Cơ sở 2' || r.location === 'Cả 2 cơ sở'))
    );
  }

  // Filter theo search query
  if (q) rows = rows.filter(r => [r.name, r.formula, r.cas, r.vendor].some(v => fuzzy(v || '', q)));

  // Filter theo status
  if (sf === 'low') rows = rows.filter(r => r.stock <= r.alert);
  if (sf === 'ok')  rows = rows.filter(r => r.stock > r.alert);

  // Apply table sort
  initTableSort('chemicals-tbody', renderChemicals);
  rows = applyTableSort('chemicals-tbody', rows, (a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

  const tbody = document.getElementById('chemicals-tbody');
  if (!tbody) return;

  // Build groupLabels map từ cache.groups
  const groupLabels = {};
  vals(cache.groups).forEach(g => {
    groupLabels[g._key] = g.name;
  });

  // Group rows: r.group hợp lệ → vào group đó; không thì vào ''
  const groups = {};
  rows.forEach(r => {
    const g = r.group || '';
    const validKey = groupLabels[g] ? g : '';
    if (!groups[validKey]) groups[validKey] = [];
    groups[validKey].push(r);
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--teal);padding:24px">Chưa có dữ liệu</td></tr>';
    return;
  }

  // Order: theo cache.groups.order, cuối cùng là '' (chưa phân nhóm)
  let html = '';
  const groupOrder = vals(cache.groups)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(g => g._key)
    .concat(['']);

  groupOrder.forEach(gKey => {
    const gRows = groups[gKey];
    if (!gRows || !gRows.length) return;

    // Số thứ tự nhóm — index trong groupOrder (1-based) hoặc '?' nếu chưa phân nhóm
    const groupIdx = vals(cache.groups)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .findIndex(g => g._key === gKey);
    const numBadge = gKey && groupIdx >= 0
      ? '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--teal);color:white;font-size:10px;font-weight:700;flex-shrink:0">' + (groupIdx + 1) + '</span>'
      : '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#94a3b8;color:white;font-size:12px;font-weight:700;flex-shrink:0">?</span>';
    const label = (groupLabels[gKey] || 'Chưa phân nhóm');
    const gid = 'chem-group-' + (gKey || 'other');

    // Group header row (collapsible)
    html += '<tr class="chem-group-header" id="' + gid + '-header" onclick="toggleChemGroup(\'' + gid + '\')" data-collapsed="false">' +
      '<td colspan="12" style="background:var(--surface-alt,var(--teal-light));padding:10px 14px;font-size:12px;font-weight:600;color:var(--text-2);cursor:pointer;user-select:none;border-bottom:1px solid var(--border)">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<svg id="' + gid + '-chevron" width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" style="transition:transform 0.2s;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>' +
          numBadge +
          '<span onclick="startEditGroup(\'' + gKey + '\', this)" style="cursor:' + (isAdmin ? 'text' : 'default') + '" title="' + (isAdmin ? 'Click để đổi tên' : '') + '">' + label + '</span>' +
          (isAdmin && gKey
            ? '<button onclick="event.stopPropagation();deleteGroup(\'' + gKey + '\')" style="margin-left:8px;width:18px;height:18px;border-radius:50%;background:#f87171;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 0.15s" onmouseover="this.style.background=\'#dc2626\'" onmouseout="this.style.background=\'#f87171\'" title="Xóa nhóm"><svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg></button>'
            : ''
          ) +
          '<span style="margin-left:auto;font-weight:400;color:var(--teal);padding-right:8px">' + gRows.length + ' chất</span>' +
        '</div>' +
      '</td>' +
    '</tr>';

    // Chemical rows trong group
    gRows.forEach(function(r) {
      const low = r.stock <= r.alert;
      // Cell ngày tạo: hỗ trợ nhiều format (ISO, "DD/MM, HH:MM:SS", ...)
      const createdAtCell = r.createdAt ? (() => {
        try {
          const s = r.createdAt;
          if (s.includes('T')) {
            const d = new Date(s);
            return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
              '<br>' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          }
          if (s.includes(',')) {
            const parts = s.split(', ');
            const p0 = parts[0];
            const p1 = parts[1] || '';
            return (p0.includes(':') ? p1 + '<br>' + p0 : p0 + '<br>' + p1);
          }
          return s;
        } catch (e) { return r.createdAt; }
      })() : '—';

      html += '<tr class="clickable-row ' + gid + '-row" onclick="editChemical(\'' + r._key + '\')" title="Nhấn để sửa">' +
        '<td><strong>' + r.name + '</strong></td>' +
        '<td class="mono" style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + formatChemical(r.formula) + '</td>' +
        '<td style="text-align:center" onclick="event.stopPropagation()">' +
          '<div id="img-box-' + r._key + '" onclick="showChemicalImage(\'' + r._key + '\')" ' +
            'ondragover="event.preventDefault();event.stopPropagation();this.style.borderColor=\'var(--blue2)\';this.style.background=\'var(--blue-light)\';this.style.transform=\'scale(3)\';this.style.boxShadow=\'0 0 0 2px rgba(37,99,235,0.15)\';this.style.zIndex=\'10\'" ' +
            'ondragleave="this.style.borderColor=\'' + (r.image ? 'transparent' : 'var(--teal-3)') + '\';this.style.background=\'' + (r.image ? 'transparent' : 'var(--teal-light)') + '\';this.style.transform=\'\';this.style.boxShadow=\'\';this.style.zIndex=\'\'" ' +
            'ondrop="event.preventDefault();event.stopPropagation();this.style.transform=\'\';this.style.boxShadow=\'\';this.style.zIndex=\'\';this.style.borderColor=\'' + (r.image ? 'transparent' : 'var(--teal-3)') + '\';this.style.background=\'' + (r.image ? 'transparent' : 'var(--teal-light)') + '\';var f=event.dataTransfer.files[0];dropImageToCell(\'chemicals\',\'' + r._key + '\',f)" ' +
            'style="width:44px;height:44px;border:2px dashed ' + (r.image ? 'transparent' : 'var(--teal-3)') + ';border-radius:var(--radius);display:flex;align-items:center;justify-content:center;margin:auto;cursor:pointer;overflow:visible;background:' + (r.image ? 'transparent' : 'var(--teal-light)') + ';transition:all 0.18s cubic-bezier(.4,0,.2,1);position:relative;z-index:1">' +
            (r.image
              ? '<img src="' + r.image + '" style="width:100%;height:100%;object-fit:cover;border-radius:5px;pointer-events:none">'
              : '<svg width="16" height="16" viewBox="0 0 24 24" stroke="var(--teal)" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
            ) +
          '</div>' +
        '</td>' +
        '<td class="mono" style="text-align:center">' + r.mw + '</td>' +
        '<td class="mono" style="text-align:center">' + r.purity + '%</td>' +
        '<td class="mono" style="text-align:center">' + (r.cas || '—') + '</td>' +
        '<td style="text-align:center">' + (r.location || '—') + '</td>' +
        '<td class="mono" style="text-align:center;color:' + (low ? 'var(--danger)' : '') + '">' + r.stock + (r.unit || 'g') + '</td>' +
        '<td class="mono" style="text-align:center">' + (r.qty || 1) + ' bình</td>' +
        '<td class="mono" style="text-align:center;font-size:12px">' + createdAtCell + '</td>' +
        '<td style="text-align:center">' + (low
          ? '<span class="badge badge-danger" style="font-size:13px;padding:3px 14px;border-radius:14px">⚠ Sắp hết</span>'
          : '<span class="badge badge-success" style="font-size:13px;padding:3px 14px;border-radius:14px">Đủ</span>'
        ) + '</td>' +
        '<td onclick="event.stopPropagation()" style="white-space:nowrap">' +
          '<button class="qr-btn" title="In nhãn QR" onclick="showLabelChoiceForChem(\'' + r._key + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="2" height="2"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/></svg></button>' +
          '<button class="del-btn chem-admin-btn" style="display:none" onclick="delItem(\'chemicals\',\'' + r._key + '\',\'' + r.name + '\')"><svg class="w-4 h-4 fill-none stroke-white" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke-linejoin="round" stroke-linecap="round"/></svg></button>' +
        '</td>' +
      '</tr>';
    });
  });

  tbody.innerHTML = html;
  restoreChemGroups();

  // Toggle visibility nút xoá hoá chất theo role admin
  document.querySelectorAll('.chem-admin-btn').forEach(function(btn) {
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  });
}
