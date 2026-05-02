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
import { db, ref, fbListen, fbSet, fbPush, fbGet, update, remove } from '../firebase.js'
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
    // Luôn gọi renderChatMessages — handle cả null (qua guard data || {} bên trong)
    // → đảm bảo cả 2 element chat-messages + cw-messages đều được update
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
  const myUidEarly = currentAuth?.uid;
  // Guard: khi DB node bị xóa hoặc chưa có data, Firebase trả về null
  const safeData = data || {};
  const msgs = Object.entries(safeData)
    .map(([k, v]) => ({ _key: k, ...v }))
    // Filter tin đã "gỡ chỉ phía mình" (hiddenFor[myUid] === true)
    .filter(m => !(m.hiddenFor && myUidEarly && m.hiddenFor[myUidEarly]))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-100);
  const myUid = currentAuth?.uid;
  // Insert date separator giữa các nhóm ngày
  let lastTs = null;
  let prevMsg = null;
  const html = msgs.map(m => {
    let separator = '';
    if (m.ts && (lastTs === null || !isSameDayTs(lastTs, m.ts))) {
      separator = `<div style="display:flex;align-items:center;gap:10px;margin:14px 0 6px;color:var(--text-3);font-size:11px;font-weight:500">
        <div style="flex:1;height:1px;background:var(--border)"></div>
        <span>${formatDateSeparator(m.ts)}</span>
        <div style="flex:1;height:1px;background:var(--border)"></div>
      </div>`;
      prevMsg = null;  // Reset grouping qua ngày mới
    }
    lastTs = m.ts;
    const rendered = renderChatMsg(m, myUid, prevMsg);
    prevMsg = m;
    return separator + rendered;
  }).join('');

  // Detect tin mới nhất là của mình (vừa gửi xong) → luôn scroll xuống
  const lastMsg = msgs[msgs.length - 1];
  const myNewMessage = lastMsg && lastMsg.uid === myUid && lastMsg.ts && (Date.now() - lastMsg.ts) < 3000;

  // Render vào CẢ page-chat và widget
  ['chat-messages', 'cw-messages'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    const shouldScroll = wasAtBottom || myNewMessage;
    el.innerHTML = html || `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:48px 24px;text-align:center;color:#94a3b8">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--teal-light,#f0fdfa),#e0f2fe);display:flex;align-items:center;justify-content:center;margin-bottom:6px">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div style="font-size:14px;font-weight:600;color:var(--text-2,#475569)">Chưa có tin nhắn</div>
        <div style="font-size:12px;color:#94a3b8">Hãy bắt đầu cuộc trò chuyện</div>
      </div>`;
    if (shouldScroll) {
      // Smooth scroll xuống bottom (delay 1 frame để DOM kịp render)
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      });
    }
  });
}

// Date separator format: Hôm nay / Hôm qua / Thứ Hai / 26/04/2026
function formatDateSeparator(ts) {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - date) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays > 0 && diffDays < 7) {
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    return dayNames[date.getDay()];
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function isSameDayTs(ts1, ts2) {
  if (!ts1 || !ts2) return false;
  const d1 = new Date(ts1), d2 = new Date(ts2);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// Smart timestamp: vừa xong / 5 phút trước / 06:13 / T2 06:13 / 26/04 06:13
function formatChatTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const date = new Date(ts);
  const diff = now - ts;
  const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const isToday = ts >= startToday.getTime();

  if (diff < MIN) return 'vừa xong';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} phút trước`;
  const hhmm = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return hhmm;
  if (diff < 7 * DAY) {
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return `${dayNames[date.getDay()]} ${hhmm}`;
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm} ${hhmm}`;
}

function renderChatMsg(m, myUid, prevMsg) {
  const isMe = m.uid === myUid;
  const currentAuth = window.currentAuth || {};
  const isSuperAdmin = currentAuth.email === SUPER_ADMIN_EMAIL;
  // Cho phép superadmin gỡ mọi tin (kể cả của user khác)
  const canRecall = isMe || isSuperAdmin;

  // Tin đã recall everyone → render tombstone
  if (m.recalled === true) {
    const time = formatChatTime(m.ts);
    const timeFull = m.ts ? new Date(m.ts).toLocaleString('vi-VN') : '';
    const align = isMe ? 'flex-end' : 'flex-start';
    return `<div style="display:flex;flex-direction:column;align-items:${align};margin:6px 0" data-msgkey="${m._key}">
      <div style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--surface-2);border:1px dashed var(--border);border-radius:14px;color:var(--text-3);font-size:12px;font-style:italic">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Tin nhắn đã được thu hồi
      </div>
      <span style="font-size:11px;color:var(--text-3);margin-top:2px" title="${timeFull}">${time}</span>
    </div>`;
  }

  // Group consecutive messages: cùng user + cách <5 phút + cùng ngày
  const GROUP_GAP_MS = 5 * 60 * 1000;
  const isGrouped = !!(prevMsg
    && prevMsg.uid === m.uid
    && m.ts && prevMsg.ts
    && (m.ts - prevMsg.ts) < GROUP_GAP_MS
    && isSameDayTs(m.ts, prevMsg.ts)
  );
  const time = formatChatTime(m.ts);
  const timeFull = m.ts ? new Date(m.ts).toLocaleString('vi-VN') : '';
  const initials = (m.name || '?').split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
  const colors = ['var(--teal)', '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
  const color = colors[(m.name || '').length % colors.length];

  // Format text: escape HTML + highlight mentions
  let text = (m.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/@([\w\sÀ-ỹ]+?)(?=\s|$|[,.])/g, '<span style="color:var(--teal);font-weight:600">@$1</span>');

  const reactions = renderReactions(m);

  if (isMe) {
    const recallBtn = `<button onclick="window.showRecallMenu('${m._key}', ${m.ts || 0}, true, this); event.stopPropagation()" class="msg-recall-btn" style="opacity:0;background:var(--surface-2);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-2);transition:opacity 0.15s;flex-shrink:0;padding:0" title="Tùy chọn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
    </button>`;
    return `<div class="chat-msg-row" style="display:flex;flex-direction:column;align-items:flex-end;margin:${isGrouped ? "1px" : "6px"} 0 0 0" data-msgkey="${m._key}">
      <div style="display:flex;align-items:center;gap:6px;max-width:70%">
        ${recallBtn}
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <div style="background:var(--teal);color:white;border-radius:16px 16px 4px 16px;padding:10px 14px;font-size:13px;line-height:1.5;word-break:break-word">
            ${m.image && /^(data:image\/|https:\/\/)/.test(m.image) ? `<img src="${escapeHtml(m.image)}" style="max-width:200px;max-height:200px;border-radius:8px;display:block;margin-bottom:${m.text ? '8px' : '0'}">` : ''}
            ${text ? `<span>${text}</span>` : ''}
          </div>
          <span style="font-size:11px;color:var(--text-3)" title="${timeFull}">${time}</span>
          ${reactions}
        </div>
      </div>
    </div>`;
  }

  // Avatar: visible khi không grouped, invisible spacer khi grouped (giữ alignment)
  const avatarHTML = isGrouped
    ? `<div style="width:32px;height:32px;flex-shrink:0"></div>`
    : `<div style="width:32px;height:32px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${escapeHtml(initials)}</div>`;
  // Tên user: chỉ hiện khi không grouped
  const nameHTML = isGrouped
    ? ''
    : `<span style="font-size:11px;font-weight:600;color:var(--text-2)">${escapeHtml(m.name || 'Ẩn danh')}</span>`;

  // Nếu là superadmin, thêm nút recall vào tin của user khác (admin moderation)
  const adminRecallBtn = (isSuperAdmin && !isMe)
    ? `<button onclick="window.showRecallMenu('${m._key}', ${m.ts || 0}, true, this); event.stopPropagation()" class="msg-recall-btn" style="opacity:0;background:var(--surface-2);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-2);transition:opacity 0.15s;flex-shrink:0;padding:0;margin-top:6px" title="Tùy chọn (admin)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
    </button>`
    : '';

  return `<div class="chat-msg-row" style="display:flex;align-items:flex-start;gap:8px;margin:${isGrouped ? '1px' : '6px'} 0 0 0;max-width:70%" data-msgkey="${m._key}">
    ${avatarHTML}
    <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
      ${nameHTML}
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:4px 16px 16px 16px;padding:10px 14px;font-size:13px;line-height:1.5;word-break:break-word;cursor:pointer" onclick="window.showReactionPicker('${m._key}', event)">
        ${m.image && /^(data:image\/|https:\/\/)/.test(m.image) ? `<img src="${escapeHtml(m.image)}" style="max-width:200px;max-height:200px;border-radius:8px;display:block;margin-bottom:${m.text ? '8px' : '0'}">` : ''}
        ${text ? `<span>${text}</span>` : ''}
      </div>
      <span style="font-size:11px;color:var(--text-3)" title="${timeFull}">${time}</span>
      ${reactions}
    </div>
    ${adminRecallBtn}
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
  const isSuperAdmin = currentAuth.email === SUPER_ADMIN_EMAIL;

  // Show/hide nút "Xóa hội thoại" cho superadmin
  const clearBtn = document.getElementById('cw-clear-all');
  if (clearBtn) clearBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';

  // Show/hide tab AI cho superadmin
  const aiTab = document.querySelector('.chat-widget .cw-tab-ai');
  if (aiTab) aiTab.style.display = isSuperAdmin ? 'inline-block' : 'none';
}

// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS (attach 1 lần ở module init)
// ═══════════════════════════════════════════════════════════
let _listenersAttached = false;
// ─── Recall message: 2 modes ───
// Recall everyone: tin biến mất với mọi người (tombstone), chỉ work trong 1 phút sau gửi
export async function recallMessageEveryone(msgKey) {
  if (!msgKey) return;
  try {
    // Update tin: set recalled: true, recalledAt: now, xóa text/image/reactions
    await update(ref(db, `chat/messages/${msgKey}`), {
      recalled: true,
      recalledAt: Date.now(),
      text: null,
      image: null,
      reactions: null
    });
  } catch (err) {
    console.error('Recall everyone failed:', err);
    alert('Không thể thu hồi tin. Vui lòng thử lại.');
  }
}

// Recall self: tin chỉ ẩn ở phía user hiện tại, người khác vẫn thấy bình thường
export async function recallMessageSelf(msgKey) {
  if (!msgKey) return;
  const currentAuth = window.currentAuth || {};
  const myUid = currentAuth?.uid;
  if (!myUid) return;
  try {
    // Update hiddenFor[myUid] = true
    await update(ref(db, `chat/messages/${msgKey}/hiddenFor`), {
      [myUid]: true
    });
  } catch (err) {
    console.error('Recall self failed:', err);
    alert('Không thể gỡ tin. Vui lòng thử lại.');
  }
}

// Show recall menu: popup nhỏ cạnh nút 3 chấm
export function showRecallMenu(msgKey, msgTs, isMe, btn) {
  const currentAuth = window.currentAuth || {};
  const isSuperAdmin = currentAuth.email === SUPER_ADMIN_EMAIL;
  // Chỉ cho phép gỡ nếu là chủ tin HOẶC superadmin
  if (!isMe && !isSuperAdmin) return;

  const RECALL_WINDOW_MS = 60 * 1000;
  // Owner: trong 1 phút → có 2 option. Superadmin gỡ tin user khác: luôn có option "Gỡ với mọi người"
  const canRecallEveryone = (isMe && msgTs && (Date.now() - msgTs) < RECALL_WINDOW_MS) || (!isMe && isSuperAdmin);
  // Khi superadmin gỡ tin user khác: không cho "Gỡ chỉ phía bạn" (vì là admin action)
  const showSelfOption = isMe;

  // Đóng popup cũ nếu có
  const existing = document.getElementById('chat-recall-popup');
  if (existing) existing.remove();

  // Lấy vị trí của button để đặt popup cạnh
  const rect = btn ? btn.getBoundingClientRect() : null;

  const popup = document.createElement('div');
  popup.id = 'chat-recall-popup';
  popup.style.cssText = `position:fixed;z-index:99999;background:var(--surface,#fff);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:4px;min-width:200px;animation:fadeIn 0.12s`;

  // Đặt popup bên trái của button (vì nút ở bên trái bubble), align top
  if (rect) {
    popup.style.top = `${rect.bottom + 4}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;
  } else {
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }

  const btnStyle = (color, hoverBg) => `display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:none;border-radius:7px;background:transparent;color:${color};font-size:12.5px;font-weight:500;cursor:pointer;text-align:left;transition:background 0.12s`;

  const everyoneItem = canRecallEveryone
    ? `<button id="rcl-everyone" style="${btnStyle('#dc2626')}" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='transparent'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        <span>Gỡ với mọi người</span>
      </button>`
    : '';

  const selfItem = showSelfOption
    ? `<button id="rcl-self" style="${btnStyle('var(--text-1, #0f172a)')}" onmouseover="this.style.background='var(--surface-2, #f1f5f9)'" onmouseout="this.style.background='transparent'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        <span>Gỡ chỉ phía bạn</span>
      </button>`
    : '';

  popup.innerHTML = `
    ${everyoneItem}
    ${selfItem}
  `;

  document.body.appendChild(popup);

  // Click ngoài popup → đóng
  const closeOnOutside = (e) => {
    if (!popup.contains(e.target) && e.target !== btn) {
      popup.remove();
      document.removeEventListener('click', closeOnOutside, true);
    }
  };
  // Delay 1 frame để click hiện tại không trigger close ngay
  setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);

  if (showSelfOption) {
    popup.querySelector('#rcl-self').onclick = async (e) => {
      e.stopPropagation();
      popup.remove();
      document.removeEventListener('click', closeOnOutside, true);
      await recallMessageSelf(msgKey);
    };
  }
  if (canRecallEveryone) {
    popup.querySelector('#rcl-everyone').onclick = async (e) => {
      e.stopPropagation();
      popup.remove();
      document.removeEventListener('click', closeOnOutside, true);
      await recallMessageEveryone(msgKey);
    };
  }
}

// ─── Clear all chat messages (superadmin only) ───
export async function clearAllChatMessages() {
  const currentAuth = window.currentAuth || {};
  if (currentAuth.email !== SUPER_ADMIN_EMAIL) {
    if (window.showToast) window.showToast('Chỉ Super Admin mới được phép xóa toàn bộ hội thoại', 'danger');
    return;
  }
  try {
    await remove(ref(db, 'chat/messages'));
    // Force re-render UI ngay (listener có thể delay khi node bị xóa hoàn toàn)
    renderChatMessages({});
    if (window.showToast) window.showToast('Đã xóa toàn bộ hội thoại', 'success');
  } catch (err) {
    console.error('Clear all messages failed:', err);
    if (window.showToast) window.showToast('Không thể xóa hội thoại: ' + (err.message || 'Lỗi không xác định'), 'danger');
  }
}

// Show confirm popup trước khi xóa toàn bộ
export function showClearAllConfirm(btn) {
  const currentAuth = window.currentAuth || {};
  if (currentAuth.email !== SUPER_ADMIN_EMAIL) return;

  // Đóng popup cũ nếu có
  const existing = document.getElementById('chat-clear-confirm');
  if (existing) existing.remove();

  const rect = btn ? btn.getBoundingClientRect() : null;

  const popup = document.createElement('div');
  popup.id = 'chat-clear-confirm';
  popup.style.cssText = `position:fixed;z-index:99999;background:var(--surface,#fff);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.18);padding:14px;min-width:260px;max-width:300px;animation:fadeIn 0.12s`;

  if (rect) {
    popup.style.top = `${rect.bottom + 6}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;
  } else {
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }

  popup.innerHTML = `
    <div style="display:flex;align-items:start;gap:10px;margin-bottom:10px">
      <div style="width:32px;height:32px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text-1,#0f172a);margin-bottom:3px">Xóa toàn bộ hội thoại?</div>
        <div style="font-size:11.5px;color:var(--text-2,#64748b);line-height:1.45">Tất cả tin nhắn sẽ bị xóa vĩnh viễn. Không thể hoàn tác.</div>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:10px">
      <button id="cca-cancel" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text-2);font-size:12.5px;font-weight:600;cursor:pointer">Hủy</button>
      <button id="cca-confirm" style="flex:1;padding:8px;border:none;border-radius:8px;background:#dc2626;color:white;font-size:12.5px;font-weight:600;cursor:pointer">Xóa</button>
    </div>
  `;

  document.body.appendChild(popup);

  const closeOnOutside = (e) => {
    if (!popup.contains(e.target) && e.target !== btn) {
      popup.remove();
      document.removeEventListener('click', closeOnOutside, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);

  popup.querySelector('#cca-cancel').onclick = (e) => {
    e.stopPropagation();
    popup.remove();
    document.removeEventListener('click', closeOnOutside, true);
  };
  popup.querySelector('#cca-confirm').onclick = async (e) => {
    e.stopPropagation();
    popup.remove();
    document.removeEventListener('click', closeOnOutside, true);
    await clearAllChatMessages();
  };
}

// Inject CSS cho recall button hover effect (1 lần)
(function injectChatRecallStyles() {
  if (document.getElementById('chat-recall-style')) return;
  const s = document.createElement('style');
  s.id = 'chat-recall-style';
  s.textContent = `
    .chat-msg-row:hover .msg-recall-btn { opacity: 1 !important; }
    .msg-recall-btn:hover { background: var(--border) !important; color: var(--text-1) !important; }
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  `;
  document.head.appendChild(s);
})();

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
