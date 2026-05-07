/**
 * Message Handler — Round 110
 *
 * Orchestrates: persist user message → mock stream → persist assistant message.
 * Lazy-loaded khi user gửi message đầu tiên.
 *
 * Round 111+ sẽ thay mockStream bằng real LLM streaming.
 */
// @ts-nocheck

import {
  appendMessage,
  createConversation,
  getConversation,
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
} from "./message-bubble";
import { streamLlm } from "../llm/llm-router";
import { getSystemPrompt } from "../llm/system-prompt";
import { LlmMessage } from "../llm/types";

/**
 * Send user message + handle response stream.
 */
export async function sendUserMessage(text: string): Promise<void> {
  // Ensure we have an active conversation
  let convId = getCurrentConvId();
  if (!convId) {
    convId = await createConversation();
    if (!convId) {
      throw new Error("Cannot create conversation");
    }
    setCurrentConvId(convId);
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

  // Stream mock response
  let assistantMsgEl: HTMLElement | null = null;
  let finalText = "";

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

  await streamLlm(
    {
      messages: historyMessages,
      systemPrompt: getSystemPrompt(),
      tier: 1,
    },
    {
      onChunk: async (accumulated: string) => {
        // First chunk: remove loading, create real assistant bubble
        if (!assistantMsgEl) {
          removeLoadingBubble(loadingEl);
          const tempMsg: Message = {
            role: "assistant",
            text: accumulated,
            createdAt: Date.now(),
          };
          assistantMsgEl = await appendMessageToDom(tempMsg);
        } else {
          // Update existing bubble with accumulated text
          await updateMessageText(assistantMsgEl, accumulated, true);
        }
        finalText = accumulated;
      },
      onComplete: async (fullText: string) => {
        finalText = fullText;
        // Persist assistant message to RTDB
        await appendMessage(convId!, {
          role: "assistant",
          text: fullText,
          tier: 1,
        });
        scrollToBottom();
      },
      onError: (e: Error) => {
        console.error("[LLM stream error]", e);
        removeLoadingBubble(loadingEl);
        if (typeof window.showToast === "function") {
          window.showToast("Stream error: " + e.message, "error");
        }
      },
    }
  );
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
