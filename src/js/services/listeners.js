/**
 * services/listeners.js
 * Firebase realtime listeners cho 9 collections + users + settings
 *
 * Thiết kế:
 *  - cache: object dùng chung (truyền vào từ main.js qua window.cache)
 *  - currentAuth: đọc qua window.currentAuth (auth.js gắn lúc runtime)
 *  - renderAll, renderUsers, renderMembers, updateGroupSelects: gọi qua
 *    window.* runtime để tránh circular import (các module này chưa được tách)
 *
 * State module-level:
 *  - _listenersStarted: flag tránh đăng ký 2 lần
 *  - _unsubs[]: lưu unsubscribe functions của 9 collections
 *  - _usersUnsub: tách riêng vì cần re-register khi auth role thay đổi
 */

import { fbListen } from '../firebase.js'
import { startPresence } from './presence.js'
import { auth } from '../firebase.js'

const SUPER_ADMIN_EMAIL = 'nvhn.7202@gmail.com';

let _listenersStarted = false;
let _unsubs = [];
let _usersUnsub = null;

// ── Đăng ký listeners cho tất cả collections ────────────
// Gọi sau khi user đã login thành công (initAuth onLogin callback)
export function startListeners() {
  // (Re)register users listener — unsub cái cũ trước để tránh leak khi onLogin trigger lại
  if (_usersUnsub) {
    try { _usersUnsub(); } catch (e) {}
    _usersUnsub = null;
  }
  _usersUnsub = fbListen('users', function(users) {
    if (!users) return;
    Object.entries(users).forEach(([uid, u]) => {
      if (u.email === SUPER_ADMIN_EMAIL) {
        window.__superAdminUid = uid;
      }
    });
    if (window.cache) window.cache._users = users;
    if (window.currentAuth?.isAdmin && typeof window.renderUsers === 'function') {
      window.renderUsers();
      if (typeof window.populateMemberFilters === 'function') window.populateMemberFilters();
    }
  });

  // Start presence cho user hiện tại (đăng ký onDisconnect)
  if (auth.currentUser) {
    startPresence(auth.currentUser.uid);
  }

  if (_listenersStarted) return;
  _listenersStarted = true;

  const cols = ['hydro', 'electrode', 'electrochem', 'chemicals',
                'members', 'history', 'ink', 'equipment', 'groups', 'bookings', 'notifications', 'presence'];

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
