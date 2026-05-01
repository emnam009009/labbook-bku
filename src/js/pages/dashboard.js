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

    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:0.5px solid var(--border)">
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
    <div class="dash-scroll" style="max-height:300px;overflow-y:auto;padding-right:4px">${bookingListHTML}</div>
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

  const chems = vals(chemicals).filter(c => c && c.name).sort((a, b) => {
    if ((a.unit || 'g') === (b.unit || 'g')) return (a.stock || 0) - (b.stock || 0);
    return (a.unit || 'g') === 'g' ? -1 : 1;
  });
  const chemsG = chems.filter(c => (c.unit || 'g') === 'g');
  const chemsmL = chems.filter(c => c.unit === 'mL');

  const themeTeal = cssVar('--teal') || '#0d9488';

  const renderBar = (c) => {
    const alert = c.alert || 1;
    const pct = Math.min(100, Math.round((c.stock || 0) / (alert * 100) * 100));
    const low = (c.stock || 0) <= alert;
    const ratio = (c.stock || 0) / alert;
    const color = ratio <= 1 ? '#ef4444'
                : ratio <= 3 ? '#f97316'
                : ratio <= 7.5 ? '#eab308'
                : themeTeal;
    return `<div style="margin-bottom:9px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span style="font-size:11.5px;color:${low ? '#ef4444' : '#64748b'};font-weight:${low ? 600 : 400}">${c.stock || 0}${c.unit || 'g'}${low ? ' ⚠' : ''}</span>
        <span style="font-size:12px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%">${formatChemical(c.name)}</span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div>
      </div>
    </div>`;
  };

  // Đếm số sắp hết
  const lowCount = chems.filter(c => (c.stock || 0) <= (c.alert || 0)).length;
  const headerRight = lowCount > 0
    ? `<span style="font-size:11px;color:#ef4444;font-weight:600">${lowCount} sắp hết</span>`
    : `<span style="font-size:11px;color:#10b981;font-weight:500">Đầy đủ</span>`;

  // Hiển thị tất cả (có scroll trong card)
  const html = chems.length ? (
    (chemsG.length ? `<div style="font-size:10px;font-weight:600;letter-spacing:0.08em;color:#94a3b8;margin-bottom:6px;text-transform:uppercase">Khối lượng (g)</div>` + chemsG.map(renderBar).join('') : '') +
    (chemsmL.length ? `<div style="font-size:10px;font-weight:600;letter-spacing:0.08em;color:#94a3b8;margin:12px 0 6px;text-transform:uppercase">Thể tích (mL)</div>` + chemsmL.map(renderBar).join('') : '')
  ) : `<div style="color:#94a3b8;font-size:12px;text-align:center;padding:20px 0">Chưa có dữ liệu</div>`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0">
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em">Tình trạng hóa chất</h3>
      ${headerRight}
    </div>
    <div class="dash-scroll" style="flex:1;min-height:0;overflow-y:auto;padding-right:6px">${html}</div>
  `;
}

// ───── HÀNG 2 — Card 1: Chart cột stacked TN theo tháng (6 tháng gần nhất) ─────
function renderMonthlyChart(h, e, ec) {
  const card = document.getElementById('dash-chart-monthly');
  if (!card) return;

  const teal = cssVar('--teal') || '#0d9488';
  const colors = { hydro: teal, electrode: '#6366f1', electrochem: '#f97316' };

  // Số ngày hiển thị (state global, wheel để đổi)
  const N = _chartDays;
  const isDayMode = N <= 7; // ≤7 ngày → "theo ngày", >7 → "theo tháng"
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

  const data = days.map(day => ({
    date: day,
    hydro: countOnDay(h, day),
    electrode: countOnDay(e, day),
    electrochem: countOnDay(ec, day)
  }));

  // yMax dựa trên giá trị cao nhất của từng line
  const maxValue = Math.max(1, ...data.flatMap(d => [d.hydro, d.electrode, d.electrochem]));
  const yMax = Math.ceil(maxValue / 5) * 5 || 5;

  // SVG dimensions
  const W = 440, H = 180;
  const PAD_L = 22, PAD_R = 6, PAD_T = 8, PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const colW = innerW / (data.length - 1 || 1);

  const yToPx = (v) => PAD_T + innerH - (v / yMax) * innerH;
  const xToPx = (i) => PAD_L + colW * i;

  // Y axis labels
  const yTicks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax].map(v => Math.round(v));
  const yLabels = yTicks.map(v => `<text x="${PAD_L - 6}" y="${yToPx(v) + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${v}</text>`).join('');
  const yGrids = yTicks.slice(1).map(v => `<line x1="${PAD_L}" y1="${yToPx(v)}" x2="${W - PAD_R}" y2="${yToPx(v)}" stroke="var(--border)" stroke-width="0.3" stroke-dasharray="2,2"/>`).join('');

  // X axis labels — adaptive density theo N
  // 7 ngày: hiển thị tất cả "dd/mm"
  // 8-30: hiển thị mỗi 3-5 ngày
  // 31-90: hiển thị mỗi 10-15 ngày
  // 91-180: hiển thị mỗi 20-30 ngày
  let xStep;
  if (N <= 7) xStep = 1;
  else if (N <= 14) xStep = 2;
  else if (N <= 30) xStep = 4;
  else if (N <= 60) xStep = 8;
  else if (N <= 90) xStep = 12;
  else if (N <= 120) xStep = 16;
  else xStep = 24;

  const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  // Luôn hiện ngày đầu và ngày cuối, các điểm giữa theo step
  const xLabelIndices = new Set([0, data.length - 1]);
  for (let i = 0; i < data.length; i += xStep) xLabelIndices.add(i);

  const xLabels = Array.from(xLabelIndices)
    .filter(i => i >= 0 && i < data.length)
    .map(i =>
      `<text x="${xToPx(i)}" y="${H - PAD_B + 14}" text-anchor="middle" font-size="9.5" fill="#64748b">${fmtDate(data[i].date)}</text>`
    ).join('');

  // Dot density: ≤14 ngày → dot to + label số; >14 → dot nhỏ, không label số (tránh chồng)
  const showDotLabels = N <= 14;
  const dotRadius = N <= 14 ? 3.5 : (N <= 30 ? 2.5 : 1.8);
  const dotZeroRadius = N <= 14 ? 2.5 : (N <= 30 ? 1.5 : 0); // 0 = không vẽ dot 0

  // Build line + dots cho từng series
  function buildLine(seriesKey, color, labelName) {
    const points = data.map((d, i) => ({ x: xToPx(i), y: yToPx(d[seriesKey]), v: d[seriesKey], date: d.date }));
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Area fill mờ bên dưới line
    const areaPath = linePath +
      ` L ${points[points.length - 1].x} ${PAD_T + innerH}` +
      ` L ${points[0].x} ${PAD_T + innerH} Z`;

    const dotsHTML = points.map(p => {
      const tooltipText = `${labelName} ${fmtDate(p.date)}: ${p.v}`;
      if (p.v > 0) {
        const labelEl = showDotLabels
          ? `<text x="${p.x}" y="${p.y - 7}" text-anchor="middle" font-size="9" fill="${color}" font-weight="600">${p.v}</text>`
          : '';
        return `<circle cx="${p.x}" cy="${p.y}" r="${dotRadius}" fill="${color}" stroke="white" stroke-width="1.5"><title>${tooltipText}</title></circle>${labelEl}`;
      }
      // Dot tại điểm = 0 (chỉ vẽ khi N nhỏ)
      if (dotZeroRadius > 0) {
        return `<circle cx="${p.x}" cy="${p.y}" r="${dotZeroRadius}" fill="white" stroke="${color}" stroke-width="1.5"><title>${tooltipText}</title></circle>`;
      }
      return '';
    }).join('');

    return `
      <path d="${areaPath}" fill="${color}" fill-opacity="0.08"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dotsHTML}
    `;
  }

  const linesHTML =
    buildLine('hydro', colors.hydro, 'Hydro') +
    buildLine('electrode', colors.electrode, 'Điện cực') +
    buildLine('electrochem', colors.electrochem, 'Điện hóa');

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em">${titleText}</h3>
      <div style="display:flex;align-items:center;gap:10px;font-size:10.5px;color:#64748b">
        <span style="color:#94a3b8;font-size:10px;font-weight:500">${N} ngày</span>
        <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:2px;background:${colors.hydro};border-radius:2px"></span>Hydro</span>
        <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:2px;background:${colors.electrode};border-radius:2px"></span>Điện cực</span>
        <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:2px;background:${colors.electrochem};border-radius:2px"></span>Điện hóa</span>
      </div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;height:180px">
      <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + innerH}" stroke="var(--border)" stroke-width="0.5"/>
      <line x1="${PAD_L}" y1="${PAD_T + innerH}" x2="${W - PAD_R}" y2="${PAD_T + innerH}" stroke="var(--border)" stroke-width="0.5"/>
      ${yGrids}
      ${yLabels}
      ${xLabels}
      ${linesHTML}
    </svg>
  `;

  // Attach wheel handler — debounce nhẹ để wheel mượt
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
function renderDistributionPie(h, e, ec, ink) {
  const card = document.getElementById('dash-chart-distribution');
  if (!card) return;

  const teal = cssVar('--teal') || '#0d9488';
  const segments = [
    { label: 'Thủy nhiệt', value: h.length, color: teal },
    { label: 'Điện cực', value: e.length, color: '#6366f1' },
    { label: 'Điện hóa', value: ec.length, color: '#f97316' },
    { label: 'Mực', value: ink.length, color: '#3b82f6' }
  ].filter(s => s.value > 0);

  const total = segments.reduce((s, x) => s + x.value, 0);

  // Build donut paths
  const cx = 50, cy = 50, r = 38, ir = 22;

  let pathsHTML = '';
  if (total > 0) {
    // Special case: 1 segment chiếm 100% → vẽ donut full bằng 2 circle thay vì path
    // (SVG arc không vẽ được khi start point == end point)
    if (segments.length === 1) {
      const seg = segments[0];
      pathsHTML = `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${seg.color}"><title>${seg.label}: ${seg.value}</title></circle>
        <circle cx="${cx}" cy="${cy}" r="${ir}" fill="white"/>
      `;
    } else {
      let startAngle = -Math.PI / 2; // start from top
      segments.forEach(seg => {
        const angle = (seg.value / total) * Math.PI * 2;
        const endAngle = startAngle + angle;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = angle > Math.PI ? 1 : 0;

        // Outer arc
        const ix1 = cx + ir * Math.cos(endAngle);
        const iy1 = cy + ir * Math.sin(endAngle);
        const ix2 = cx + ir * Math.cos(startAngle);
        const iy2 = cy + ir * Math.sin(startAngle);

        pathsHTML += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${largeArc} 0 ${ix2} ${iy2} Z" fill="${seg.color}"><title>${seg.label}: ${seg.value}</title></path>`;
        startAngle = endAngle;
      });
    }
  } else {
    pathsHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f1f5f9"/><circle cx="${cx}" cy="${cy}" r="${ir}" fill="white"/>`;
  }

  const legendHTML = segments.length ? segments.map(s => `
    <div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11.5px">
      <span style="width:8px;height:8px;border-radius:2px;background:${s.color};flex-shrink:0"></span>
      <span style="flex:1;color:#475569">${s.label}</span>
      <span style="font-weight:600;color:#0f172a">${s.value}</span>
    </div>`).join('') : `<div style="color:#94a3b8;font-size:11px;text-align:center;padding:8px 0">Chưa có dữ liệu</div>`;

  card.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#344767;letter-spacing:-0.01em">Phân bổ loại TN</h3>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
      <svg viewBox="0 0 100 100" width="120" height="120" style="flex-shrink:0;max-width:100%">
        ${pathsHTML}
        <text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="13" font-weight="700" fill="#0f172a">${total}</text>
        <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="7" fill="#64748b">tổng TN</text>
      </svg>
      <div style="width:100%;min-width:0">${legendHTML}</div>
    </div>
  `;
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
    <div class="recent-row recent-grid">
      <div>${personCell(r.person)}</div>
      <div><strong style="font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:700;color:#344767">${escapeHtml(r.code || '')}</strong></div>
      <div style="font-size:13px;color:#344767">${formatChemical(r.material || '—')}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#344767">${r.temp ? escapeHtml(String(r.temp)) + ' °C' : '—'}</div>
      <div>${statusPill(r.status)}</div>
    </div>
  `).join('') : '<div class="recent-empty">Chưa có thí nghiệm nào</div>';
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

  renderKPI(h, e, ec, members);
  renderMembersKPI(cache.members);
  renderBookingWeek(cache.bookings, cache.members);
  renderMembersList(cache.members);
  renderChemStatus(cache.chemicals);
  renderMonthlyChart(h, e, ec);
  renderDistributionPie(h, e, ec, ink);
  renderTopMembers(h, e, ec);
  renderRecentTable(h, e, ec, cache.members);
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
