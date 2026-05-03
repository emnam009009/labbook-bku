/**
 * services/listeners.js
 * Firebase realtime listeners cho 9 collections + users + settings
 *
 * Phase 2A — Commit 1 changes:
 *  - Bỏ hardcoded SUPER_ADMIN_EMAIL (giờ check qua role 'superadmin' trong /users)
 *  - history listener CHỈ start cho admin/superadmin (member/viewer skip → tránh
 *    permission_denied loop)
 *  - users listener vẫn start cho mọi role (để hiển thị tên người gửi message,
 *    member name, ...) NHƯNG dùng fbGet một lần cho non-admin (không live update)
 *
 * Thiết kế cũ (giữ lại):
 *  - cache: object dùng chung (truyền vào từ main.js qua window.cache)
 *  - currentAuth: đọc qua window.currentAuth (auth.js gắn lúc runtime)
 *  - renderAll, renderUsers, renderMembers, updateGroupSelects: gọi qua
 *    window.* runtime để tránh circular import
 *
 * State module-level:
 *  - _listenersStarted: flag tránh đăng ký 2 lần
 *  - _unsubs[]: lưu unsubscribe functions
 *  - _usersUnsub, _historyUnsub: tách riêng vì bật/tắt theo role
 */

import { fbListen, fbGet, auth } from '../firebase.js'
import { startPresence } from './presence.js'

let _listenersStarted = false;
let _unsubs = [];
let _usersUnsub = null;
let _historyUnsub = null;

// ── Helper: kiểm tra role qua window.currentAuth ────────
// Tránh import từ auth.js để giữ pattern tránh circular imports
function _isAdminLike() {
  const a = window.currentAuth;
  return !!(a && (a.isAdmin || a.role === 'admin' || a.role === 'superadmin'));
}

function _isSuperAdmin() {
  const a = window.currentAuth;
  return !!(a && (a.isSuperAdmin || a.role === 'superadmin'));
}

// ── Đăng ký listeners cho tất cả collections ────────────
// Gọi sau khi user đã login thành công (initAuth onLogin callback)
export function startListeners() {
  // ── USERS LISTENER ──
  // Cleanup cũ nếu có
  if (_usersUnsub) {
    try { _usersUnsub(); } catch (e) {}
    _usersUnsub = null;
  }

  if (_isAdminLike()) {
    // Admin: subscribe live để thấy user mới register, role changes
    _usersUnsub = fbListen('users', function(users) {
      if (!users) return;
      // Tìm super admin uid để các module khác (notifications, ...) ref được
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
    // Non-admin: chỉ cần map uid → email/name 1 lần (cho chat, members display, ...)
    // Không subscribe live vì rules có thể chỉ cho phép đọc users/$uid của chính mình.
    // Dùng fbGet thay vì listener để tránh spam permission_denied.
    fbGet('users').then(users => {
      if (!users) return;
      Object.entries(users).forEach(([uid, u]) => {
        if (u && u.role === 'superadmin') {
          window.__superAdminUid = uid;
        }
      });
      if (window.cache) window.cache._users = users;
    }).catch(err => {
      // Member không có quyền đọc /users (rule .read root level cho admin only)
      // → fallback đọc users/{auth.uid} của chính mình
      if (auth.currentUser) {
        fbGet('users/' + auth.currentUser.uid).then(self => {
          if (self && window.cache) {
            window.cache._users = { [auth.currentUser.uid]: self };
          }
        }).catch(() => { /* silent */ });
      }
    });
  }

  // ── PRESENCE ──
  // Start presence cho user hiện tại (đăng ký onDisconnect)
  if (auth.currentUser) {
    startPresence(auth.currentUser.uid);
  }

  // ── Tránh đăng ký 2 lần các collection chính ──
  if (_listenersStarted) return;
  _listenersStarted = true;

  // Collections subscribed cho mọi authenticated user (active role)
  // KHÔNG bao gồm 'history' vì rule .read chỉ cho admin
  const cols = ['hydro', 'electrode', 'electrochem', 'chemicals',
                'members', 'ink', 'equipment', 'groups', 'bookings',
                'notifications', 'presence'];

  cols.forEach(function(col) {
    _unsubs.push(fbListen(col, function(data) {
      if (window.cache) window.cache[col] = data || {};
      // Dispatch event cho các module lắng nghe (booking, member-filter, ...)
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

  // ── HISTORY LISTENER (admin only) ──
  // Member/viewer KHÔNG subscribe vì rule .read chỉ cho admin/superadmin
  // → Tránh permission_denied error loop trong console
  if (_isAdminLike()) {
    _historyUnsub = fbListen('history', function(data) {
      if (window.cache) window.cache.history = data || {};
      window.dispatchEvent(new CustomEvent('cache-update', { detail: { col: 'history' } }));
      if (typeof window.renderHistory === 'function') window.renderHistory();
    });
  } else {
    // Non-admin: cache.history vẫn cần tồn tại (initialized rỗng) cho các code
    // legacy không null-check
    if (window.cache && !window.cache.history) window.cache.history = {};
  }

  // Settings: subtitle hiển thị dưới tên lab (Lab Manager BKU)
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
// (Để ở đây vì liên quan trạng thái chat từ listener; có thể move sang chat module ở Phần 7)
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
