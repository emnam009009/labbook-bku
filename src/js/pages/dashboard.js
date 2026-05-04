/**
 * pages/dashboard.js
 * v3 — Layout 3 hàng: KPI + Hàng 1 (booking 2col / members / chemicals)
 *                     + Hàng 2 (chart cột 6 tháng / pie / top members)
 *                     + Hàng 3 (recent experiments full width)
 *
 * Tận dụng window.cache.{hydro, electrode, electrochem, ink, bookings, members, equipment, chemicals}
 * Theme-reactive: re-render khi đổi theme (event 'themechange')
 */

import { vals, escapeHtml, formatChemical } from '../utils/format.js'

// ───── Inject CSS cho custom scrollbar (1 lần) ─────
(function injectDashStyles() {
  if (document.getElementById('dash-scroll-style')) return;
  const style = document.createElement('style');
  style.id = 'dash-scroll-style';
  style.textContent = `
    .dash-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(148,163,184,0.4) transparent;
    }
    .dash-scroll::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .dash-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    .dash-scroll::-webkit-scrollbar-thumb {
      background: rgba(148,163,184,0.35);
      border-radius: 3px;
      transition: background 0.15s;
    }
    .dash-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(100,116,139,0.55);
    }
    /* Khi không hover, scrollbar mờ; hover vào card thì hiện rõ hơn */
    .stat-card:hover .dash-scroll::-webkit-scrollbar-thumb {
      background: rgba(100,116,139,0.5);
    }
    /* Member row hover */
    .dash-member-row:hover {
      background: rgba(13,148,136,0.06);
    }
    .dash-member-row:hover [style*="border-radius:50%"][style*="linear-gradient"] {
      transform: scale(1.05);
      transition: transform 0.15s;
    }
    /* Member popover */
    .dash-member-popover {
      z-index: 99999;
      background: #ffffff !important;
      opacity: 1 !important;
      backdrop-filter: none;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
      padding: 18px;
      width: 280px;
      isolation: isolate;
      animation: dash-popover-in 0.18s ease-out;
      pointer-events: auto;
    }
    @keyframes dash-popover-in {
      from { opacity: 0; transform: translateY(-4px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .dash-member-popover .pop-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: none;
      background: #f1f5f9;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      transition: background 0.15s;
    }
    .dash-member-popover .pop-close:hover {
      background: #e2e8f0;
      color: #0f172a;
    }
    .dash-member-popover .pop-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 6px 0;
      border-top: 1px solid #f1f5f9;
      font-size: 12.5px;
    }
    .dash-member-popover .pop-row:first-of-type {
      border-top: none;
    }
    .dash-member-popover .pop-label {
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      width: 88px;
      flex-shrink: 0;
      padding-top: 1px;
    }
    .dash-member-popover .pop-value {
      color: #0f172a;
      flex: 1;
      word-break: break-word;
    }
  `;
  document.head.appendChild(style);
})();


// Helper: đọc CSS var hiện tại từ :root
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Avatar gradient từ tên (theme-aware: pair đầu tiên dùng teal hiện tại)
function avatarColors(name) {
  const teal = cssVar('--teal') || '#0d9488';
  const teal3 = cssVar('--teal-3') || '#2dd4bf';
  const colors = [
    [teal, teal3],
    ['#6366f1', '#8b5cf6'],
    ['#f59e0b', '#fbbf24'],
    ['#10b981', '#34d399'],
    ['#ef4444', '#f87171'],
    ['#ec4899', '#f472b6']
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return colors[hash % colors.length];
}

function avatarInitial(name) {
  const tokens = String(name || '').trim().split(/\s+/).filter(Boolean);
  return tokens.length ? tokens[tokens.length - 1].charAt(0).toUpperCase() : '?';
}

function avatarHTML(name, size = 36) {
  const [c1, c2] = avatarColors(name || '');
  const init = avatarInitial(name);
  const fontSize = Math.round(size * 0.34);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,${c1},${c2});color:white;font-size:${fontSize}px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 6px ${c1}55">${escapeHtml(init)}</div>`;
}

// ───── Date helpers ─────
function parseDateAny(v) {
  if (!v) return null;
  // ISO YYYY-MM-DD
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  // dd/mm/yyyy
  if (typeof v === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(v)) {
    const [dd, mm, yyyy] = v.split('/');
    const d = new Date(+yyyy, +mm - 1, +dd);
    return isNaN(d) ? null : d;
  }
  // number (timestamp) or Date
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function recordDate(r) {
  return parseDateAny(r.date) || parseDateAny(r.createdAt);
}

function countSinceDays(arr, days) {
  const cutoff = Date.now() - days * 86400000;
  return arr.filter(x => {
    const d = recordDate(x);
    return d && d.getTime() >= cutoff;
  }).length;
}

function trendHtml(curr, prev, suffix) {
  let pct;
  if (prev === 0) pct = curr > 0 ? 100 : 0;
  else pct = Math.round(((curr - prev) / prev) * 100 * 10) / 10;
  const up = pct >= 0;
  const arrow = up ? 'M7 14l5-5 5 5' : 'M7 10l5 5 5-5';
  const color = up ? '#10b981' : '#ef4444';
  const sign = up ? '+' : '';
  return `<span style="color:${color};display:inline-flex;align-items:center;gap:3px;font-weight:600">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="${arrow}"/></svg>
    ${sign}${pct}%
  </span> <span style="color:#94a3b8;font-weight:500">${suffix}</span>`;
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ───── KPI cards (4 stat cards) ─────
function renderKPI(h, e, ec, members) {
  const total = h.length + e.length + ec.length;
  setEl('s-total', total);
  setEl('s-electrode', e.length);
  setEl('s-electrochem', ec.length);
  setEl('s-members', members);

  const all = [...h, ...e, ...ec];
  const t30 = countSinceDays(all, 30);
  const t60 = countSinceDays(all, 60);
  setHTML('trend-total', trendHtml(t30, t60 - t30, 'so với tháng trước'));

  const ed7 = countSinceDays(e, 7);
  const ed14 = countSinceDays(e, 14);
  setHTML('trend-electrode', trendHtml(ed7, ed14 - ed7, 'tuần này'));

  const ec7 = countSinceDays(ec, 7);
  const ec14 = countSinceDays(ec, 14);
  setHTML('trend-electrochem', trendHtml(ec7, ec14 - ec7, 'tuần này'));

  setHTML('trend-members', `<span style="color:#64748b;font-weight:500">Đang hoạt động</span>`);
}

// ───── HÀNG 1 — Card 1: Lịch booking thiết bị (rộng 2 cột) ─────
const STATUS_PILL = {
  pending:   { bg: 'rgba(245,158,11,0.15)',  fg: '#b45309', label: 'Chờ duyệt' },
  approved:  { bg: 'rgba(16,185,129,0.15)',  fg: '#047857', label: 'Đã duyệt' },
  'in-use':  { bg: 'rgba(59,130,246,0.15)',  fg: '#1e40af', label: 'Đang dùng' },
  completed: { bg: 'rgba(100,116,139,0.15)', fg: '#475569', label: 'Hoàn thành' },
  rejected:  { bg: 'rgba(239,68,68,0.15)',   fg: '#b91c1c', label: 'Từ chối' },
  cancelled: { bg: 'rgba(148,163,184,0.15)', fg: '#64748b', label: 'Đã hủy' }
};

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // Monday = 1, Sunday = 0 → đẩy về Monday
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function fmtMonthYear(d) {
  return `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
}

// State cho week navigation (lưu offset tuần so với hiện tại)
let _bookingWeekOffset = 0;
let _bookingSelectedDay = null; // Date object

// Số ngày hiển thị trên chart "Thí nghiệm theo tháng/ngày"
// Default 7 ngày (kết thúc hôm nay), wheel để zoom: min 7, max 180
let _chartDays = 7;

// ─── Chart.js lazy loader (~80KB, chỉ load khi user vào dashboard lần đầu) ───
let _chartJsPromise = null
function loadChartJs() {
  if (!_chartJsPromise) {
    _chartJsPromise = import('chart.js/auto').then(m => m.default)
  }
  return _chartJsPromise
}

// Instance Chart.js của HÀNG 2 — destroy khi re-render để tránh memory leak
let _monthlyChartInstance = null
let _monthlyChartFirstRender = true  // true cho lần render đầu (F5), sau đó set false
let _distributionChartInstance = null

function renderBookingWeek(bookings, members) {
  const card = document.getElementById('dash-booking-week');
  if (!card) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekStart = startOfWeek(today);
  weekStart.setDate(weekStart.getDate() + _bookingWeekOffset * 7);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  // Selected day: default = hôm nay nếu trong tuần, không thì ngày đầu tuần
  let selected = _bookingSelectedDay;
  if (!selected || selected < days[0] || selected > days[6]) {
    const todayInWeek = days.find(d => d.getTime() === today.getTime());
    selected = todayInWeek || days[0];
    _bookingSelectedDay = selected;
  }

  // Member map để lấy tên nếu booking chỉ có userId
  const memberMap = {};
  vals(members).forEach(m => {
    if (m.uid) memberMap[m.uid] = m;
    if (m.email) memberMap[m.email] = m;
  });

  // Filter booking của ngày được chọn, hiển thị tất cả status (trừ rejected/cancelled)
  const dayBookings = vals(bookings).filter(b => {
    if (!b.date) return false;
    const d = parseDateAny(b.date);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    if (d.getTime() !== selected.getTime()) return false;
    if (b.status === 'rejected' || b.status === 'cancelled') return false;
    return true;
  }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  const teal = cssVar('--teal') || '#0d9488';
  const tealLight = cssVar('--teal-light') || '#f0fdfa';

  const dayStripHTML = days.map(d => {
    const isSelected = d.getTime() === selected.getTime();
    const isToday = d.getTime() === today.getTime();
    const dayLabel = dayNames[d.getDay()];
    const bg = isSelected ? tealLight : 'transparent';
    const fg = isSelected ? teal : '#0f172a';
    const fgLabel = isSelected ? teal : '#94a3b8';
    const ring = isToday && !isSelected ? `box-shadow:inset 0 0 0 1.5px ${teal}` : '';
    return `<div onclick="window._dashSelectBookingDay(${d.getTime()})" style="cursor:pointer;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 0;border-radius:8px;background:${bg};${ring};transition:all 0.15s">
      <div style="font-size:10px;color:${fgLabel};text-transform:uppercase;font-weight:500">${dayLabel}</div>
      <div style="font-size:14px;font-weight:600;color:${fg}">${String(d.getDate()).padStart(2, '0')}</div>
    </div>`;
  }).join('');

  const bookingListHTML = dayBookings.length ? dayBookings.map(b => {
    const userName = b.userName || memberMap[b.userId]?.name || memberMap[b.userEmail]?.name || b.userEmail || 'Không rõ';
    const eqName = b.equipmentName || b.equipment || '—';
    const time = `${b.startTime || '??:??'}–${b.endTime || '??:??'}`;
    const purpose = b.purpose ? ` · ${escapeHtml(String(b.purpose).slice(0, 40))}` : '';
    const pill = STATUS_PILL[b.status] || { bg: '#f1f5f9', fg: '#64748b', label: b.status || '—' };
    const [c1, c2] = avatarColors(userName);
    const init = avatarInitial(userName);

    const bookingKey = b._key || '';
    return `<div onclick="window._dashGoToBooking('${bookingKey}')" style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:0.5px solid var(--border);cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''" title="Xem chi tiết yêu cầu đăng ký">
      <div style="font-size:11px;color:#64748b;font-family:'JetBrains Mono',monospace;min-width:80px;padding-top:2px;font-weight:500">${time}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#0f172a;line-height:1.3">${escapeHtml(eqName)}</div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:4px">
          <div style="width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,${c1},${c2});color:white;font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0">${escapeHtml(init)}</div>
          <span style="font-size:11.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(userName)}${purpose}</span>
        </div>
      </div>
      <span style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:600;background:${pill.bg};color:${pill.fg};white-space:nowrap;flex-shrink:0">${escapeHtml(pill.label)}</span>
    </div>`;
  }).join('') : `<div style="text-align:center;color:#94a3b8;font-size:12.5px;padding:24px 0">Không có lịch đăng ký ngày này</div>`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em">Lịch đăng ký thiết bị</h3>
      <div style="display:flex;gap:4px;align-items:center">
        <button onclick="window._dashNavBookingWeek(-1)" style="width:24px;height:24px;border-radius:50%;border:0.5px solid var(--border);background:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#64748b" title="Tuần trước">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span style="font-size:12.5px;font-weight:600;color:#0f172a;min-width:140px;text-align:center">${fmtMonthYear(weekStart)}</span>
        <button onclick="window._dashNavBookingWeek(1)" style="width:24px;height:24px;border-radius:50%;border:0.5px solid var(--border);background:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#64748b" title="Tuần sau">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </div>
    <div style="display:flex;gap:3px;margin-bottom:12px">${dayStripHTML}</div>
    <div class="dash-scroll" style="max-height:200px;overflow-y:auto;padding-right:4px">${bookingListHTML}</div>
  `;
}

// ───── HÀNG 1 — Card 2: Danh sách thành viên ─────
// ───── KPI #4 NEW — Card thành viên lab (thay cho stat card cũ) ─────
function renderMembersKPI(members) {
  const card = document.getElementById('dash-members-kpi');
  if (!card) return;

  const entries = Object.entries(members || {});
  const total = entries.length;

  // Limit hiển thị 4 người đầu trong KPI card (compact)
  const display = entries.slice(0, 4);

  const rolesShort = {
    'Sinh viên đại học': 'SV ĐH',
    'Học viên cao học': 'HV CH',
    'NCS': 'NCS',
    'Nghiên cứu viên': 'NCV',
    'Giảng viên': 'GV'
  };

  const rowsHTML = display.length ? display.map(([uid, m], idx) => {
    const name = m.name || 'Không rõ';
    const role = rolesShort[m.role] || m.role || '';
    const subRole = m.year ? ` · ${m.year}` : (m.program ? ` · ${m.program}` : '');
    const meta = role ? `${role}${subRole}` : '—';
    // Match member ↔ user account (fallback nhiều cách)
    const cache = window.cache || {};
    const users = cache._users || {};
    const presence = cache.presence || {};
    let matchUid = null;
    // 1. Match theo email (case-insensitive, trim)
    if (m.email) {
      const emailLower = m.email.trim().toLowerCase();
      matchUid = Object.keys(users).find(u =>
        (users[u]?.email || '').trim().toLowerCase() === emailLower
      );
    }
    // 2. Fallback: match theo name (case-insensitive, trim)
    if (!matchUid && m.name) {
      const nameLower = m.name.trim().toLowerCase();
      matchUid = Object.keys(users).find(u => {
        const uName = (users[u]?.name || users[u]?.displayName || '').trim().toLowerCase();
        return uName && uName === nameLower;
      });
    }
    // 3. Fallback: nếu member có flag isSuperAdmin hoặc name chứa "admin" → match với superAdminUid
    if (!matchUid && window.__superAdminUid) {
      const superEmail = users[window.__superAdminUid]?.email || '';
      // Nếu member.email khớp với super admin email (hoặc cả 2 đều rỗng và name khớp)
      if (m.email && m.email.trim().toLowerCase() === superEmail.toLowerCase()) {
        matchUid = window.__superAdminUid;
      }
    }
    const isOnline = matchUid && presence[matchUid]?.online === true;
    const dotColor = isOnline ? '#10b981' : '#cbd5e1';

    return `<div class="dash-member-row" data-uid="${escapeHtml(uid)}" style="display:flex;align-items:center;gap:11px;padding:7px 0;cursor:pointer;border-radius:10px;transition:background 0.12s" onclick="window._dashShowMemberPopover('${escapeHtml(uid)}', this)">
      ${avatarHTML(name, 38)}
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:700;color:#0f172a;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(meta)}</div>
      </div>
      <span style="width:9px;height:9px;border-radius:50%;background:${dotColor};flex-shrink:0;box-shadow:0 0 0 2px ${isOnline ? 'rgba(16,185,129,0.18)' : 'rgba(203,213,225,0.4)'}" title="${isOnline ? 'Online' : 'Offline'}"></span>
    </div>`;
  }).join('') : `<div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px 0">Chưa có thành viên</div>`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em">Thành viên lab</h3>
      <span style="font-size:11px;color:#64748b;font-weight:500">${total} người</span>
    </div>
    ${rowsHTML}
  `;
}

function renderMembersList(members) {
  const card = document.getElementById('dash-members-list');
  if (!card) return;

  const list = vals(members).slice(0, 6);
  const rolesShort = {
    'Sinh viên đại học': 'SV ĐH',
    'Học viên cao học': 'HV CH',
    'NCS': 'NCS',
    'Nghiên cứu viên': 'NCV',
    'Giảng viên': 'GV'
  };

  const rowsHTML = list.length ? list.map((m, idx) => {
    const name = m.name || 'Không rõ';
    const role = rolesShort[m.role] || m.role || '—';
    const subRole = m.program || m.year ? ` · ${m.year || m.program || ''}` : '';
    // Trạng thái online: giả định 70% online (do chưa có realtime presence)
    // Match member ↔ user account (fallback nhiều cách)
    const cache = window.cache || {};
    const users = cache._users || {};
    const presence = cache.presence || {};
    let matchUid = null;
    // 1. Match theo email (case-insensitive, trim)
    if (m.email) {
      const emailLower = m.email.trim().toLowerCase();
      matchUid = Object.keys(users).find(u =>
        (users[u]?.email || '').trim().toLowerCase() === emailLower
      );
    }
    // 2. Fallback: match theo name (case-insensitive, trim)
    if (!matchUid && m.name) {
      const nameLower = m.name.trim().toLowerCase();
      matchUid = Object.keys(users).find(u => {
        const uName = (users[u]?.name || users[u]?.displayName || '').trim().toLowerCase();
        return uName && uName === nameLower;
      });
    }
    // 3. Fallback: nếu member có flag isSuperAdmin hoặc name chứa "admin" → match với superAdminUid
    if (!matchUid && window.__superAdminUid) {
      const superEmail = users[window.__superAdminUid]?.email || '';
      // Nếu member.email khớp với super admin email (hoặc cả 2 đều rỗng và name khớp)
      if (m.email && m.email.trim().toLowerCase() === superEmail.toLowerCase()) {
        matchUid = window.__superAdminUid;
      }
    }
    const isOnline = matchUid && presence[matchUid]?.online === true;
    const dotColor = isOnline ? '#10b981' : '#cbd5e1';

    return `<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:0.5px solid var(--border)">
      ${avatarHTML(name, 32)}
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:600;color:#0f172a;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</div>
        <div style="font-size:10.5px;color:#64748b;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(role)}${escapeHtml(subRole)}</div>
      </div>
      <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0" title="${isOnline ? 'Online' : 'Offline'}"></span>
    </div>`;
  }).join('') : `<div style="text-align:center;color:#94a3b8;font-size:12px;padding:20px 0">Chưa có thành viên</div>`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em">Thành viên lab</h3>
      <span style="font-size:11px;color:#64748b">${vals(members).length} người</span>
    </div>
    ${rowsHTML}
  `;
}

// ───── HÀNG 1 — Card 3: Tình trạng hóa chất (giữ logic cũ, di chuyển đến đây) ─────
function renderChemStatus(chemicals) {
  const card = document.getElementById('dash-chem-status');
  if (!card) return;

  const themeTeal = cssVar('--teal') || '#0d9488';

  // Phân loại theo ratio = stock / alert
  const classify = (c) => {
    const stock = c.stock || 0;
    const alert = c.alert || 1;
    const ratio = stock / alert;
    if (stock === 0 || ratio <= 0.5) return { level: 'out', color: '#ef4444', icon: '✕', label: 'Hết' };
    if (ratio <= 1) return { level: 'low', color: '#ef4444', icon: '⚠', label: 'Sắp hết' };
    if (ratio <= 3) return { level: 'warn', color: '#f97316', icon: '⚠', label: 'Cần chú ý' };
    if (ratio <= 7.5) return { level: 'ok', color: '#eab308', icon: '✓', label: 'Bình thường' };
    return { level: 'full', color: themeTeal, icon: '✓', label: 'Đầy đủ' };
  };

  const chems = vals(chemicals)
    .filter(c => c && c.name)
    .map(c => ({ ...c, _status: classify(c) }))
    // Sort: ưu tiên hiển thị item cần chú ý trước (out → low → warn → ok → full), trong mỗi nhóm sort theo % asc
    .sort((a, b) => {
      const order = { out: 0, low: 1, warn: 2, ok: 3, full: 4 };
      const diff = order[a._status.level] - order[b._status.level];
      if (diff !== 0) return diff;
      const ratioA = (a.stock || 0) / (a.alert || 1);
      const ratioB = (b.stock || 0) / (b.alert || 1);
      return ratioA - ratioB;
    });

  // Đếm theo trạng thái cho summary chips
  const counts = { out: 0, low: 0, warn: 0, ok: 0, full: 0 };
  chems.forEach(c => counts[c._status.level]++);
  const lowOrOut = counts.out + counts.low;
  const okOrFull = counts.ok + counts.full;

  // Header chip styles
  const chipStyle = (bg, fg) => `display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;background:${bg};color:${fg}`;
  const chipsHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <span style="${chipStyle('#dcfce7', '#16a34a')}">✓ ${okOrFull} đủ</span>
      ${counts.warn > 0 ? `<span style="${chipStyle('#ffedd5', '#ea580c')}">⚠ ${counts.warn} chú ý</span>` : ''}
      ${lowOrOut > 0 ? `<span style="${chipStyle('#fee2e2', '#dc2626')}">⚠ ${lowOrOut} sắp hết</span>` : ''}
    </div>
  `;

  // Render mỗi item: tên trái + stock phải, bar progress to hơn 8px + %
  const renderItem = (c) => {
    const stock = c.stock || 0;
    const alert = c.alert || 1;
    const unit = c.unit || 'g';
    // Tính % so với "ngưỡng đủ" (alert × 10) — nếu vượt thì 100%
    const fullThreshold = alert * 10;
    const pct = Math.min(100, Math.round((stock / fullThreshold) * 100));
    const { color, icon, label } = c._status;
    const isUrgent = c._status.level === 'out' || c._status.level === 'low';

    return `
      <div onclick="window.showPage && window.showPage('chemicals')" style="cursor:pointer;padding:8px 10px;margin:0 -10px;border-radius:8px;transition:background 0.15s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px">
          <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:${color}22;color:${color};font-size:10px;font-weight:700;flex-shrink:0">${icon}</span>
            <span style="font-size:12.5px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${formatChemical(c.name)}">${formatChemical(c.name)}</span>
          </div>
          <span style="font-size:11.5px;color:${isUrgent ? '#dc2626' : '#64748b'};font-weight:${isUrgent ? 600 : 500};white-space:nowrap;flex-shrink:0">${stock}<span style="opacity:0.7">${unit}</span></span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.3s"></div>
          </div>
          <span style="font-size:10px;color:#94a3b8;font-weight:500;min-width:30px;text-align:right">${pct}%</span>
        </div>
      </div>
    `;
  };

  const html = chems.length
    ? chems.map(renderItem).join('')
    : `<div style="color:#94a3b8;font-size:12px;text-align:center;padding:24px 0">Chưa có dữ liệu</div>`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;flex-shrink:0;gap:8px;flex-wrap:wrap">
      <div>
        <h3 style="margin:0 0 6px;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em">Tình trạng hóa chất</h3>
        ${chipsHTML}
      </div>
      <button onclick="window.showPage && window.showPage('chemicals')" style="background:transparent;border:none;color:${themeTeal};font-size:11.5px;font-weight:600;cursor:pointer;padding:4px 0;display:inline-flex;align-items:center;gap:3px;flex-shrink:0">Xem tất cả
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
    <div class="dash-scroll" style="flex:1;min-height:0;overflow-y:auto;padding:0 10px 0 10px">${html}</div>
  `;
}
// ───── HÀNG 2 — Card 1: Chart cột stacked TN theo tháng (6 tháng gần nhất) ─────
async function renderMonthlyChart(h, e, ec) {
  const card = document.getElementById('dash-chart-monthly');
  if (!card) return;

  const Chart = await loadChartJs();
  const teal = cssVar('--teal') || '#0d9488';
  const colors = { hydro: teal, electrode: '#6366f1', electrochem: '#f97316' };

  const N = _chartDays;
  const isDayMode = N <= 7;
  const titleText = isDayMode ? 'Thí nghiệm theo ngày' : 'Thí nghiệm theo tháng';

  // Build N ngày gần nhất, kết thúc hôm nay
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = N - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const countOnDay = (arr, day) => arr.filter(r => {
    const d = recordDate(r);
    return d && sameDay(d, day);
  }).length;

  const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  const labels = days.map(fmtDate);
  const dataHydro = days.map(d => countOnDay(h, d));
  const dataElectrode = days.map(d => countOnDay(e, d));
  const dataElectrochem = days.map(d => countOnDay(ec, d));

  // Adaptive: ≤14 ngày → dot to; >14 → dot nhỏ
  const dotRadius = N <= 14 ? 4 : (N <= 30 ? 2.5 : 1.8);

  // Build card HTML: header + canvas wrapper (canvas auto fill wrapper)
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;flex-shrink:0">
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em">${titleText}</h3>
      <span style="color:#94a3b8;font-size:10.5px;font-weight:500">${N} ngày</span>
    </div>
    <div style="flex:1;position:relative;min-height:0">
      <canvas></canvas>
    </div>
  `;

  const canvas = card.querySelector('canvas');

  // Destroy old instance trước khi tạo mới (tránh memory leak)
  if (_monthlyChartInstance) {
    _monthlyChartInstance.destroy();
    _monthlyChartInstance = null;
  }

  // Mark sau lần render đầu để các lần re-render sau (wheel) dùng animation ngắn
  const isFirstRender = _monthlyChartFirstRender;
  if (isFirstRender) _monthlyChartFirstRender = false;

  _monthlyChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Hydro',
          data: dataHydro,
          borderColor: colors.hydro,
          backgroundColor: colors.hydro + '15',
          fill: true,
          tension: 0.3,
          pointRadius: dotRadius,
          pointHoverRadius: dotRadius + 2,
          pointBackgroundColor: colors.hydro,
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          borderWidth: 2,
        },
        {
          label: 'Điện cực',
          data: dataElectrode,
          borderColor: colors.electrode,
          backgroundColor: colors.electrode + '15',
          fill: true,
          tension: 0.3,
          pointRadius: dotRadius,
          pointHoverRadius: dotRadius + 2,
          pointBackgroundColor: colors.electrode,
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          borderWidth: 2,
        },
        {
          label: 'Điện hóa',
          data: dataElectrochem,
          borderColor: colors.electrochem,
          backgroundColor: colors.electrochem + '15',
          fill: true,
          tension: 0.3,
          pointRadius: dotRadius,
          pointHoverRadius: dotRadius + 2,
          pointBackgroundColor: colors.electrochem,
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          borderWidth: 2,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // KEY: cho phép fill container 100%
      // Animation: lần đầu (F5) chạy line từ trái sang phải, các lần sau (wheel) chỉ fade nhanh
      animation: isFirstRender ? {
        x: {
          type: 'number',
          easing: 'easeOutQuart',
          duration: 1800,
          from: NaN,
          delay(ctx) {
            if (ctx.type !== 'data' || ctx.xStarted) return 0;
            ctx.xStarted = true;
            return ctx.index * (1800 / Math.max(labels.length, 1));
          }
        },
        y: {
          type: 'number',
          easing: 'easeOutQuart',
          duration: 1800,
          from: (ctx) => {
            if (ctx.type !== 'data' || ctx.yStarted) return ctx.chart.scales.y.getPixelForValue(0);
            ctx.yStarted = true;
            const prev = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1]?.y;
            return prev != null ? prev : ctx.chart.scales.y.getPixelForValue(0);
          },
          delay(ctx) {
            if (ctx.type !== 'data' || ctx.yStarted) return 0;
            ctx.yStarted = true;
            return ctx.index * (1800 / Math.max(labels.length, 1));
          }
        }
      } : { duration: 200 },  // Wheel re-render: chỉ animation 200ms cho mượt mà không nháy
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            font: { size: 11 },
            boxWidth: 14,
            boxHeight: 2,
            padding: 12,
            color: '#64748b',
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(15,23,42,0.95)',
          padding: 10,
          cornerRadius: 6,
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 11 },
          boxPadding: 4,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 10 },
            color: '#64748b',
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 12,
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 10 },
            color: '#94a3b8',
            precision: 0,
            stepSize: 1,
          },
          grid: { color: '#e2e8f0', lineWidth: 0.5, drawTicks: false }
        }
      },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
    }
  });

  attachChartWheel(card, h, e, ec);
}

// Wheel handler cho chart — gắn 1 lần per card render
function attachChartWheel(card, h, e, ec) {
  // Remove old listener nếu có (đảm bảo idempotent)
  if (card._wheelHandler) {
    card.removeEventListener('wheel', card._wheelHandler);
  }

  // Throttle: chỉ react mỗi 80ms để không quá nhanh
  let lastWheel = 0;

  const handler = (ev) => {
    ev.preventDefault();
    const now = Date.now();
    if (now - lastWheel < 80) return;
    lastWheel = now;

    const STEP = 2;
    const MIN = 7;
    const MAX = 180;

    if (ev.deltaY < 0) {
      // Lăn lên → zoom in (giảm ngày)
      _chartDays = Math.max(MIN, _chartDays - STEP);
    } else if (ev.deltaY > 0) {
      // Lăn xuống → zoom out (tăng ngày)
      _chartDays = Math.min(MAX, _chartDays + STEP);
    }

    renderMonthlyChart(h, e, ec);
  };

  card.addEventListener('wheel', handler, { passive: false });
  card._wheelHandler = handler;
}

// ───── HÀNG 2 — Card 2: Pie/donut phân bổ loại TN ─────
async function renderDistributionPie(h, e, ec, ink) {
  const card = document.getElementById('dash-chart-distribution');
  if (!card) return;

  const Chart = await loadChartJs();
  const teal = cssVar('--teal') || '#0d9488';

  const segments = [
    { label: 'Thủy nhiệt', value: h.length, color: teal },
    { label: 'Điện cực', value: e.length, color: '#6366f1' },
    { label: 'Điện hóa', value: ec.length, color: '#f97316' },
    { label: 'Mực', value: ink.length, color: '#3b82f6' }
  ].filter(s => s.value > 0);

  const total = segments.reduce((s, x) => s + x.value, 0);

  // Build legend HTML (dùng legend custom thay vì Chart.js legend mặc định)
  const legendHTML = segments.length ? segments.map(s => {
    const pct = total > 0 ? ((s.value / total) * 100).toFixed(0) : 0;
    return `
      <div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11.5px">
        <span style="width:8px;height:8px;border-radius:2px;background:${s.color};flex-shrink:0"></span>
        <span style="flex:1;color:#475569">${s.label}</span>
        <span style="font-weight:600;color:#0f172a">${s.value}</span>
        <span style="color:#94a3b8;font-size:10.5px;min-width:32px;text-align:right">${pct}%</span>
      </div>`;
  }).join('') : `<div style="color:#94a3b8;font-size:11px;text-align:center;padding:8px 0">Chưa có dữ liệu</div>`;

  // Card layout: header + canvas wrapper (flex:1) + legend
  card.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em;flex-shrink:0">Phân bổ loại TN</h3>
    <div style="flex:1;position:relative;min-height:0;display:flex;flex-direction:column;align-items:center;gap:10px">
      <div style="flex:1;position:relative;min-height:0;width:100%;display:flex;align-items:center;justify-content:center">
        <div style="position:relative;width:100%;max-width:180px;aspect-ratio:1">
          <canvas></canvas>
        </div>
      </div>
      <div style="width:100%;flex-shrink:0">${legendHTML}</div>
    </div>
  `;

  // Empty state - skip Chart.js render
  if (total === 0) {
    return;
  }

  const canvas = card.querySelector('canvas');

  // Destroy old instance trước khi tạo mới
  if (_distributionChartInstance) {
    _distributionChartInstance.destroy();
    _distributionChartInstance = null;
  }

  // Plugin custom: vẽ text "tổng TN" + total ở giữa donut
  const centerTextPlugin = {
    id: 'centerText',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Total number
      ctx.font = 'bold 22px Inter, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(String(total), cx, cy - 6);
      // Label
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('tổng TN', cx, cy + 12);
      ctx.restore();
    }
  };

  _distributionChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: segments.map(s => s.label),
      datasets: [{
        data: segments.map(s => s.value),
        backgroundColor: segments.map(s => s.color),
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 8,
        hoverBorderWidth: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',  // Tỉ lệ donut hole (62% giống ir=22/r=38 cũ)
      animation: { duration: 400, animateRotate: true, animateScale: false },
      plugins: {
        legend: { display: false },  // Dùng legend custom HTML bên dưới
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          padding: 10,
          cornerRadius: 6,
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 11 },
          callbacks: {
            label: (ctx) => {
              const value = ctx.raw;
              const pct = ((value / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${value} (${pct}%)`;
            }
          }
        }
      },
      // Click vào segment → navigate đến trang loại TN tương ứng
      onClick: (event, elements) => {
        if (elements.length === 0) return;
        const idx = elements[0].index;
        const label = segments[idx].label;
        const pageMap = {
          'Thủy nhiệt': 'hydrothermal',
          'Điện cực': 'electrode',
          'Điện hóa': 'electrochemistry'
          // 'Mực': không navigate
        };
        const target = pageMap[label];
        if (target && typeof window.showPage === 'function') {
          window.showPage(target);
        }
      },
      // Hover → đổi cursor thành pointer trên segment có thể click
      onHover: (event, elements) => {
        const canvas = event.native?.target;
        if (!canvas) return;
        if (elements.length > 0) {
          const idx = elements[0].index;
          const label = segments[idx].label;
          const clickable = ['Thủy nhiệt', 'Điện cực', 'Điện hóa'].includes(label);
          canvas.style.cursor = clickable ? 'pointer' : 'default';
        } else {
          canvas.style.cursor = 'default';
        }
      }
    },
    plugins: [centerTextPlugin]
  });
}
// ───── HÀNG 2 — Card 3: Top thành viên TN nhiều ─────
function renderTopMembers(h, e, ec) {
  const card = document.getElementById('dash-top-members');
  if (!card) return;

  const all = [...h, ...e, ...ec];
  // Tính trong tháng hiện tại
  const now = new Date();
  const thisMonth = all.filter(r => {
    const d = recordDate(r);
    return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const counts = {};
  thisMonth.forEach(r => {
    if (r.person) counts[r.person] = (counts[r.person] || 0) + 1;
  });

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const monthLabel = `Tháng ${now.getMonth() + 1}`;
  const medals = ['🥇', '🥈', '🥉'];

  const teal = cssVar('--teal') || '#0d9488';

  const rowsHTML = ranked.length ? ranked.map(([name, count], idx) => {
    const medal = idx < 3 ? medals[idx] : '';
    const rankLabel = medal || (idx + 1);
    const fontWeight = idx < 3 ? 600 : 500;
    const numColor = idx === 0 ? teal : '#0f172a';
    return `<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:0.5px solid var(--border)">
      <span style="width:18px;font-size:${idx < 3 ? 13 : 11}px;color:${idx < 3 ? '#0f172a' : '#94a3b8'};text-align:center">${rankLabel}</span>
      ${avatarHTML(name, 28)}
      <div style="flex:1;font-size:12.5px;font-weight:${fontWeight};color:#0f172a;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</div>
      <span style="font-size:12px;font-weight:600;color:${numColor}">${count}</span>
    </div>`;
  }).join('') : `<div style="text-align:center;color:#94a3b8;font-size:12px;padding:24px 0">Chưa có dữ liệu</div>`;

  card.innerHTML = `
    <h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em">Top thành viên · ${monthLabel}</h3>
    ${rowsHTML}
  `;
}

// ───── HÀNG 3 — Recent experiments table (full width) ─────
function renderRecentTable(h, e, ec, members) {
  const tbody = document.getElementById('dash-tbody');
  if (!tbody) return;

  // Gộp cả 3 loại + sort theo date desc, lấy top 5
  const all = [
    ...h.map(r => ({ ...r, _type: 'hydro' })),
    ...e.map(r => ({ ...r, _type: 'electrode' })),
    ...ec.map(r => ({ ...r, _type: 'electrochem' }))
  ];
  const sorted = all
    .map(r => ({ ...r, _date: recordDate(r) }))
    .filter(r => r._date)
    .sort((a, b) => b._date - a._date)
    .slice(0, 5);

  const memberMap = {};
  vals(members).forEach(m => {
    if (m.name) memberMap[m.name.trim()] = m;
  });

  function personCell(personName) {
    if (!personName) return '<span style="color:#94a3b8">—</span>';
    return `<div style="display:flex;align-items:center;gap:10px">
      ${avatarHTML(personName, 32)}
      <div style="min-width:0">
        <div style="font-weight:600;color:#0f172a;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(personName)}</div>
      </div>
    </div>`;
  }

  function statusPill(status) {
    if (!status) return '<span style="color:#94a3b8">—</span>';
    const map = {
      'Hoàn thành':       { bg: 'rgba(16,185,129,0.15)', fg: '#047857' },
      'Đang thực hiện':   { bg: 'rgba(245,158,11,0.15)', fg: '#b45309' },
      'Chờ phân tích':    { bg: 'rgba(59,130,246,0.15)', fg: '#1e40af' },
      'Thất bại':         { bg: 'rgba(239,68,68,0.15)',  fg: '#b91c1c' },
      'Sẵn sàng đo':      { bg: 'rgba(16,185,129,0.15)', fg: '#047857' },
      'Đang activation':  { bg: 'rgba(245,158,11,0.15)', fg: '#b45309' },
      'Đang xử lý':       { bg: 'rgba(59,130,246,0.15)', fg: '#1e40af' }
    };
    const c = map[status] || { bg: '#f1f5f9', fg: '#64748b' };
    return `<span style="display:inline-block;padding:5px 14px;border-radius:999px;background:${c.bg};color:${c.fg};font-size:11.5px;font-weight:700;letter-spacing:0.02em;white-space:nowrap">${escapeHtml(status)}</span>`;
  }

  tbody.innerHTML = sorted.length ? sorted.map(r => `
    <div class="recent-row recent-grid" data-exp-key="${escapeHtml(r._key)}" data-exp-type="${r._type}" onclick="window._dashGoToExp('${escapeHtml(r._key)}', '${r._type}')" style="cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'" title="Xem chi tiết">
      <div>${personCell(r.person)}</div>
      <div><strong style="font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:700;color:#344767">${escapeHtml(r.code || '')}</strong></div>
      <div style="font-size:13px;color:#344767">${formatChemical(r.material || '—')}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#344767">${r.temp ? escapeHtml(String(r.temp)) + ' °C' : '—'}</div>
      <div>${statusPill(r.status)}</div>
    </div>
  `).join('') : '<div class="recent-empty">Chưa có thí nghiệm nào</div>';
}

// ───── Click handler cho recent row → navigate + flash ─────
if (typeof window !== 'undefined') {
  window._dashGoToExp = function(key, type) {
    const pageMap = {
      hydro: 'hydrothermal',
      electrode: 'electrode',
      electrochem: 'electrochemistry'
    };
    const targetPage = pageMap[type];
    if (!targetPage || !window.showPage) return;

    window.showPage(targetPage);

    // Đợi page render + table render xong, rồi flash row
    // 2 lần thử với delay khác nhau (do data load có thể async)
    const tryFlash = (delay) => {
      setTimeout(() => {
        const tr = document.querySelector(`#page-${targetPage} tr[onclick*="${key}"]`);
        if (tr) {
          tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (window.flashRow) window.flashRow(tr);
        }
      }, delay);
    };
    tryFlash(300);
    tryFlash(800); // backup nếu lần đầu chưa render kịp
  };
}

// ───── Public API ─────
export function renderDash() {
  const cache = window.cache;
  if (!cache) return;

  const h = vals(cache.hydro);
  const e = vals(cache.electrode);
  const ec = vals(cache.electrochem);
  const ink = vals(cache.ink);
  const members = vals(cache.members).length;

  // ── Sync render: text/numbers/tables (fast, FCP critical path) ──
  renderKPI(h, e, ec, members);
  renderMembersKPI(cache.members);
  renderBookingWeek(cache.bookings, cache.members);
  renderMembersList(cache.members);
  renderChemStatus(cache.chemicals);
  renderRecentTable(h, e, ec, cache.members);

  // ── Defer charts (lazy Chart.js, không cần cho first paint) ──
  // requestIdleCallback fallback to setTimeout cho browser cũ
  const deferChart = (typeof requestIdleCallback === 'function')
    ? (fn) => requestIdleCallback(fn, { timeout: 500 })
    : (fn) => setTimeout(fn, 50);

  deferChart(() => {
    renderMonthlyChart(h, e, ec);
    renderDistributionPie(h, e, ec, ink);
    // renderTopMembers(h, e, ec); // Disabled: card removed from dashboard HÀNG 2
  });
}

// Expose handler cho week navigation + day select
window._dashNavBookingWeek = function(delta) {
  _bookingWeekOffset += delta;
  _bookingSelectedDay = null; // reset selection để mặc định về today/đầu tuần mới
  if (window.cache) {
    renderBookingWeek(window.cache.bookings, window.cache.members);
  }
};

window._dashSelectBookingDay = function(timestamp) {
  _bookingSelectedDay = new Date(timestamp);
  if (window.cache) {
    renderBookingWeek(window.cache.bookings, window.cache.members);
  }
};

// ───── Member popover ─────
window._dashShowMemberPopover = function(uid, anchorEl) {
  // Đóng popover cũ nếu có
  closeMemberPopover();

  const cache = window.cache;
  if (!cache || !cache.members) return;
  const member = cache.members[uid];
  if (!member) return;

  const memberName = (member.name || '').trim();

  // Tính số TN đã làm trong tháng hiện tại
  // Schema records dùng field `person` (string = tên), không phải uid
  const now = new Date();
  const inThisMonthByPerson = (arr) => Object.values(arr || {}).filter(r => {
    const d = recordDate(r);
    if (!d) return false;
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
    // Match theo r.person == member.name (chính xác string)
    return memberName && r.person && String(r.person).trim() === memberName;
  }).length;

  const hCount = inThisMonthByPerson(cache.hydro);
  const eCount = inThisMonthByPerson(cache.electrode);
  const ecCount = inThisMonthByPerson(cache.electrochem);
  const totalTN = hCount + eCount + ecCount;

  const name = memberName || 'Không rõ';
  const role = member.role || '—';
  const program = member.program || '';
  const year = member.year || '';
  const email = member.email || '—';
  const studentId = member.studentId || member.mssv || member.mshv || member.studentCode || member.code || member.id || '—';
  const phone = member.phone || member.phoneNumber || member.tel || member.sdt || '—';

  // Build popover element
  const pop = document.createElement('div');
  pop.className = 'dash-member-popover';
  pop.id = 'dash-active-member-popover';

  pop.innerHTML = `
    <button type="button" class="pop-close" onclick="window._dashCloseMemberPopover()" aria-label="Đóng">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:14px">
      ${avatarHTML(name, 64)}
      <div style="font-size:15px;font-weight:700;color:#0f172a;text-align:center;line-height:1.2">${escapeHtml(name)}</div>
      <span style="font-size:10.5px;font-weight:600;color:var(--teal);background:var(--teal-light);padding:2px 10px;border-radius:999px">${escapeHtml(role)}</span>
    </div>
    ${program || year ? `
      <div class="pop-row">
        <span class="pop-label">Chương trình</span>
        <span class="pop-value">${escapeHtml(program || '—')}${year ? ` · ${escapeHtml(year)}` : ''}</span>
      </div>
    ` : ''}
    <div class="pop-row">
      <span class="pop-label">Email</span>
      <span class="pop-value" style="font-size:11.5px;color:#475569">${escapeHtml(email)}</span>
    </div>
    <div class="pop-row">
      <span class="pop-label">MSSV/MSHV</span>
      <span class="pop-value">${escapeHtml(studentId)}</span>
    </div>
    <div class="pop-row">
      <span class="pop-label">SĐT</span>
      <span class="pop-value">${escapeHtml(phone)}</span>
    </div>
  `;

  // Append vào body với position:fixed → không bị cắt bởi parent overflow,
  // không bị transparency ảnh hưởng bởi stat-card stacking context
  const card = document.getElementById('dash-members-kpi');
  if (!card) return;
  pop.style.position = 'fixed';
  document.body.appendChild(pop);

  // Position popover BÊN DƯỚI avatar (position:fixed → coords theo viewport)
  const anchorRect = anchorEl.getBoundingClientRect();
  const popW = 280;
  const popH = pop.offsetHeight;
  const gap = 8;

  // Top: ngay dưới row click
  let top = anchorRect.bottom + gap;

  // Left: căn left với row
  let left = anchorRect.left;

  // Vượt phải viewport → dịch trái
  if (left + popW > window.innerWidth - 12) {
    left = window.innerWidth - popW - 12;
  }
  // Vượt trái → kẹp về 12
  if (left < 12) left = 12;

  // Vượt dưới viewport → lật lên phía trên anchor
  if (top + popH > window.innerHeight - 12) {
    top = anchorRect.top - popH - gap;
    if (top < 12) top = 12;
  }

  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;

  // Outside click + ESC + scroll để đóng
  setTimeout(() => {
    document.addEventListener('click', _dashOutsideClickHandler);
    document.addEventListener('keydown', _dashEscHandler);
    window.addEventListener('scroll', closeMemberPopover, { once: true, capture: true });
  }, 0);
};

window._dashCloseMemberPopover = closeMemberPopover;

function closeMemberPopover() {
  const pop = document.getElementById('dash-active-member-popover');
  if (pop) pop.remove();
  document.removeEventListener('click', _dashOutsideClickHandler);
  document.removeEventListener('keydown', _dashEscHandler);
}

function _dashOutsideClickHandler(ev) {
  const pop = document.getElementById('dash-active-member-popover');
  if (!pop) return;
  // Nếu click trong popover hoặc trong member row → bỏ qua
  if (pop.contains(ev.target)) return;
  if (ev.target.closest('.dash-member-row')) return;
  closeMemberPopover();
}

function _dashEscHandler(ev) {
  if (ev.key === 'Escape') closeMemberPopover();
}

// ───── Auto re-render khi đổi theme ─────
window.addEventListener('themechange', () => {
  if (window.cache) renderDash();
});

// ── Điều hướng từ dashboard booking item → page Booking + flash row ──
window._dashGoToBooking = function(bookingKey) {
  if (!bookingKey || typeof window.showPage !== 'function') return;

  // 1. Tìm sidebar item booking để truyền vào showPage (giúp set active state)
  let sidebarItem = null;
  document.querySelectorAll('.sidebar-item').forEach(s => {
    const onclick = s.getAttribute('onclick') || '';
    if (onclick.includes("'booking'")) sidebarItem = s;
  });

  // 2. Navigate
  window.showPage('booking', sidebarItem);

  // 3. Flash row sau khi page render
  // Multi-attempt vì tbody có thể chưa render xong ngay
  const cache = window.cache || {};
  const code = cache.bookings?.[bookingKey]?.code;
  const attempts = [200, 400, 700, 1000, 1500, 2000];
  attempts.forEach(delay => {
    setTimeout(() => _dashFlashBookingRow(bookingKey, code), delay);
  });
};

function _dashFlashBookingRow(bookingKey, code) {
  const rows = document.querySelectorAll('#booking-tbody tr');
  if (rows.length === 0) return;

  // Skip empty-state row
  const dataRows = [...rows].filter(r => {
    const firstTd = r.querySelector('td:first-child');
    return firstTd && firstTd.colSpan <= 1;
  });
  if (dataRows.length === 0) return;

  let target = null;
  // Match 1: bookingKey trong outerHTML
  if (bookingKey) {
    for (const row of dataRows) {
      if (row.outerHTML.indexOf(bookingKey) !== -1) {
        target = row;
        break;
      }
    }
  }
  // Match 2: code trong text
  if (!target && code) {
    for (const row of dataRows) {
      if ((row.textContent || '').indexOf(code) !== -1) {
        target = row;
        break;
      }
    }
  }

  if (!target) return;

  // Scroll into view + flash highlight
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Animation flash: dùng class .row-flash nếu có, fallback inline
  if (target.classList.contains('row-flash')) {
    target.classList.remove('row-flash');
    void target.offsetWidth; // trigger reflow để re-animate
  }
  target.classList.add('row-flash');
  setTimeout(() => target.classList.remove('row-flash'), 2200);
}

