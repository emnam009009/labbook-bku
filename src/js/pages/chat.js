/**
 * pages/chat.js
 * Chat widget — realtime messaging giữa các user trong lab
 *
 * Features:
 *  - 2 UI modes: page-chat (tab "Chat" trong sidebar) + chat-widget (FAB nổi)
 *  - Realtime listeners cho messages + typing indicators
 *  - Mentions với autocomplete dropdown (@username)
 *  - Reactions (👍 ❤️ 😂 🎉 🔥 👏 😮)
 *  - Image upload (base64)
 *  - Keyboard shortcut "M" để toggle widget
 *  - Tab switching trong widget (chat / ai)
 *
 * Module-level state (8 biến):
 *  - _chatRef, _chatTypingRef: Firebase refs
 *  - _chatListenerOff, _chatTypingOff: unsub functions
 *  - _chatTypingTimer: setTimeout id cho typing indicator
 *  - _chatPendingImage: base64 ảnh đang chờ gửi
 *  - _chatMentionQuery: search query khi gõ @...
 *  - _chatMembers: array tên thành viên dùng cho mention dropdown
 *
 * Phụ thuộc:
 *  - cache, currentAuth, isAdmin qua window
 *  - escapeHtml, escapeJs từ utils/format.js
 *  - db, ref, fbListen, fbSet, fbPush, fbGet từ firebase.js
 *  - updateChatFabBadge từ services/listeners.js
 *  - SUPER_ADMIN_EMAIL constant (hard-code)
 *
 * Init: tất cả document-level event listeners được attach 1 lần qua attachChatListeners()
 *  vì module được import 1 lần khi main.js load.
 */

import { escapeHtml, escapeJs } from '../utils/format.js'
import { db, ref, fbListen, fbSet, fbPush, fbGet } from '../firebase.js'
import { updateChatFabBadge } from '../services/listeners.js'

const SUPER_ADMIN_EMAIL = 'nvhn.7202@gmail.com';
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👏', '😮'];

// ── Module-level state ────────────────────────────────────
let _chatRef = null;
let _chatTypingRef = null;
let _chatListenerOff = null;
let _chatTypingOff = null;
let _chatTypingTimer = null;
let _chatPendingImage = null;
let _chatMentionQuery = '';
let _chatMembers = [];

// ═══════════════════════════════════════════════════════════
// LIFECYCLE: cleanup + init
// ═══════════════════════════════════════════════════════════
export function cleanupChat() {
  if (_chatListenerOff) { try { _chatListenerOff(); } catch (e) {} _chatListenerOff = null; }
  if (_chatTypingOff)   { try { _chatTypingOff();   } catch (e) {} _chatTypingOff = null; }
  if (_chatTypingTimer) { clearTimeout(_chatTypingTimer); _chatTypingTimer = null; }
}

export function initChat() {
  const cache = window.cache;
  if (!cache) return;

  // Cleanup cũ trước khi register mới — tránh duplicate listeners khi vào lại tab chat
  cleanupChat();

  const db2 = window._db || db;
  _chatRef = ref(db2, 'chat/messages');
  _chatTypingRef = ref(db2, 'chat/typing');

  // Load members cho mention dropdown
  _chatMembers = Object.values(cache.members || {}).map(m => m.name).filter(Boolean);

  const msgsEl = document.getElementById('chat-messages');
  if (msgsEl) msgsEl.innerHTML = '';

  // Listen messages
  _chatListenerOff = fbListen('chat/messages', function(data) {
    updateChatFabBadge(true);
    const msgsEl = document.getElementById('chat-messages');
    if (!msgsEl) return;
    if (!data) {
      msgsEl.innerHTML = '<div style="text-align:center;color:var(--text-3);font-size:13px;padding:40px">Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!</div>';
      return;
    }
    renderChatMessages(data);
  });

  // Listen typing indicator
  _chatTypingOff = fbListen('chat/typing', function(data) {
    renderTyping(data || {});
  });
}

// ═══════════════════════════════════════════════════════════
// RENDER: messages + typing indicator
// ═══════════════════════════════════════════════════════════
function renderChatMessages(data) {
  const currentAuth = window.currentAuth || {};
  const msgs = Object.entries(data)
    .map(([k, v]) => ({ _key: k, ...v }))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-100);
  const myUid = currentAuth?.uid;
  const html = msgs.map(m => renderChatMsg(m, myUid)).join('');

  // Render vào CẢ page-chat và widget
  ['chat-messages', 'cw-messages'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    el.innerHTML = html || '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:32px">Chưa có tin nhắn nào.</div>';
    if (wasAtBottom) el.scrollTop = el.scrollHeight;
  });
}

function renderChatMsg(m, myUid) {
  const isMe = m.uid === myUid;
  const time = m.ts ? new Date(m.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
  const initials = (m.name || '?').split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
  const colors = ['var(--teal)', '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
  const color = colors[(m.name || '').length % colors.length];

  // Format text: escape HTML + highlight mentions
  let text = (m.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/@([\w\sÀ-ỹ]+?)(?=\s|$|[,.])/g, '<span style="color:var(--teal);font-weight:600">@$1</span>');

  const reactions = renderReactions(m);

  if (isMe) {
    return `<div style="display:flex;flex-direction:column;align-items:flex-end;margin:6px 0" data-msgkey="${m._key}">
      <div style="display:flex;align-items:flex-end;gap:8px;max-width:70%">
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <div style="background:var(--teal);color:white;border-radius:16px 16px 4px 16px;padding:10px 14px;font-size:13px;line-height:1.5;word-break:break-word">
            ${m.image && /^(data:image\/|https:\/\/)/.test(m.image) ? `<img src="${escapeHtml(m.image)}" style="max-width:200px;max-height:200px;border-radius:8px;display:block;margin-bottom:${m.text ? '8px' : '0'}">` : ''}
            ${text ? `<span>${text}</span>` : ''}
          </div>
          <span style="font-size:11px;color:var(--text-3)">${time}</span>
          ${reactions}
        </div>
      </div>
    </div>`;
  }

  return `<div style="display:flex;align-items:flex-start;gap:8px;margin:6px 0;max-width:70%" data-msgkey="${m._key}">
    <div style="width:32px;height:32px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${escapeHtml(initials)}</div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <span style="font-size:11px;font-weight:600;color:var(--text-2)">${escapeHtml(m.name || 'Ẩn danh')}</span>
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:4px 16px 16px 16px;padding:10px 14px;font-size:13px;line-height:1.5;word-break:break-word;cursor:pointer" onclick="window.showReactionPicker('${m._key}', event)">
        ${m.image && /^(data:image\/|https:\/\/)/.test(m.image) ? `<img src="${escapeHtml(m.image)}" style="max-width:200px;max-height:200px;border-radius:8px;display:block;margin-bottom:${m.text ? '8px' : '0'}">` : ''}
        ${text ? `<span>${text}</span>` : ''}
      </div>
      <span style="font-size:11px;color:var(--text-3)">${time}</span>
      ${reactions}
    </div>
  </div>`;
}

function renderReactions(m) {
  const currentAuth = window.currentAuth || {};
  if (!m.reactions) return '';
  const entries = Object.entries(m.reactions);
  if (!entries.length) return '';
  return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">
    ${entries.map(([emoji, uids]) => {
      const count = Object.keys(uids).length;
      const hasMe = uids[currentAuth?.uid];
      return `<span onclick="window.toggleReaction('${m._key}','${emoji}')" style="cursor:pointer;background:${hasMe ? 'rgba(var(--teal-rgb), 0.15)' : 'var(--surface-2)'};border:1px solid ${hasMe ? 'var(--teal)' : 'var(--border)'};border-radius:20px;padding:2px 8px;font-size:12px;display:inline-flex;align-items:center;gap:3px">${emoji} ${count}</span>`;
    }).join('')}
  </div>`;
}

function renderTyping(data) {
  const currentAuth = window.currentAuth || {};
  const cache = window.cache || {};
  const now = Date.now();
  const typers = Object.entries(data || {})
    .filter(([uid, ts]) => uid !== currentAuth?.uid && now - ts < 4000)
    .map(([uid]) => {
      const m = Object.values(cache.members || {}).find(m => m.uid === uid);
      return m?.name?.split(' ').pop() || 'Ai đó';
    });
  const text = typers.length ? `${typers.join(', ')} đang nhắn tin...` : '';
  ['chat-typing', 'cw-typing'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

// ═══════════════════════════════════════════════════════════
// SEND + INPUT
// ═══════════════════════════════════════════════════════════
export async function chatSend() {
  const currentAuth = window.currentAuth || {};

  // Priority: widget input nếu widget đang mở, không thì page-chat input
  const widget = document.getElementById('chat-widget');
  const widgetOpen = widget && widget.classList.contains('cw-open');
  const widgetInput = document.getElementById('cw-input');
  const pageInput = document.getElementById('chat-input');
  const input = (widgetOpen && widgetInput) ? widgetInput : pageInput;
  const text = input?.value?.trim();
  if (!text && !_chatPendingImage) return;

  const msg = {
    uid: currentAuth.uid,
    name: currentAuth.displayName || currentAuth.email,
    text: text || '',
    ts: Date.now(),
  };

  // Mentions
  const mentions = [...(text || '').matchAll(/@([\w\sÀ-ỹ]+?)(?=\s|$|[,.])/g)].map(m => m[1].trim());
  if (mentions.length) msg.mentions = mentions;

  // Image
  if (_chatPendingImage) {
    msg.image = _chatPendingImage;
    chatClearImage();
  }

  // Clear cả 2 inputs
  if (widgetInput) { widgetInput.value = ''; widgetInput.style.height = 'auto'; }
  if (pageInput)   { pageInput.value = '';   pageInput.style.height = 'auto'; }

  // Clear typing
  clearTimeout(_chatTypingTimer);
  await fbSet('chat/typing/' + currentAuth.uid, null);

  await fbPush('chat/messages', msg);
}

export function chatInput(el) {
  const currentAuth = window.currentAuth || {};

  // Auto resize: widget max 80px, page-chat max 120px
  const maxH = el.id === 'cw-input' ? 80 : 120;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, maxH) + 'px';

  // Typing indicator
  if (db && currentAuth?.uid) {
    fbSet('chat/typing/' + currentAuth.uid, Date.now());
    clearTimeout(_chatTypingTimer);
    _chatTypingTimer = setTimeout(() => {
      fbSet('chat/typing/' + currentAuth.uid, null);
    }, 3000);
  }

  // Mention detection
  const val = el.value;
  const cursor = el.selectionStart;
  const before = val.slice(0, cursor);
  const atMatch = before.match(/@([\w\sÀ-ỹ]*)$/);
  if (atMatch) {
    _chatMentionQuery = atMatch[1].toLowerCase();
    showMentionDropdown(_chatMentionQuery);
  } else {
    hideMentionDropdown();
  }
}

// ═══════════════════════════════════════════════════════════
// MENTIONS
// ═══════════════════════════════════════════════════════════
function showMentionDropdown(query) {
  const widget = document.getElementById('chat-widget');
  const widgetOpen = widget && widget.classList.contains('cw-open');
  const ddId = widgetOpen ? 'cw-mention-dropdown' : 'chat-mention-dropdown';
  const dd = document.getElementById(ddId);
  if (!dd) return;
  const filtered = _chatMembers.filter(n => n.toLowerCase().includes(query));
  if (!filtered.length) { hideMentionDropdown(); return; }
  dd.innerHTML = filtered.map(n =>
    `<div onclick="window.insertMention('${escapeJs(n)}')" style="padding:8px 12px;border-radius:8px;cursor:pointer;font-size:13px;color:var(--text)" onmouseover="this.style.background='var(--teal-light)'" onmouseout="this.style.background=''">@${escapeHtml(n)}</div>`
  ).join('');
  dd.style.display = 'block';
}

function hideMentionDropdown() {
  ['chat-mention-dropdown', 'cw-mention-dropdown'].forEach(id => {
    const dd = document.getElementById(id);
    if (dd) dd.style.display = 'none';
  });
}

export function insertMention(name) {
  const widget = document.getElementById('chat-widget');
  const widgetOpen = widget && widget.classList.contains('cw-open');
  const input = document.getElementById(widgetOpen ? 'cw-input' : 'chat-input');
  if (!input) return;
  const val = input.value;
  const cursor = input.selectionStart;
  const before = val.slice(0, cursor).replace(/@[\w\sÀ-ỹ]*$/, '');
  const after = val.slice(cursor);
  input.value = before + '@' + name + ' ' + after;
  hideMentionDropdown();
  input.focus();
}

// ═══════════════════════════════════════════════════════════
// KEYDOWN
// ═══════════════════════════════════════════════════════════
export function chatKeydown(e) {
  const dd = document.getElementById('chat-mention-dropdown');
  if (dd && dd.style.display !== 'none') {
    if (e.key === 'Escape') { hideMentionDropdown(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatSend();
  }
}

// ═══════════════════════════════════════════════════════════
// IMAGE
// ═══════════════════════════════════════════════════════════
export function chatPickImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _chatPendingImage = e.target.result; // base64
    ['chat-img-thumb', 'cw-img-thumb'].forEach(id => {
      const t = document.getElementById(id);
      if (t) t.src = _chatPendingImage;
    });
    ['chat-img-preview', 'cw-img-preview'].forEach(id => {
      const p = document.getElementById(id);
      if (p) p.style.display = 'flex';
    });
  };
  reader.readAsDataURL(file);
  input.value = '';
}

export function chatClearImage() {
  _chatPendingImage = null;
  ['chat-img-preview', 'cw-img-preview'].forEach(id => {
    const p = document.getElementById(id);
    if (p) p.style.display = 'none';
  });
}

// ═══════════════════════════════════════════════════════════
// REACTIONS
// ═══════════════════════════════════════════════════════════
export function showReactionPicker(msgKey, e) {
  e.stopPropagation();
  let picker = document.getElementById('chat-reaction-picker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'chat-reaction-picker';
    picker.style.cssText = 'position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:6px 10px;display:flex;gap:6px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15)';
    document.body.appendChild(picker);
    document.addEventListener('click', () => picker.style.display = 'none', { once: false });
  }
  picker.innerHTML = REACTION_EMOJIS.map(em =>
    `<span onclick="window.toggleReaction('${msgKey}','${em}');this.closest('#chat-reaction-picker').style.display='none'" style="cursor:pointer;font-size:20px;padding:2px;border-radius:6px;transition:transform 0.1s" onmouseover="this.style.transform='scale(1.3)'" onmouseout="this.style.transform='scale(1)'">${em}</span>`
  ).join('');
  const rect = e.currentTarget.getBoundingClientRect();
  picker.style.display = 'flex';
  picker.style.top = (rect.top - 50) + 'px';
  picker.style.left = rect.left + 'px';
}

export async function toggleReaction(msgKey, emoji) {
  const currentAuth = window.currentAuth || {};
  const uid = currentAuth?.uid;
  if (!uid) return;
  const reactionPath = `chat/messages/${msgKey}/reactions/${emoji}/${uid}`;
  const snap = await fbGet(reactionPath);
  if (snap) {
    await fbSet(reactionPath, null);
  } else {
    await fbSet(reactionPath, true);
  }
}

// ═══════════════════════════════════════════════════════════
// CHAT WIDGET (FAB)
// ═══════════════════════════════════════════════════════════
export function toggleChatWidget(forceOpen) {
  const currentAuth = window.currentAuth || {};
  const w = document.getElementById('chat-widget');
  if (!w) return;
  // Block viewer access (defense-in-depth, CSS đã ẩn FAB)
  if (currentAuth.role === 'viewer') return;

  const isOpen = w.classList.contains('cw-open');
  const willOpen = (forceOpen !== undefined) ? !!forceOpen : !isOpen;

  if (willOpen) {
    w.classList.remove('hidden');
    void w.offsetWidth;  // force reflow để animation chạy
    w.classList.add('cw-open');
    w.setAttribute('aria-hidden', 'false');

    // Init chat data nếu chưa có (idempotent)
    if (!_chatListenerOff) {
      initChat();
    }

    setTimeout(() => {
      const input = document.getElementById('cw-input');
      if (input) input.focus();
      const msgsEl = document.getElementById('cw-messages');
      if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    }, 200);
  } else {
    w.classList.remove('cw-open');
    w.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!w.classList.contains('cw-open')) w.classList.add('hidden');
    }, 200);
  }
}

// Show AI tab chỉ cho superadmin
export function _updateChatWidgetRole() {
  const currentAuth = window.currentAuth || {};
  const aiTab = document.querySelector('.chat-widget .cw-tab-ai');
  if (!aiTab) return;
  const isSuper = currentAuth.email === SUPER_ADMIN_EMAIL;
  aiTab.style.display = isSuper ? 'inline-block' : 'none';
}

// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS (attach 1 lần ở module init)
// ═══════════════════════════════════════════════════════════
let _listenersAttached = false;
function attachChatListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;

  // pageChange event: init chat khi vào tab "Chat"
  document.addEventListener('pageChange', ({ detail: { id } }) => {
    document.body.classList.toggle('chat-active', id === 'chat');
    if (id === 'chat') {
      setTimeout(() => {
        initChat();
        const msgsEl = document.getElementById('chat-messages');
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
      }, 100);
    }
  });

  // Widget send button
  document.addEventListener('click', function(e) {
    if (e.target.closest('#cw-send')) {
      e.preventDefault();
      chatSend();
    }
  });

  // Widget input keydown: Enter to send
  document.addEventListener('keydown', function(e) {
    if (e.target.id !== 'cw-input') return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatSend();
      return;
    }
  });

  // Widget + page input: hook chatInput logic (typing + mention + auto-resize)
  document.addEventListener('input', function(e) {
    if (e.target.id === 'cw-input' || e.target.id === 'chat-input') {
      chatInput(e.target);
    }
  });

  // Tab switching trong widget
  document.addEventListener('click', function(e) {
    const tabBtn = e.target.closest('.cw-tab');
    if (!tabBtn) return;
    const tab = tabBtn.dataset.tab;
    if (!tab) return;
    document.querySelectorAll('.chat-widget .cw-tab').forEach(b => b.classList.toggle('cw-tab-active', b === tabBtn));
    document.querySelectorAll('.chat-widget .cw-pane').forEach(p => {
      p.classList.toggle('cw-pane-active', p.id === 'cw-tab-' + tab);
    });
  });

  // Click outside widget → close
  document.addEventListener('click', function(e) {
    const w = document.getElementById('chat-widget');
    const fab = document.getElementById('chat-fab');
    if (!w || !w.classList.contains('cw-open')) return;
    if (w.contains(e.target)) return;
    if (fab && fab.contains(e.target)) return;
    toggleChatWidget(false);
  });

  // Keyboard shortcut "M" để toggle widget
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'm' && e.key !== 'M') return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const currentAuth = window.currentAuth || {};
    if (currentAuth.role === 'viewer') return;
    e.preventDefault();
    toggleChatWidget();
  });
}
attachChatListeners();
