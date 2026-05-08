/**
 * services/listeners.ts
 * Firebase realtime listeners cho 9 collections + users + settings
 *
 * Phase 2A — Commit 2 changes:
 *  - Áp dụng limit 500 records gần nhất cho các collections growth-rate cao:
 *    hydro, electrode, electrochem, bookings, ink
 *  - orderBy: 'createdAt' (records mới có field này)
 *  - Các collections nhỏ (chemicals, equipment, members, groups, eq_groups,
 *    notifications, presence) giữ nguyên fbListen full
 *
 * Phase 2A — Commit 1 (giữ):
 *  - Bỏ hardcoded SUPER_ADMIN_EMAIL (giờ check qua role 'superadmin')
 *  - history listener CHỈ start cho admin/superadmin
 *  - users listener: live cho admin, fbGet 1 lần cho non-admin
 *
 * Thiết kế cũ (giữ):
 *  - cache: object dùng chung (truyền vào từ main.js qua window.cache)
 *  - currentAuth: đọc qua window.currentAuth
 *  - renderAll, renderUsers, renderMembers, updateGroupSelects: gọi qua window.*
 */

import { fbListen, fbListenQuery, fbGet, auth } from '../firebase.js'
import { startPresence, stopPresence } from './presence.js'

interface QueryOpts {
  orderBy: string;
  limitLast: number;
}

type UnsubFn = () => void;

// ── Config: collections dùng query với limit ────────────
// Tăng limit khi cần — trade-off memory vs data coverage.
// Tại 500 records: ~1MB/collection memory, đủ cho dashboard + recent views.
// Cần xem records cũ hơn → tính năng Reports (Phase 3) sẽ query date range riêng.
const LARGE_COLLECTIONS_CONFIG: Record<string, QueryOpts> = {
  hydro:       { orderBy: 'createdAt', limitLast: 500 },
  electrode:   { orderBy: 'createdAt', limitLast: 500 },
  electrochem: { orderBy: 'createdAt', limitLast: 500 },
  bookings:    { orderBy: 'createdAt', limitLast: 500 },
  ink:         { orderBy: 'createdAt', limitLast: 500 },
};

// Collections nhỏ — full listen (không limit)
const SMALL_COLLECTIONS = [
  'chemicals',     // Hóa chất, growth rate thấp
  'members',       // Thành viên lab, thường <100
  'equipment',     // Thiết bị, thường <50
  'groups',        // Nhóm hóa chất, thường <20
  'eq_groups',     // Nhóm thiết bị, thường <20
  // 'notifications' đã chuyển sang nested per-user (R122) — listen riêng dưới
  'presence',      // Online status, lightweight
];

let _listenersStarted = false;
let _unsubs: UnsubFn[] = [];
let _usersUnsub: UnsubFn | null = null;
let _historyUnsub: UnsubFn | null = null;

// ── Helpers role check (tránh import auth.js → circular) ─
function _isAdminLike(): boolean {
  const a = window.currentAuth as any;
  return !!(a && (a.isAdmin || a.role === 'admin' || a.role === 'superadmin'));
}

// ── Đăng ký listeners cho tất cả collections ────────────
// Gọi sau khi user đã login thành công (initAuth onLogin callback)
export function startListeners(): void {
  // ── USERS LISTENER ──
  if (_usersUnsub) {
    try { _usersUnsub(); } catch (e) {}
    _usersUnsub = null;
  }

  if (_isAdminLike()) {
    // Admin: subscribe live để thấy user mới register, role changes
    _usersUnsub = fbListen('users', function(users: Record<string, any> | null) {
      if (!users) return;
      Object.entries(users).forEach(([uid, u]: [string, any]) => {
        if (u && u.role === 'superadmin') {
          window.__superAdminUid = uid;
        }
      });
      if (window.cache) (window.cache as any)._users = users;
      if (typeof (window as any).renderUsers === 'function') {
        (window as any).renderUsers();
        if (typeof (window as any).populateMemberFilters === 'function') (window as any).populateMemberFilters();
      }
    });
  } else {
    // Non-admin: chỉ cần map uid → email/name 1 lần (cho chat, members display)
    fbGet('users').then((users: Record<string, any> | null) => {
      if (!users) return;
      Object.entries(users).forEach(([uid, u]: [string, any]) => {
        if (u && u.role === 'superadmin') {
          window.__superAdminUid = uid;
        }
      });
      if (window.cache) (window.cache as any)._users = users;
    }).catch(() => {
      // Member không có quyền đọc /users → fallback đọc users/{auth.uid}
      if (auth.currentUser) {
        fbGet('users/' + auth.currentUser.uid).then((self: any) => {
          if (self && window.cache) {
            (window.cache as any)._users = { [auth.currentUser!.uid]: self };
          }
        }).catch(() => { /* silent */ });
      }
    });
  }

  // ── PRESENCE: registers onDisconnect ──
  if (auth.currentUser) {
    startPresence(auth.currentUser.uid);
  }

  if (_listenersStarted) return;
  _listenersStarted = true;

  // ── LARGE COLLECTIONS: query với limit ──
  // fbListenQuery dùng orderByChild + limitToLast → server chỉ trả về N records
  // mới nhất, giảm bandwidth + memory rất đáng kể khi data scale.
  Object.entries(LARGE_COLLECTIONS_CONFIG).forEach(([col, opts]) => {
    _unsubs.push(fbListenQuery(col, opts, function(data: Record<string, any> | null) {
      if (window.cache) (window.cache as any)[col] = data || {};
      window.dispatchEvent(new CustomEvent('cache-update', { detail: { col } }));
      if (typeof (window as any).renderAll === 'function') (window as any).renderAll();
    }));
  });

  // ── SMALL COLLECTIONS: full listen ──
  SMALL_COLLECTIONS.forEach(function(col) {
    _unsubs.push(fbListen(col, function(data: Record<string, any> | null) {
      if (window.cache) (window.cache as any)[col] = data || {};
      window.dispatchEvent(new CustomEvent('cache-update', { detail: { col } }));
      if (typeof (window as any).renderAll === 'function') (window as any).renderAll();
      if (col === 'groups' && typeof (window as any).updateGroupSelects === 'function') {
        (window as any).updateGroupSelects();
      }
      if (col === 'members' && typeof (window as any).renderMembers === 'function') {
        (window as any).renderMembers();
        if (typeof (window as any).populateMemberFilters === 'function') (window as any).populateMemberFilters();
      }
    }));
  });

  // ── NOTIFICATIONS per-user (R122 nested schema) ──
  // Path: notifications/{myUid} — chỉ listen của user hiện tại.
  // Cache layout: cache.notifications = { [uid]: { [notifId]: notif } }
  // — chỉ uid hiện tại có data, các uid khác sẽ undefined ở client.
  if (auth.currentUser) {
    const myUid = auth.currentUser.uid;
    _unsubs.push(fbListen(`notifications/${myUid}`, function(data: Record<string, any> | null) {
      if (!window.cache) return;
      const cache = window.cache as any;
      if (!cache.notifications || typeof cache.notifications !== 'object') {
        cache.notifications = {};
      }
      cache.notifications[myUid] = data || {};
      window.dispatchEvent(new CustomEvent('cache-update', { detail: { col: 'notifications' } }));
      if (typeof (window as any).renderAll === 'function') (window as any).renderAll();
    }));
    // Admin/superadmin: listen thêm path _admin (broadcast fallback khi
    // member không có quyền fetch users để fan-out)
    if (_isAdminLike()) {
      _unsubs.push(fbListen('notifications/_admin', function(data: Record<string, any> | null) {
        if (!window.cache) return;
        const cache = window.cache as any;
        if (!cache.notifications || typeof cache.notifications !== 'object') {
          cache.notifications = {};
        }
        // Merge _admin notifs vào bucket của uid hiện tại để render thấy
        // (vì getMyNotifications đọc từ cache.notifications[uid])
        const merged = { ...(cache.notifications[myUid] || {}), ...(data || {}) };
        cache.notifications[myUid] = merged;
        window.dispatchEvent(new CustomEvent('cache-update', { detail: { col: 'notifications' } }));
        if (typeof (window as any).renderAll === 'function') (window as any).renderAll();
      }));
    }
  }

  // ── HISTORY (admin only) ──
  if (_isAdminLike()) {
    // History có thể grow rất lớn → cũng dùng limit 500 records gần nhất
    _historyUnsub = fbListenQuery('history', { orderBy: 'ts', limitLast: 500 }, function(data: Record<string, any> | null) {
      if (window.cache) (window.cache as any).history = data || {};
      window.dispatchEvent(new CustomEvent('cache-update', { detail: { col: 'history' } }));
      if (typeof (window as any).renderHistory === 'function') (window as any).renderHistory();
    });
  } else {
    if (window.cache && !(window.cache as any).history) (window.cache as any).history = {};
  }

  // Settings: subtitle hiển thị dưới tên lab
  _unsubs.push(fbListen('settings/subtitle', function(data: any) {
    if (data && data.value) {
      const el = document.getElementById('lab-subtitle');
      if (el) el.textContent = data.value;
    }
  }));
}

// ── Hủy tất cả listeners (gọi khi logout) ───────────────
export function stopListeners(): void {
  // Round 52 fix: stop presence truoc -> server biet user offline ngay
  // (truoc day phai cho onDisconnect ban -> co the lag vai giay)
  try { stopPresence(); } catch (e) {}

  _unsubs.forEach(fn => {
    try { fn && fn(); } catch (e) {}
  });
  _unsubs.length = 0;
  if (_usersUnsub) {
    try { _usersUnsub(); } catch (e) {}
    _usersUnsub = null;
  }
  if (_historyUnsub) {
    try { _historyUnsub(); } catch (e) {}
    _historyUnsub = null;
  }
  _listenersStarted = false;
}

// ── Helper UI: badge "tin nhắn mới" trên FAB chat ───────
export function updateChatFabBadge(hasNew: boolean): void {
  const badge = document.getElementById('chat-fab-badge');
  if (!badge) return;
  const chatPage = document.getElementById('page-chat');
  const chatActive = chatPage && chatPage.classList.contains('active');
  if (hasNew && !chatActive) {
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}
