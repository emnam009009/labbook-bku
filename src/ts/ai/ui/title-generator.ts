/**
 * Title Generator — Auto-rename conversation từ user message đầu tiên.
 *
 * Round 113b.
 *
 * Strategy:
 * - Trigger khi conversation vẫn dùng default title "Chat N"
 * - Lấy 2 messages đầu (user + assistant) làm context
 * - Gọi Gemini Flash với system prompt ngắn → return title 3-6 chữ tiếng Việt
 * - Update RTDB title (realtime listener tự refresh UI)
 * - Background, không block streaming
 */
// @ts-nocheck

import { LlmMessage } from "../llm/types";
import { geminiClient } from "../llm/gemini-client";
import { updateConversationMeta } from "../memory/conversation-store";

const TITLE_SYSTEM_PROMPT =
  "Bạn là trợ lý đặt tên ngắn cho conversation. " +
  "Cho user message + AI response, trả về title 3-6 chữ tiếng Việt mô tả nội dung. " +
  "Chỉ trả về title, không giải thích, không quote, không dấu chấm cuối. " +
  "Ví dụ: 'Tra cứu Na2WO4', 'Phương trình Scherrer', 'Danh sách thành viên'.";

const DEFAULT_TITLE_PATTERN = /^Chat\s*\d+$/i;

/**
 * Check if conversation still has default title (eligible for rename).
 */
export function shouldAutoRename(currentTitle: string | undefined): boolean {
  if (!currentTitle) return true;
  return DEFAULT_TITLE_PATTERN.test(currentTitle.trim());
}

/**
 * Generate a short title from first user+assistant exchange.
 * Background call — không await ở caller.
 */
export async function generateAndUpdateTitle(
  convId: string,
  userMessage: string,
  assistantMessage: string
): Promise<string | null> {
  const messages: LlmMessage[] = [
    {
      role: "user",
      text:
        "User hỏi: " +
        userMessage.slice(0, 200) +
        "\n\nAI trả lời: " +
        assistantMessage.slice(0, 300) +
        "\n\nĐặt title ngắn 3-6 chữ tiếng Việt:",
    },
  ];

  let titleText = "";

  try {
    await geminiClient.stream(
      {
        messages,
        systemPrompt: TITLE_SYSTEM_PROMPT,
        tier: 1,
        enableTools: false, // Title generation không cần tools
      },
      {
        onChunk: (accumulated) => {
          titleText = accumulated;
        },
        onComplete: (full) => {
          titleText = full;
        },
        onError: (e) => {
          console.warn("[Title generator] Failed:", e.message);
        },
      }
    );
  } catch (e) {
    console.warn("[Title generator] Exception:", e);
    return null;
  }

  // Clean up: remove quotes, trim, limit length
  let cleanTitle = titleText
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/\.+$/, "")
    .replace(/\n.*$/s, "")
    .trim();

  if (!cleanTitle || cleanTitle.length < 2) {
    return null;
  }

  // Hard limit 60 chars
  if (cleanTitle.length > 60) {
    cleanTitle = cleanTitle.slice(0, 57) + "...";
  }

  // Update RTDB
  try {
    await updateConversationMeta(convId, { title: cleanTitle });
    console.log("[Title generator] Renamed:", convId, "→", cleanTitle);
    return cleanTitle;
  } catch (e) {
    console.warn("[Title generator] Update failed:", e);
    return null;
  }
}
