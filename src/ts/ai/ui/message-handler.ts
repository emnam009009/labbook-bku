/**
 * Message Handler — Round 110+
 *
 * Orchestrates: persist user message → stream LLM → persist assistant message.
 *
 * Round 111: real Gemini.
 * Round 112: tool calling.
 * Round 113a: race condition fix (creatingBubble flag).
 * Round 113a2: streaming stuck fix (latestAccumulated tracker).
 * Round 113b: stop button, regenerate, auto-rename, better error toast.
 */
// @ts-nocheck

import {
  appendMessage,
  createConversation,
  getConversation,
  deleteMessage,
  Message,
} from "../memory/conversation-store";
import { getCurrentConvId, setCurrentConvId } from "./conversation-list";
import {
  appendMessageToDom,
  updateMessageText,
  showLoadingBubble,
  removeLoadingBubble,
  clearMessages,
  scrollToBottom,
  removeMessageBubble,
} from "./message-bubble";
import { migrateCitations } from "./citation-popover";
import { streamLlm } from "../llm/llm-router";
import { getSystemPrompt } from "../llm/system-prompt";
import { LlmMessage } from "../llm/types";
import {
  generateAndUpdateTitle,
  shouldAutoRename,
} from "./title-generator";

// Round 113b: AbortController để hỗ trợ Stop button
let currentAbortController: AbortController | null = null;

/** Round 113b: Get current AbortController (for Stop button click handler) */
export function getCurrentAbortController(): AbortController | null {
  return currentAbortController;
}

/** Round 113b: Trigger abort current stream */
export function abortCurrentStream(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

/**
 * Send user message + handle response stream.
 */
export async function sendUserMessage(text: string): Promise<void> {
  // Ensure we have an active conversation
  let convId = getCurrentConvId();
  let isFirstMessage = false;
  if (!convId) {
    convId = await createConversation();
    if (!convId) {
      throw new Error("Cannot create conversation");
    }
    setCurrentConvId(convId);
    isFirstMessage = true;
    // Switch UI to messages view
    showMessagesView();
  }

  // Persist user message
  const userMsgId = await appendMessage(convId, {
    role: "user",
    text,
  });

  // Render user message immediately
  const userMsg: Message = {
    id: userMsgId,
    role: "user",
    text,
    createdAt: Date.now(),
  };
  await appendMessageToDom(userMsg);

  // Show loading bubble
  const loadingEl = showLoadingBubble();

  let assistantMsgEl: HTMLElement | null = null;
  let finalText = "";
  // Round 113a/a2: race condition + streaming stuck fix
  let creatingBubble = false;
  let latestAccumulated = "";

  // Round 113b: AbortController for Stop button
  const abortController = new AbortController();
  currentAbortController = abortController;
  setStreamingState(true);

  // Round 111: Build messages array với conversation history (10 messages gần nhất)
  const conv = await getConversation(convId);
  const historyMessages: LlmMessage[] = [];
  if (conv?.messages) {
    const sorted = Object.values(conv.messages)
      .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
    // Lấy 10 messages gần nhất (không tính user message vừa append)
    const recent = sorted.slice(-11, -1);
    for (const m of recent as any[]) {
      historyMessages.push({
        role: m.role === "assistant" ? "model" : "user",
        text: m.text || "",
      });
    }
  }
  // Add current user message
  historyMessages.push({ role: "user", text });

  let streamCompleted = false;

  try {
    await streamLlm(
      {
        messages: historyMessages,
        systemPrompt: getSystemPrompt(),
        tier: 1,
        signal: abortController.signal,
      },
      {
        onChunk: async (accumulated: string) => {
          latestAccumulated = accumulated;
          finalText = accumulated;

          if (!assistantMsgEl && !creatingBubble) {
            creatingBubble = true;
            removeLoadingBubble(loadingEl);
            const tempMsg: Message = {
              role: "assistant",
              text: accumulated,
              createdAt: Date.now(),
            };
            assistantMsgEl = await appendMessageToDom(tempMsg);
            creatingBubble = false;

            // Sync với latest sau khi bubble ready
            if (assistantMsgEl && latestAccumulated !== accumulated) {
              await updateMessageText(
                assistantMsgEl,
                latestAccumulated,
                true
              );
            }
          } else if (assistantMsgEl) {
            await updateMessageText(assistantMsgEl, accumulated, true);
          }
        },
        onComplete: async (fullText: string) => {
          finalText = fullText;
          streamCompleted = true;
          // Persist assistant message to RTDB
          const realMsgId = await appendMessage(convId!, {
            role: "assistant",
            text: fullText,
            tier: 1,
          });
          // R138b2b-fix4 + R140-fix: bind real msgId, migrate citations,
          // then re-render via updateMessageText to guarantee chips attach
          // (avoids race with any pending last-chunk updateMessageText).
          if (realMsgId && assistantMsgEl) {
            assistantMsgEl.dataset.msgId = realMsgId;
            migrateCitations("", realMsgId);
            // Final re-render: msgId now valid, so updateMessageText's
            // preprocessCitationMarkers + attachCitationChips path runs
            // correctly. This is the LAST DOM write for this message;
            // no further onChunk can race past this point because
            // streamCompleted=true and the stream loop has exited.
            await updateMessageText(assistantMsgEl, fullText, true);
          }
          scrollToBottom();
        },
        onError: (e: Error) => {
          console.error("[LLM stream error]", e);
          // Round 113b: better error toast với context
          showErrorToast(e);
          // Don't remove loading if assistantMsgEl exists (already replaced)
          if (!assistantMsgEl) {
            removeLoadingBubble(loadingEl);
          }
        },
      }
    );
  } finally {
    // Round 113b: Cleanup streaming state
    currentAbortController = null;
    setStreamingState(false);

    // Round 113b: If stopped mid-stream, save partial text
    if (!streamCompleted && finalText) {
      try {
        await appendMessage(convId, {
          role: "assistant",
          text: finalText + "\n\n_(Đã dừng)_",
          tier: 1,
        });
      } catch (e) {
        console.warn("[message-handler] Failed to save partial:", e);
      }
    }

    // Round 113b: Auto-rename conversation nếu là conversation mới
    // (chạy background, không block UI)
    if (finalText && (isFirstMessage || shouldAutoRename(conv?.title))) {
      // Background, không await
      generateAndUpdateTitle(convId, text, finalText).catch((e) =>
        console.warn("[Auto-rename] Failed:", e)
      );
    }
  }
}

/**
 * Round 113b: Regenerate last assistant message.
 * Removes the last assistant message + re-streams from same user message.
 */
export async function regenerateLastResponse(): Promise<void> {
  const convId = getCurrentConvId();
  if (!convId) return;

  const conv = await getConversation(convId);
  if (!conv?.messages) return;

  const sorted = Object.entries(conv.messages)
    .map(([id, m]: [string, any]) => ({ id, ...m }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  // Find last assistant message + corresponding user message
  let lastAssistantIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }

  if (lastAssistantIdx < 0) return;

  // Find user message before
  let lastUserIdx = -1;
  for (let i = lastAssistantIdx - 1; i >= 0; i--) {
    if (sorted[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return;

  const userText = sorted[lastUserIdx].text;
  const assistantId = sorted[lastAssistantIdx].id;

  // Delete last assistant message from RTDB + DOM
  try {
    await deleteMessage(convId, assistantId);
    removeMessageBubble(assistantId);
  } catch (e) {
    console.warn("[regenerate] Delete failed:", e);
    return;
  }

  // Re-send: nhưng không append user message lại (đã có rồi)
  // → gọi sendUserMessage không work đúng vì nó append.
  // → cần version riêng cho regenerate

  await streamRegeneration(convId, userText);
}

/**
 * Round 113b: Stream regeneration without appending user message again.
 */
async function streamRegeneration(
  convId: string,
  userText: string
): Promise<void> {
  const loadingEl = showLoadingBubble();

  let assistantMsgEl: HTMLElement | null = null;
  let finalText = "";
  let creatingBubble = false;
  let latestAccumulated = "";

  const abortController = new AbortController();
  currentAbortController = abortController;
  setStreamingState(true);

  // Build history (no extra user append)
  const conv = await getConversation(convId);
  const historyMessages: LlmMessage[] = [];
  if (conv?.messages) {
    const sorted = Object.values(conv.messages)
      .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
    const recent = sorted.slice(-10);
    for (const m of recent as any[]) {
      historyMessages.push({
        role: m.role === "assistant" ? "model" : "user",
        text: m.text || "",
      });
    }
  }

  let streamCompleted = false;

  try {
    await streamLlm(
      {
        messages: historyMessages,
        systemPrompt: getSystemPrompt(),
        tier: 1,
        signal: abortController.signal,
      },
      {
        onChunk: async (accumulated: string) => {
          latestAccumulated = accumulated;
          finalText = accumulated;

          if (!assistantMsgEl && !creatingBubble) {
            creatingBubble = true;
            removeLoadingBubble(loadingEl);
            const tempMsg: Message = {
              role: "assistant",
              text: accumulated,
              createdAt: Date.now(),
            };
            assistantMsgEl = await appendMessageToDom(tempMsg);
            creatingBubble = false;

            if (assistantMsgEl && latestAccumulated !== accumulated) {
              await updateMessageText(
                assistantMsgEl,
                latestAccumulated,
                true
              );
            }
          } else if (assistantMsgEl) {
            await updateMessageText(assistantMsgEl, accumulated, true);
          }
        },
        onComplete: async (fullText: string) => {
          finalText = fullText;
          streamCompleted = true;
          await appendMessage(convId, {
            role: "assistant",
            text: fullText,
            tier: 1,
          });
          scrollToBottom();
        },
        onError: (e: Error) => {
          console.error("[regen stream error]", e);
          showErrorToast(e);
          if (!assistantMsgEl) {
            removeLoadingBubble(loadingEl);
          }
        },
      }
    );
  } finally {
    currentAbortController = null;
    setStreamingState(false);

    if (!streamCompleted && finalText) {
      try {
        await appendMessage(convId, {
          role: "assistant",
          text: finalText + "\n\n_(Đã dừng)_",
          tier: 1,
        });
      } catch (e) {
        console.warn("[regen] Save partial failed:", e);
      }
    }
  }
}

/**
 * Round 113b: Toggle send button between Send/Stop based on streaming state.
 */
function setStreamingState(isStreaming: boolean): void {
  const sendBtn = document.getElementById(
    "ai-chat-send-btn"
  ) as HTMLButtonElement | null;
  if (!sendBtn) return;

  if (isStreaming) {
    sendBtn.dataset.streaming = "true";
    sendBtn.disabled = false; // Stop button always enabled
    sendBtn.setAttribute("aria-label", "Stop");
    sendBtn.title = "Dừng";
    // Replace icon with Stop icon
    sendBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="6" width="12" height="12" rx="1"/>
      </svg>
    `;
  } else {
    delete sendBtn.dataset.streaming;
    sendBtn.setAttribute("aria-label", "Send");
    sendBtn.title = "Gửi";
    // Restore Send icon (paper plane)
    sendBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    `;
    // Re-disable based on input state
    const input = document.getElementById(
      "ai-chat-input"
    ) as HTMLTextAreaElement | null;
    sendBtn.disabled = !input || input.value.trim().length === 0;
  }
}

/**
 * Round 113b: Better error toast with context.
 */
function showErrorToast(error: Error): void {
  if (typeof (window as any).showToast !== "function") return;

  let msg = error.message || String(error);

  // Extract HTTP status nếu có
  const httpMatch = msg.match(/HTTP (\d+)/);
  if (httpMatch) {
    const status = httpMatch[1];
    if (status === "429") {
      msg = "Quá nhiều request, đợi vài giây rồi thử lại";
    } else if (status === "401" || status === "403") {
      msg = "Phiên đăng nhập hết hạn, vui lòng login lại";
    } else if (status === "500" || status === "502" || status === "503") {
      msg = `Server lỗi (${status}), thử lại sau`;
    } else {
      msg = `Lỗi HTTP ${status}: ${msg.slice(0, 80)}`;
    }
  } else if (msg.length > 100) {
    msg = msg.slice(0, 100) + "...";
  }

  (window as any).showToast("AI: " + msg, "error");
}

/**
 * Load all messages of a conversation into the messages container.
 */
export async function loadConversationMessages(convId: string): Promise<void> {
  clearMessages();
  const conv = await getConversation(convId);
  if (!conv || !conv.messages) {
    return;
  }
  // Sort by createdAt
  const messages = Object.entries(conv.messages)
    .map(([id, msg]: [string, any]) => ({ id, ...msg } as Message))
    .sort((a, b) => a.createdAt - b.createdAt);
  // Render all
  for (const msg of messages) {
    await appendMessageToDom(msg);
  }
  scrollToBottom(false); // Instant scroll for initial load
}

function showMessagesView(): void {
  const welcome = document.getElementById("ai-chat-welcome");
  const messages = document.getElementById("ai-chat-messages");
  if (welcome) welcome.style.display = "none";
  if (messages) messages.classList.add("is-active");
}

// Round 113b: Expose to window for global delegation
if (typeof window !== "undefined") {
  (window as any).regenerateLastResponse = regenerateLastResponse;
  (window as any).abortCurrentStream = abortCurrentStream;
}
