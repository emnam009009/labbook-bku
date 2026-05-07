/**
 * Conversation List UI — Round 109
 *
 * Renders danh sách conversations bên trong sidetab.
 * Click conversation → load messages.
 * Click "+ New" → tạo conversation mới.
 *
 * @see /AI_ARCHITECTURE.md Section 5
 */
// @ts-nocheck

import {
  listConversations,
  listenConversations,
  createConversation,
  deleteConversation,
  Conversation,
} from "../memory/conversation-store";

const LIST_CONTAINER_ID = "ai-chat-conv-list";
const LIST_TOGGLE_ID = "ai-chat-conv-toggle";
const NEW_CHAT_BTN_ID = "ai-chat-new-btn";
const CURRENT_CONV_KEY = "ai-chat-current-conv";

let _unsubscribe: (() => void) | null = null;

/** Get/set current active conversation ID */
export function getCurrentConvId(): string | null {
  try {
    return localStorage.getItem(CURRENT_CONV_KEY);
  } catch {
    return null;
  }
}

export function setCurrentConvId(convId: string | null): void {
  try {
    if (convId) localStorage.setItem(CURRENT_CONV_KEY, convId);
    else localStorage.removeItem(CURRENT_CONV_KEY);
  } catch {
    // ignore
  }
}

/** Format timestamp → "2 phút trước" / "Hôm nay 14:30" / "DD/MM" */
function formatTime(ts: number): string {
  if (!ts) return "";
  const now = Date.now();
  const diff = now - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;

  if (diff < min) return "Vừa xong";
  if (diff < hour) return `${Math.floor(diff / min)} phút trước`;
  if (diff < day) {
    const d = new Date(ts);
    return `Hôm nay ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  if (diff < 7 * day) return `${Math.floor(diff / day)} ngày trước`;

  const d = new Date(ts);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

/** Escape HTML để tránh XSS khi render title */
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render list từ data */
function renderList(conversations: Conversation[]): void {
  const container = document.getElementById(LIST_CONTAINER_ID);
  if (!container) return;

  if (conversations.length === 0) {
    container.innerHTML = `
      <div class="ai-conv-empty">
        Chưa có cuộc trò chuyện nào.<br>
        Click <strong>+ Cuộc trò chuyện mới</strong> để bắt đầu.
      </div>
    `;
    return;
  }

  const currentId = getCurrentConvId();
  const html = conversations.map((c) => {
    const isActive = c.id === currentId;
    return `
      <div class="ai-conv-item ${isActive ? "is-active" : ""}"
           data-action="ai-chat-load-conv"
           data-conv-id="${escape(c.id)}"
           role="button"
           tabindex="0">
        <div class="ai-conv-item__title">${escape(c.title)}</div>
        <div class="ai-conv-item__meta">
          <span class="ai-conv-item__count">${c.messageCount} tin nhắn</span>
          <span class="ai-conv-item__time">${formatTime(c.updatedAt)}</span>
        </div>
        <button class="ai-conv-item__delete"
                data-action="ai-chat-delete-conv"
                data-conv-id="${escape(c.id)}"
                aria-label="Xóa cuộc trò chuyện">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-2 14H7L5 6"></path>
          </svg>
        </button>
      </div>
    `;
  }).join("");

  container.innerHTML = html;
}

/** Init listener để auto-update list */
export function initConversationList(): void {
  // Cleanup old listener
  if (_unsubscribe) _unsubscribe();

  // Initial render (empty state nếu chưa load)
  renderList([]);

  // Listen realtime
  _unsubscribe = listenConversations((list) => {
    renderList(list);
  });
}

/** Cleanup khi unmount (gọi từ logout etc.) */
export function disposeConversationList(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}

// ════════════════════════════════════════════════════════════
// Action handlers (gọi từ global-delegation)
// ════════════════════════════════════════════════════════════

/** Tạo conversation mới + set active */
export async function onNewChatClick(): Promise<void> {
  const convId = await createConversation();
  if (!convId) {
    if (typeof window.showToast === "function") {
      window.showToast("Không thể tạo cuộc trò chuyện. Bạn đã đăng nhập?", "error");
    }
    return;
  }
  setCurrentConvId(convId);
  // Show messages view (hide welcome)
  showMessagesView();
  // Re-render list để mark active
  // (listenConversations sẽ tự fire khi RTDB thay đổi → re-render)
}

/** Load conversation hiện có */
export function onLoadConv(target: HTMLElement): void {
  const convId = target.dataset.convId;
  if (!convId) return;
  setCurrentConvId(convId);
  showMessagesView();
  // Re-render to update active state
  listConversations().then(renderList);
  // Round 110+ sẽ implement load messages thật
  if (typeof window.showToast === "function") {
    window.showToast("Round 110+ sẽ hiển thị tin nhắn", "info");
  }
}

/** Xóa conversation */
export async function onDeleteConv(target: HTMLElement, event?: Event): Promise<void> {
  // Stop propagation để click vào nút xóa không trigger load conv
  event?.stopPropagation();

  const convId = target.dataset.convId || target.closest("[data-conv-id]")?.getAttribute("data-conv-id");
  if (!convId) return;

  if (!confirm("Xóa cuộc trò chuyện này? Hành động không thể hoàn tác.")) return;

  await deleteConversation(convId);

  // Nếu xóa conv hiện tại → clear current
  if (getCurrentConvId() === convId) {
    setCurrentConvId(null);
    showWelcomeView();
  }

  if (typeof window.showToast === "function") {
    window.showToast("Đã xóa cuộc trò chuyện", "success");
  }
}

/** Switch UI: hide welcome, show messages */
function showMessagesView(): void {
  const welcome = document.getElementById("ai-chat-welcome");
  const messages = document.getElementById("ai-chat-messages");
  if (welcome) welcome.style.display = "none";
  if (messages) messages.classList.add("is-active");
}

/** Switch UI: show welcome, hide messages */
function showWelcomeView(): void {
  const welcome = document.getElementById("ai-chat-welcome");
  const messages = document.getElementById("ai-chat-messages");
  if (welcome) welcome.style.display = "";
  if (messages) messages.classList.remove("is-active");
}

// ════════════════════════════════════════════════════════════
// Sidebar toggle (collapse/expand conversation list)
// ════════════════════════════════════════════════════════════

const SIDEBAR_COLLAPSED_KEY = "ai-chat-sidebar-collapsed";

export function toggleConvSidebar(): void {
  const sidetab = document.getElementById("ai-chat-sidetab");
  if (!sidetab) return;
  const isCollapsed = sidetab.classList.toggle("is-conv-sidebar-collapsed");
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  } catch {
    // ignore
  }
}

export function restoreConvSidebarState(): void {
  try {
    const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    const sidetab = document.getElementById("ai-chat-sidetab");
    if (collapsed && sidetab) {
      sidetab.classList.add("is-conv-sidebar-collapsed");
    }
  } catch {
    // ignore
  }
}
