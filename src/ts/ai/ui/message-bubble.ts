/**
 * Message Bubble Renderer — Round 110
 *
 * Renders 1 message thành HTML element + handle markdown + actions.
 *
 * @see /AI_ARCHITECTURE.md Section 5
 */
// @ts-nocheck

import { Message } from "../memory/conversation-store";
import { renderMarkdown, highlightCodeBlocks, addCodeBlockCopyButtons } from "./markdown-render";
import { preprocessDraftMarkers } from "./confirmation-card";
import {
  preprocessCitationMarkers,
  attachCitationChips,
  attachGlobalCitationDelegation,
} from "./citation-popover";

// R138b2b: register citation popover click handlers once on module load
attachGlobalCitationDelegation();

const MESSAGES_CONTAINER_ID = "ai-chat-messages";

/** Format ngắn timestamp → "14:30" */
function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Escape HTML để hiển thị raw user input (không trust markdown ngay) */
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tạo message bubble element (chưa render markdown — async ở step sau).
 */
export function createMessageElement(msg: Message): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `ai-msg ai-msg--${msg.role}`;
  wrap.dataset.msgId = msg.id || "";

  const isUser = msg.role === "user";

  // Avatar
  const avatarHtml = isUser
    ? `<div class="ai-msg__avatar ai-msg__avatar--user">
         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
           <circle cx="12" cy="7" r="4"/>
         </svg>
       </div>`
    : `<div class="ai-msg__avatar ai-msg__avatar--assistant">
         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <path d="M12 2L2 7l10 5 10-5-10-5z"/>
           <path d="M2 17l10 5 10-5"/>
           <path d="M2 12l10 5 10-5"/>
         </svg>
       </div>`;

  wrap.innerHTML = `
    ${avatarHtml}
    <div class="ai-msg__body">
      <div class="ai-msg__header">
        <span class="ai-msg__role">${isUser ? "Bạn" : "AI Lab Assistant"}</span>
        <span class="ai-msg__time">${formatTime(msg.createdAt)}</span>
      </div>
      <div class="ai-msg__content">${escape(msg.text)}</div>
      ${
        isUser
          ? ""
          : `<div class="ai-msg__actions">
               <button class="ai-msg__action" data-action="ai-msg-copy" aria-label="Copy message">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <rect x="9" y="9" width="13" height="13" rx="2"/>
                   <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                 </svg>
                 <span>Copy</span>
               </button>
               <button class="ai-msg__action" data-action="ai-msg-regenerate" aria-label="Regenerate response" title="Tạo lại">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <polyline points="23 4 23 10 17 10"/>
                   <polyline points="1 20 1 14 7 14"/>
                   <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                 </svg>
                 <span>Tạo lại</span>
               </button>
               <button class="ai-msg__action" data-action="ai-msg-speak" aria-label="Speak message" title="Đọc to">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                   <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>
                 </svg>
                 <span>Đọc</span>
               </button>
             </div>`
      }
    </div>
  `;

  // R138b2b: tag with msgId so streaming updateMessageText can find citations
  if (msg.id) wrap.dataset.msgId = msg.id;

  return wrap;
}

/**
 * Render markdown vào message content (async).
 * Chỉ render markdown cho assistant messages — user messages giữ raw.
 */
export async function renderMessageMarkdown(msgEl: HTMLElement, msg: Message): Promise<void> {
  if (msg.role === "user") return; // User messages: keep raw

  const contentEl = msgEl.querySelector(".ai-msg__content") as HTMLElement | null;
  if (!contentEl) return;

  try {
    // R138b2b: extract citations marker BEFORE render, then chip-ify [N] AFTER
    const msgId = msg.id || "";
    const preprocessed = preprocessCitationMarkers(
      preprocessDraftMarkers(msg.text),
      msgId,
    );
    const html = await renderMarkdown(preprocessed);
    contentEl.innerHTML = html;

    // Post-process: highlight code + add copy buttons
    await highlightCodeBlocks(contentEl);
    addCodeBlockCopyButtons(contentEl);
    // R138b2b: turn [N] text into clickable citation chips
    if (msgId) attachCitationChips(contentEl, msgId);
  } catch (e) {
    console.error("[Markdown render error]", e);
    contentEl.textContent = msg.text; // Fallback to plain text
  }
}

/**
 * Append message to container + render markdown async.
 */
export async function appendMessageToDom(msg: Message): Promise<HTMLElement | null> {
  const container = document.getElementById(MESSAGES_CONTAINER_ID);
  if (!container) return null;

  const el = createMessageElement(msg);
  container.appendChild(el);

  // Render markdown async (don't block)
  renderMessageMarkdown(el, msg);

  // Auto-scroll
  scrollToBottom();

  return el;
}

/**
 * Replace existing message element's text + re-render.
 * Used for streaming updates.
 */
export async function updateMessageText(
  msgEl: HTMLElement,
  newText: string,
  isAssistant: boolean
): Promise<void> {
  const contentEl = msgEl.querySelector(".ai-msg__content") as HTMLElement | null;
  if (!contentEl) return;

  if (isAssistant) {
    // Re-render markdown (with throttle/debounce trong production)
    try {
      // R138b2b: same preprocess + chip-ify pipeline as initial render
      const msgId = msgEl.dataset.msgId || "";
      const preprocessed = preprocessCitationMarkers(
        preprocessDraftMarkers(newText),
        msgId,
      );
      contentEl.innerHTML = await renderMarkdown(preprocessed);
      await highlightCodeBlocks(contentEl);
      addCodeBlockCopyButtons(contentEl);
      if (msgId) attachCitationChips(contentEl, msgId);
    } catch {
      contentEl.textContent = newText;
    }
  } else {
    contentEl.textContent = newText;
  }

  scrollToBottom();
}

/**
 * Show empty state (no messages yet).
 */
export function clearMessages(): void {
  const container = document.getElementById(MESSAGES_CONTAINER_ID);
  if (container) container.innerHTML = "";
}

/**
 * Auto-scroll to bottom of messages container.
 */
export function scrollToBottom(smooth = true): void {
  const container = document.getElementById(MESSAGES_CONTAINER_ID);
  if (!container) return;

  if (smooth) {
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  } else {
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Show loading bubble ("AI đang suy nghĩ...").
 * Returns the element for later removal.
 */
export function showLoadingBubble(): HTMLElement | null {
  const container = document.getElementById(MESSAGES_CONTAINER_ID);
  if (!container) return null;

  const el = document.createElement("div");
  el.className = "ai-msg ai-msg--assistant ai-msg--loading";
  el.innerHTML = `
    <div class="ai-msg__avatar ai-msg__avatar--assistant">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="ai-msg__body">
      <div class="ai-msg__loading-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  container.appendChild(el);
  scrollToBottom();
  return el;
}

/**
 * Remove loading bubble.
 */
export function removeLoadingBubble(el: HTMLElement | null): void {
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

/**
 * Action handler: copy message text.
 */
export function onCopyMessage(target: HTMLElement): void {
  const msgEl = target.closest(".ai-msg") as HTMLElement | null;
  if (!msgEl) return;

  const contentEl = msgEl.querySelector(".ai-msg__content") as HTMLElement | null;
  if (!contentEl) return;

  // Get raw text (not HTML)
  const text = contentEl.textContent || "";
  navigator.clipboard.writeText(text).then(() => {
    if (typeof window.showToast === "function") {
      window.showToast("Đã copy", "success");
    }
  });
}


/**
 * Round 113b: Remove a message bubble from DOM by msgId.
 */
export function removeMessageBubble(msgId: string): void {
  const container = document.getElementById("ai-chat-messages");
  if (!container) return;
  const el = container.querySelector(`[data-msg-id="${msgId}"]`);
  if (el) el.remove();
}
