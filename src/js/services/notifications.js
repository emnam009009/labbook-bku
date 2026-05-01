/**
 * services/notifications.js — Bell icon + notifications dropdown
 *
 * Phase A: Skeleton — toggle dropdown, click outside để close
 * Phase B: Tạo notifications khi save/approve/reject booking
 * Phase C: Đếm unread + hiển thị badge
 * Phase D: Click notification → mark read + jump tới booking/page tương ứng
 * Phase E: Firebase rules + cleanup
 *
 * v3 — Mở rộng cho member + thêm 3 type mới:
 *  - member_added: cho admin/superadmin khi có member mới được duyệt
 *  - member_removed: cho admin/superadmin khi 1 member bị xóa
 *  - member_role_changed: cho admin/superadmin khi đổi role member
 *  - booking_pending: cho admin (đã có) — broadcast targetUid=null
 *  - booking_approved/rejected: cho member chủ booking (đã có) — targetUid=ownerUid
 *
 * Bell hiển thị cho mọi role authenticated (admin, superadmin, member, viewer).
 */

import { db, ref, update, remove, fbPush } from '../firebase.js'
import { vals } from '../utils/format.js'

// ╔════════════════════════════════════════════════════════════════╗
// CREATE NOTIFICATION (gọi từ booking.js, users.js khi action)
// ╚════════════════════════════════════════════════════════════════╝
/**
 * Tạo 1 notification mới trong Firebase
 * @param {string} type - 'booking_pending' | 'booking_approved' | 'booking_rejected' |
 *                       'member_added' | 'member_removed' | 'member_role_changed'
 * @param {string} bookingKey - key của booking (hoặc memberKey/uid cho member events)
 * @param {string|null} targetUid - null = cho tất cả admin/superadmin; uid = cho user cụ thể
 * @param {string} title
 * @param {string} message
 */
window.createNotification = async function(type, bookingKey, targetUid, title, message) {
  try {
    const notif = {
      type,
      bookingKey,
      targetUid: targetUid || null,
      title,
      message,
      createdAt: new Date().toISOString(),
      readBy: {},  // Map uid → ISO timestamp
    };
    await fbPush('notifications', notif);
  } catch (e) {
    console.error('createNotification error:', e);
  }
};

// Helper: broadcast notif cho tất cả admin/superadmin (targetUid = null)
window.notifyAdmins = async function(type, refKey, title, message) {
  return window.createNotification(type, refKey, null, title, message);
};

// Helper: notify 1 user cụ thể (member nào đó)
window.notifyUser = async function(uid, type, refKey, title, message) {
  return window.createNotification(type, refKey, uid, title, message);
};

// ╔════════════════════════════════════════════════════════════════╗
// TOGGLE DROPDOWN
// ╚════════════════════════════════════════════════════════════════╝
window.toggleBellDropdown = function() {
  const dropdown = document.getElementById('bell-dropdown');
  if (!dropdown) return;

  const isOpen = dropdown.style.display === 'block';
  if (isOpen) {
    dropdown.style.display = 'none';
  } else {
    dropdown.style.display = 'block';
    if (typeof renderNotifications === 'function') renderNotifications();
  }
};

// Close dropdown khi click ra ngoài
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('bell-dropdown');
  const wrapper = document.getElementById('bell-wrapper');
  if (!dropdown || !wrapper) return;
  if (dropdown.style.display === 'block' && !wrapper.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ╔════════════════════════════════════════════════════════════════╗
// CLEAR/MARK ALL
// ╚════════════════════════════════════════════════════════════════╝
window.clearAllNotifications = async function() {
  const uid = window.currentAuth?.uid;
  if (!uid) return;

  const notifs = getMyNotifications();
  if (notifs.length === 0) {
    window.showToast?.('Không có thông báo để xóa', 'info');
    return;
  }

  if (!confirm(`Xóa toàn bộ ${notifs.length} thông báo? Không thể hoàn tác.`)) return;

  try {
    const ops = [];
    notifs.forEach(n => {
      if (n.targetUid === uid) {
        ops.push(remove(ref(db, `notifications/${n._key}`)));
      } else {
        ops.push(update(ref(db, `notifications/${n._key}/deletedBy`), {
          [uid]: new Date().toISOString()
        }));
      }
    });
    await Promise.all(ops);
    window.showToast?.(`Đã xóa ${notifs.length} thông báo`, 'success');
  } catch (e) {
    console.error('clearAll error:', e);
    window.showToast?.('Lỗi: ' + e.message, 'danger');
  }
};

window.markAllNotificationsRead = async function() {
  const uid = window.currentAuth?.uid;
  if (!uid) return;
  const notifs = getMyNotifications().filter(n => !n.readBy || !n.readBy[uid]);
  if (notifs.length === 0) {
    window.showToast?.('Không có thông báo chưa đọc', 'info');
    return;
  }

  try {
    const now = new Date().toISOString();
    await Promise.all(notifs.map(n =>
      update(ref(db, `notifications/${n._key}/readBy`), { [uid]: now })
    ));
    window.showToast?.(`Đã đánh dấu ${notifs.length} thông báo`, 'success');
  } catch (e) {
    console.error('markAllRead error:', e);
    window.showToast?.('Lỗi: ' + e.message, 'danger');
  }
};

// ╔════════════════════════════════════════════════════════════════╗
// COUNT UNREAD + UPDATE BADGE
// ╚════════════════════════════════════════════════════════════════╝
/**
 * Lấy notifications relevant cho user hiện tại
 * - Admin/Superadmin: notifs targetUid=null (broadcast) + targetUid=currentUid
 * - Member: notifs targetUid=currentUid
 */
function getMyNotifications() {
  const cache = window.cache;
  if (!cache?.notifications) return [];

  const uid = window.currentAuth?.uid;
  const role = window.currentAuth?.role;
  const isAdminLike = window.currentAuth?.isAdmin || role === 'superadmin' || role === 'admin';
  if (!uid) return [];

  return vals(cache.notifications).filter(n => {
    // Filter notif đã bị user này đánh dấu xóa
    if (n.deletedBy && n.deletedBy[uid]) return false;
    // Admin/Superadmin: thấy notif của mình + notif chung (targetUid null)
    if (isAdminLike && (n.targetUid === null || !n.targetUid || n.targetUid === uid)) return true;
    // Member: chỉ thấy notif của mình (targetUid = uid)
    if (!isAdminLike && n.targetUid === uid) return true;
    return false;
  });
}

function countUnread() {
  const uid = window.currentAuth?.uid;
  if (!uid) return 0;
  return getMyNotifications().filter(n => !n.readBy || !n.readBy[uid]).length;
}

function updateBellBadge() {
  const badge = document.getElementById('bell-badge');
  if (!badge) return;

  const count = countUnread();
  if (count <= 0) {
    badge.style.display = 'none';
  } else {
    badge.style.display = 'flex';
    badge.textContent = count > 9 ? '9+' : String(count);
  }
}

// Render notifications list trong dropdown
function renderNotifications() {
  const list = document.getElementById('bell-list');
  if (!list) return;

  const uid = window.currentAuth?.uid;
  const notifs = getMyNotifications().sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  ).slice(0, 30);

  if (notifs.length === 0) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="opacity:0.3;margin-bottom:8px"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg><div>Chưa có thông báo</div></div>';
    return;
  }

  // ICONS map cho từng loại — bao gồm 3 types mới
  const ICONS = {
    'booking_pending':       { icon: '⏳', color: '#b45309', bg: 'rgba(245,158,11,0.12)' },
    'booking_approved':      { icon: '✓',  color: '#1e40af', bg: 'rgba(59,130,246,0.12)' },
    'booking_rejected':      { icon: '✕',  color: '#b91c1c', bg: 'rgba(239,68,68,0.12)' },
    'member_added':          { icon: '👥', color: '#047857', bg: 'rgba(16,185,129,0.12)' },
    'member_removed':        { icon: '🗑', color: '#b91c1c', bg: 'rgba(239,68,68,0.12)' },
    'member_role_changed':   { icon: '🔄', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  };

  list.innerHTML = notifs.map(n => {
    const isUnread = !n.readBy || !n.readBy[uid];
    const info = ICONS[n.type] || { icon: '🔔', color: '#475569', bg: 'rgba(100,116,139,0.12)' };
    const time = formatRelativeTime(n.createdAt);

    return `<div onclick="window.handleNotificationClick('${n._key}')" style="padding:12px 16px;border-bottom:1px solid #f8fafc;cursor:pointer;display:flex;gap:10px;background:${isUnread ? 'rgba(13,148,136,0.04)' : 'transparent'};transition:background 0.15s" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='${isUnread ? 'rgba(13,148,136,0.04)' : 'transparent'}'">
      <div style="width:32px;height:32px;border-radius:50%;background:${info.bg};color:${info.color};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0">${info.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:${isUnread ? '600' : '500'};color:var(--text);margin-bottom:2px">${escapeHtmlSimple(n.title || '')}</div>
        <div style="font-size:12px;color:var(--text-2);margin-bottom:3px;line-height:1.4">${escapeHtmlSimple(n.message || '')}</div>
        <div style="font-size:11px;color:var(--text-3)">${time}</div>
      </div>
      ${isUnread ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--teal);flex-shrink:0;margin-top:6px"></div>' : ''}
    </div>`;
  }).join('');
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
    if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
    if (diff < 604800) return Math.floor(diff / 86400) + ' ngày trước';
    return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
  } catch { return iso; }
}

function escapeHtmlSimple(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ╔════════════════════════════════════════════════════════════════╗
// CLICK NOTIFICATION → MARK READ + NAVIGATE
// ╚════════════════════════════════════════════════════════════════╝
window.handleNotificationClick = async function(key) {
  const cache = window.cache;
  const notif = cache?.notifications?.[key];
  if (!notif) return;

  const uid = window.currentAuth?.uid;

  // 1. Mark as read
  if (uid && (!notif.readBy || !notif.readBy[uid])) {
    try {
      await update(ref(db, `notifications/${key}/readBy`), {
        [uid]: new Date().toISOString()
      });
    } catch (e) {
      console.error('mark read error:', e);
    }
  }

  // 2. Đóng dropdown
  const dropdown = document.getElementById('bell-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  // 3. Navigate dựa trên type
  const t = notif.type || '';
  if (t.startsWith('booking_')) {
    navigateToPage('booking', () => highlightBookingRow(notif.bookingKey));
  } else if (t.startsWith('member_')) {
    // member_added/removed/role_changed → trang users (admin) hoặc members (member)
    const isAdminLike = window.currentAuth?.isAdmin || ['admin','superadmin'].includes(window.currentAuth?.role);
    if (isAdminLike) {
      navigateToPage('users', () => highlightMemberRow(notif.bookingKey));
    } else {
      navigateToPage('members', () => highlightMemberRow(notif.bookingKey));
    }
  }
};

// Helper: navigate sang 1 page bằng cách click sidebar item tương ứng
function navigateToPage(pageId, afterCb) {
  if (typeof window.showPage !== 'function') return;
  let sidebarItem = null;
  document.querySelectorAll('.sidebar-item').forEach(s => {
    if (s.getAttribute('onclick')?.includes("'" + pageId + "'")) sidebarItem = s;
  });
  window.showPage(pageId, sidebarItem);
  if (afterCb) setTimeout(afterCb, 400);
}

function highlightBookingRow(bookingKey) {
  if (!bookingKey) return;
  const cache = window.cache;
  const code = cache?.bookings?.[bookingKey]?.code;
  window._pendingFlashBookingKey = bookingKey;
  window._pendingFlashCode = code;
  console.log('[row-flash] highlightBookingRow:', { bookingKey, code });
  // Multi-attempt: chờ tbody render
  const attempts = [0, 150, 300, 600, 1000, 1500, 2000, 3000];
  attempts.forEach(delay => {
    setTimeout(() => applyFlashByBookingKey(bookingKey, code), delay);
  });
  setTimeout(() => {
    window._pendingFlashBookingKey = null;
    window._pendingFlashCode = null;
  }, 5500);
}

function applyFlashByBookingKey(bookingKey, code) {
  if (!bookingKey && !code) return;
  
  const rows = document.querySelectorAll('#booking-tbody tr');
  if (rows.length === 0) {
    console.log('[row-flash] No rows yet');
    return;
  }
  
  // Skip empty-state row (colspan > 1)
  const dataRows = [...rows].filter(r => {
    const firstTd = r.querySelector('td:first-child');
    return firstTd && firstTd.colSpan <= 1;
  });
  
  if (dataRows.length === 0) {
    console.log('[row-flash] Only empty-state rows');
    return;
  }
  
  let target = null;
  
  // Match 1: outerHTML chứa bookingKey
  if (bookingKey) {
    for (const row of dataRows) {
      if (row.outerHTML.indexOf(bookingKey) !== -1) {
        target = row;
        console.log('[row-flash] Matched by bookingKey');
        break;
      }
    }
  }
  
  // Match 2: row text chứa code
  if (!target && code) {
    for (const row of dataRows) {
      if ((row.textContent || '').indexOf(code) !== -1) {
        target = row;
        console.log('[row-flash] Matched by code');
        break;
      }
    }
  }
  
  if (!target) {
    console.log('[row-flash] No match. Code:', code);
    return;
  }
  
  if (target.classList.contains('row-flash')) return;
  
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  void target.offsetWidth;
  target.classList.add('row-flash');
  console.log('[row-flash] ✓ Class added');
  setTimeout(() => target.classList.remove('row-flash'), 2500);
}

function highlightMemberRow(memberKey) {
  if (!memberKey) return;
  // Selectors thử nhiều: tr[data-key], tr[onclick*='key'], or by text
  const selectors = [
    `tr[data-key="${memberKey}"]`,
    `tr[onclick*="'${memberKey}'"]`,
  ];
  let target = null;
  for (const sel of selectors) {
    target = document.querySelector(sel);
    if (target) break;
  }
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('row-flash');
    setTimeout(() => target.classList.remove('row-flash'), 3500);
  }
}

// ╔════════════════════════════════════════════════════════════════╗
// SHOW/HIDE BELL — cho mọi role authenticated (không chỉ admin)
// ╚════════════════════════════════════════════════════════════════╝
function updateBellVisibility() {
  const wrapper = document.getElementById('bell-wrapper');
  if (!wrapper) return;
  const role = window.currentAuth?.role;
  // Hiển thị cho admin, superadmin, member, viewer (mọi role được duyệt)
  // Ẩn cho pending/rejected/chưa login
  const allowedRoles = ['admin', 'superadmin', 'member', 'viewer'];
  const shouldShow = !!window.currentAuth?.uid && allowedRoles.includes(role);
  wrapper.style.display = shouldShow ? 'block' : 'none';
}

window.addEventListener('auth-update', () => {
  updateBellVisibility();
  updateBellBadge();
});

// ╔════════════════════════════════════════════════════════════════╗
// TRACK NEW NOTIFICATIONS — show toast khi có notif mới
// ╚════════════════════════════════════════════════════════════════╝
let _knownNotifKeys = null;

function checkNewNotifications() {
  const cache = window.cache;
  const uid = window.currentAuth?.uid;
  if (!uid || !cache?.notifications) return;

  const myNotifs = getMyNotifications();
  const currentKeys = myNotifs.map(n => n._key);

  // Lần đầu: chỉ ghi nhận, không toast
  if (_knownNotifKeys === null) {
    _knownNotifKeys = new Set(currentKeys);
    return;
  }

  const newNotifs = myNotifs.filter(n =>
    !_knownNotifKeys.has(n._key) && (!n.readBy || !n.readBy[uid])
  );

  newNotifs.forEach(n => {
    if (typeof window.showToast === 'function') {
      window.showToast(`${n.title}: ${n.message}`, 'info');
      // Make toast clickable to navigate
      setTimeout(() => attachToastClickHandler(n._key), 50);
    }
    pulseBellButton();
  });

  _knownNotifKeys = new Set(currentKeys);
}

function attachToastClickHandler(notifKey) {
  const toastEl = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (!toastEl || !msgEl) return;

  const origText = msgEl.textContent;
  msgEl.innerHTML = origText + ' <span style="margin-left:6px;color:var(--teal);font-weight:700;font-size:14px">→</span>';
  toastEl.style.cursor = 'pointer';

  const handler = (e) => {
    if (e.target.closest('#toast-undo')) return;
    window.handleNotificationClick?.(notifKey);
    toastEl.classList.remove('show');
    cleanup();
  };
  if (toastEl._notifHandler) toastEl.removeEventListener('click', toastEl._notifHandler);
  toastEl._notifHandler = handler;
  toastEl.addEventListener('click', handler);

  const cleanup = () => {
    msgEl.textContent = origText;
    toastEl.style.cursor = '';
    if (toastEl._notifHandler) {
      toastEl.removeEventListener('click', toastEl._notifHandler);
      toastEl._notifHandler = null;
    }
  };
  setTimeout(cleanup, 4000);
}

function pulseBellButton() {
  const bell = document.getElementById('bell-btn');
  if (!bell) return;
  bell.style.animation = 'bell-pulse 0.6s ease-in-out 3';
  setTimeout(() => { bell.style.animation = ''; }, 1900);
}

// Listen cache-update for notifications col
window.addEventListener('cache-update', (e) => {
  if (e.detail?.col === 'notifications') {
    checkNewNotifications();
    updateBellBadge();
    const dropdown = document.getElementById('bell-dropdown');
    if (dropdown && dropdown.style.display === 'block') renderNotifications();
  }
});

// Initial update + periodic re-check
setTimeout(() => { updateBellVisibility(); updateBellBadge(); }, 1000);
setTimeout(() => { updateBellVisibility(); updateBellBadge(); }, 3000);

window.renderNotificationsList = renderNotifications;
console.log('[Notifications] v3 loaded — bell visible for all authenticated roles');
