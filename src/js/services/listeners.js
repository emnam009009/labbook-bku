/**
 * services/listeners.js
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
import { startPresence } from './presence.js'

// ── Config: collections dùng query với limit ────────────
// Tăng limit khi cần — trade-off memory vs data coverage.
// Tại 500 records: ~1MB/collection memory, đủ cho dashboard + recent views.
// Cần xem records cũ hơn → tính năng Reports (Phase 3) sẽ query date range riêng.
const LARGE_COLLECTIONS_CONFIG = {
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
  'notifications', // Per-user, đã filter theo rule
  'presence',      // Online status, lightweight
];

let _listenersStarted = false;
let _unsubs = [];
let _usersUnsub = null;
let _historyUnsub = null;

// ── Helpers role check (tránh import auth.js → circular) ─
function _isAdminLike() {
  const a = window.currentAuth;
  return !!(a && (a.isAdmin || a.role === 'admin' || a.role === 'superadmin'));
}

// ── Đăng ký listeners cho tất cả collections ────────────
// Gọi sau khi user đã login thành công (initAuth onLogin callback)
export function startListeners() {
  // ── USERS LISTENER ──
  if (_usersUnsub) {
    try { _usersUnsub(); } catch (e) {}
    _usersUnsub = null;
  }

  if (_isAdminLike()) {
    // Admin: subscribe live để thấy user mới register, role changes
    _usersUnsub = fbListen('users', function(users) {
      if (!users) return;
      Object.entries(users).forEach(([uid, u]) => {
        if (u && u.role === 'superadmin') {
          window.__superAdminUid = uid;
        }
      });
      if (window.cache) window.cache._users = users;
      if (typeof window.renderUsers === 'function') {
        window.renderUsers();
        if (typeof window.populateMemberFilters === 'function') window.populateMemberFilters();
      }
    });
  } else {
    // Non-admin: chỉ cần map uid → email/name 1 lần (cho chat, members display)
    fbGet('users').then(users => {
      if (!users) return;
      Object.entries(users).forEach(([uid, u]) => {
        if (u && u.role === 'superadmin') {
          window.__superAdminUid = uid;
        }
      });
      if (window.cache) window.cache._users = users;
    }).catch(() => {
      // Member không có quyền đọc /users → fallback đọc users/{auth.uid}
      if (auth.currentUser) {
        fbGet('users/' + auth.currentUser.uid).then(self => {
          if (self && window.cache) {
            window.cache._users = { [auth.currentUser.uid]: self };
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
    _unsubs.push(fbListenQuery(col, opts, function(data) {
      if (window.cache) window.cache[col] = data || {};
      window.dispatchEvent(new CustomEvent('cache-update', { detail: { col } }));
      if (typeof window.renderAll === 'function') window.renderAll();
    }));
  });

  // ── SMALL COLLECTIONS: full listen ──
  SMALL_COLLECTIONS.forEach(function(col) {
    _unsubs.push(fbListen(col, function(data) {
      if (window.cache) window.cache[col] = data || {};
      window.dispatchEvent(new CustomEvent('cache-update', { detail: { col } }));
      if (typeof window.renderAll === 'function') window.renderAll();
      if (col === 'groups' && typeof window.updateGroupSelects === 'function') {
        window.updateGroupSelects();
      }
      if (col === 'members' && typeof window.renderMembers === 'function') {
        window.renderMembers();
        if (typeof window.populateMemberFilters === 'function') window.populateMemberFilters();
      }
    }));
  });

  // ── HISTORY (admin only) ──
  if (_isAdminLike()) {
    // History có thể grow rất lớn → cũng dùng limit 500 records gần nhất
    _historyUnsub = fbListenQuery('history', { orderBy: 'ts', limitLast: 500 }, function(data) {
      if (window.cache) window.cache.history = data || {};
      window.dispatchEvent(new CustomEvent('cache-update', { detail: { col: 'history' } }));
      if (typeof window.renderHistory === 'function') window.renderHistory();
    });
  } else {
    if (window.cache && !window.cache.history) window.cache.history = {};
  }

  // Settings: subtitle hiển thị dưới tên lab
  _unsubs.push(fbListen('settings/subtitle', function(data) {
    if (data && data.value) {
      const el = document.getElementById('lab-subtitle');
      if (el) el.textContent = data.value;
    }
  }));
}

// ── Hủy tất cả listeners (gọi khi logout) ───────────────
export function stopListeners() {
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
export function updateChatFabBadge(hasNew) {
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
