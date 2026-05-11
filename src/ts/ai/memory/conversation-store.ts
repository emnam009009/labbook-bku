/**
 * Conversation Store — Round 109
 *
 * CRUD service cho AI conversations + messages.
 * Schema:
 *   aiConversations/
 *     └─ {uid}/
 *         └─ {convId}/
 *             ├─ title, createdAt, updatedAt, messageCount
 *             └─ messages/
 *                 └─ {msgId}/
 *                     ├─ role, text, createdAt, tier?
 *
 * @see /AI_ARCHITECTURE.md Section 9 (Episodic Memory)
 */
// @ts-nocheck — AI module — partial typing (R105+ skeleton). Cleanup after RAG/streaming stabilization.

import { fbSet, fbPush, fbDel, fbGet, fbListen } from "../../firebase";

// ════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id?: string;
  role: MessageRole;
  text: string;
  createdAt: number;
  /** LLM tier dùng để generate (Round 111+) */
  tier?: 1 | 2 | 3;
  /** Citations từ RAG (Round 121+) */
  citations?: Array<{ source: string; page?: number }>;
  /** Tool calls (Round 112+) */
  toolCalls?: Array<{ name: string; args: unknown; result?: unknown }>;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  /** messages chỉ load khi mở conversation cụ thể */
  messages?: Record<string, Message>;
}

// ════════════════════════════════════════════════════════════
// Path helpers
// ════════════════════════════════════════════════════════════

function getCurrentUid(): string | null {
  const auth = (window as any).currentAuth;
  return auth?.uid ?? null;
}

function getConvPath(convId: string): string | null {
  const uid = getCurrentUid();
  if (!uid) return null;
  return `aiConversations/${uid}/${convId}`;
}

function getConvsPath(): string | null {
  const uid = getCurrentUid();
  if (!uid) return null;
  return `aiConversations/${uid}`;
}

// ════════════════════════════════════════════════════════════
// CRUD: Conversations
// ════════════════════════════════════════════════════════════

/**
 * Tạo conversation mới.
 * Title sẽ là "Chat N" với N = số conversations hiện có + 1.
 * Returns: convId
 */
export async function createConversation(): Promise<string | null> {
  const convsPath = getConvsPath();
  if (!convsPath) {
    console.warn("[ConversationStore] Not authenticated");
    return null;
  }

  // Đếm conversations hiện có để đặt tên "Chat N"
  const existing = (await fbGet(convsPath)) || {};
  const count = Object.keys(existing).length;
  const title = `Chat ${count + 1}`;

  const now = Date.now();
  const newConv: Omit<Conversation, "id"> = {
    title,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };

  // Push để Firebase auto-generate ID
  const ref = fbPush(convsPath, newConv);
  const convId = ref.key;

  return convId;
}

/**
 * Lấy 1 conversation (có messages).
 */
export async function getConversation(convId: string): Promise<Conversation | null> {
  const path = getConvPath(convId);
  if (!path) return null;

  const data = await fbGet(path);
  if (!data) return null;

  return {
    id: convId,
    title: data.title ?? "Untitled",
    createdAt: data.createdAt ?? 0,
    updatedAt: data.updatedAt ?? 0,
    messageCount: data.messageCount ?? 0,
    messages: data.messages ?? {},
  };
}

/**
 * List tất cả conversations (KHÔNG load messages, chỉ metadata).
 * Sorted desc theo updatedAt.
 */
export async function listConversations(): Promise<Conversation[]> {
  const path = getConvsPath();
  if (!path) return [];

  const data = (await fbGet(path)) || {};
  const list: Conversation[] = Object.entries(data).map(([id, conv]: [string, any]) => ({
    id,
    title: conv?.title ?? "Untitled",
    createdAt: conv?.createdAt ?? 0,
    updatedAt: conv?.updatedAt ?? 0,
    messageCount: conv?.messageCount ?? 0,
  }));

  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
}

/**
 * Listen realtime conversation list changes.
 * Returns unsubscribe function.
 */
export function listenConversations(cb: (list: Conversation[]) => void): () => void {
  const path = getConvsPath();
  if (!path) return () => {};

  return fbListen(path, (data: any) => {
    const map = data || {};
    const list: Conversation[] = Object.entries(map).map(([id, conv]: [string, any]) => ({
      id,
      title: conv?.title ?? "Untitled",
      createdAt: conv?.createdAt ?? 0,
      updatedAt: conv?.updatedAt ?? 0,
      messageCount: conv?.messageCount ?? 0,
    }));
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    cb(list);
  });
}

/**
 * Xóa 1 conversation.
 */
export async function deleteConversation(convId: string): Promise<void> {
  const path = getConvPath(convId);
  if (!path) return;
  await fbDel(path);
}

/**
 * Update conversation metadata (title, etc).
 */
export async function updateConversationMeta(
  convId: string,
  updates: Partial<Pick<Conversation, "title">>
): Promise<void> {
  const path = getConvPath(convId);
  if (!path) return;

  // Update specific fields + bump updatedAt
  const now = Date.now();
  if (updates.title !== undefined) {
    await fbSet(`${path}/title`, updates.title);
  }
  await fbSet(`${path}/updatedAt`, now);
}

// ════════════════════════════════════════════════════════════
// CRUD: Messages
// ════════════════════════════════════════════════════════════

/**
 * Append message to conversation.
 * Returns: msgId
 */
export async function appendMessage(
  convId: string,
  msg: Omit<Message, "id" | "createdAt"> & Partial<Pick<Message, "createdAt">>
): Promise<string | null> {
  const convPath = getConvPath(convId);
  if (!convPath) return null;

  const now = Date.now();
  const fullMsg: Omit<Message, "id"> = {
    ...msg,
    createdAt: msg.createdAt ?? now,
  };

  const ref = fbPush(`${convPath}/messages`, fullMsg);
  const msgId = ref.key;

  // Update conversation metadata
  await fbSet(`${convPath}/updatedAt`, now);
  // Increment messageCount (read-then-write — could use transaction but simple here)
  const conv = await fbGet(convPath);
  const newCount = (conv?.messageCount ?? 0) + 1;
  await fbSet(`${convPath}/messageCount`, newCount);

  return msgId;
}

/**
 * Listen messages của 1 conversation realtime.
 * Returns unsubscribe.
 */
export function listenMessages(
  convId: string,
  cb: (messages: Message[]) => void
): () => void {
  const path = getConvPath(convId);
  if (!path) return () => {};

  return fbListen(`${path}/messages`, (data: any) => {
    const map = data || {};
    const list: Message[] = Object.entries(map).map(([id, msg]: [string, any]) => ({
      id,
      role: msg?.role ?? "user",
      text: msg?.text ?? "",
      createdAt: msg?.createdAt ?? 0,
      tier: msg?.tier,
      citations: msg?.citations,
      toolCalls: msg?.toolCalls,
    }));
    list.sort((a, b) => a.createdAt - b.createdAt);
    cb(list);
  });
}


/**
 * Round 113b: Delete a single message by ID.
 */
export async function deleteMessage(
  convId: string,
  msgId: string
): Promise<void> {
  const path = getConvPath(convId);
  if (!path) return;
  await fbDel(`${path}/messages/${msgId}`);
  // Decrement messageCount + bump updatedAt
  const conv = await getConversation(convId);
  if (conv) {
    await fbSet(`${path}/messageCount`, Math.max(0, (conv.messageCount || 1) - 1));
    await fbSet(`${path}/updatedAt`, Date.now());
  }
}
