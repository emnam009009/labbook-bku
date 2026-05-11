/**
 * AI Chat Sidetab — Round 108 + 108b + 109
 *
 * Round 108: UI shell (sidetab + FAB + welcome).
 * Round 108b: Draggable FAB + persist position.
 * Round 109: Role gate (admin/superadmin only) + conversation list integration.
 *
 * @see /AI_ARCHITECTURE.md Section 5 (Chat UX)
 */
// @ts-nocheck — AI module — partial typing (R105+ skeleton). Cleanup after RAG/streaming stabilization.

import {
  initConversationList,
  restoreConvSidebarState,
  onNewChatClick,
  onLoadConv,
  onDeleteConv,
  toggleConvSidebar,
} from "./conversation-list";

// Round 110: Lazy-import onCopyMessage chỉ khi cần (avoid bundling on initial load)
import { onCopyMessage } from "./message-bubble";

// ════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════

const SIDETAB_ID = "ai-chat-sidetab";
const FAB_ID = "ai-chat-fab";
const BACKDROP_ID = "ai-chat-backdrop";
const INPUT_ID = "ai-chat-input";

const FAB_POS_KEY = "ai-chat-fab-pos";
const DRAG_THRESHOLD_PX = 5;
const FAB_MARGIN = 8;

interface FabPosition {
  right: number;
  bottom: number;
}

// ════════════════════════════════════════════════════════════
// Round 109: Role gate
// ════════════════════════════════════════════════════════════

/** Check if current user can access AI chat */
function canAccessAi(): boolean {
  const role = (window as any).currentAuth?.role;
  return role === "admin" || role === "superadmin";
}

/** Hide all AI UI elements (called when role insufficient) */
function hideAiUi(): void {
  const fab = document.getElementById(FAB_ID);
  const sidetab = document.getElementById(SIDETAB_ID);
  const backdrop = document.getElementById(BACKDROP_ID);
  if (fab) fab.style.display = "none";
  if (sidetab) sidetab.style.display = "none";
  if (backdrop) backdrop.style.display = "none";
}

/** Show all AI UI elements */
function showAiUi(): void {
  const fab = document.getElementById(FAB_ID);
  const sidetab = document.getElementById(SIDETAB_ID);
  const backdrop = document.getElementById(BACKDROP_ID);
  if (fab) fab.style.display = "";
  if (sidetab) sidetab.style.display = "";
  if (backdrop) backdrop.style.display = "";
}

// ════════════════════════════════════════════════════════════
// Sidetab toggle / show / hide (Round 108)
// ════════════════════════════════════════════════════════════

export function toggleAiChatSidetab(force?: boolean): void {
  if (!canAccessAi()) return; // Round 109: gate

  const sidetab = document.getElementById(SIDETAB_ID);
  const backdrop = document.getElementById(BACKDROP_ID);
  if (!sidetab || !backdrop) return;

  const willOpen = force !== undefined ? force : !sidetab.classList.contains("is-open");

  if (willOpen) {
    sidetab.classList.add("is-open");
    backdrop.classList.add("is-open");
    document.body.classList.add("ai-sidetab-open");
    setTimeout(() => {
      const input = document.getElementById(INPUT_ID) as HTMLTextAreaElement | null;
      input?.focus();
    }, 300);
  } else {
    sidetab.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    document.body.classList.remove("ai-sidetab-open");
  }
}

export function closeAiChatSidetab(): void {
  toggleAiChatSidetab(false);
}

export function onAiChatSuggestion(target: HTMLElement): void {
  const text = target.dataset.suggestion;
  if (!text) return;

  const input = document.getElementById(INPUT_ID) as HTMLTextAreaElement | null;
  if (!input) return;

  input.value = text;
  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  updateSendButtonState();
}

export async function onAiChatSend(): Promise<void> {
  // Round 113b: Stop button takes precedence when streaming
  // Round 113b3: renamed to streamingBtn to avoid collision với existing const sendBtn
  const streamingBtn = document.getElementById("ai-chat-send-btn") as HTMLButtonElement | null;
  if (streamingBtn?.dataset?.streaming === "true") {
    const { abortCurrentStream } = await import("./message-handler");
    abortCurrentStream();
    return;
  }
  const input = document.getElementById(INPUT_ID) as HTMLTextAreaElement | null;
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  // Round 110: Actually send message
  // Disable input while sending
  input.disabled = true;
  const sendBtn = document.getElementById("ai-chat-send-btn") as HTMLButtonElement | null;
  if (sendBtn) sendBtn.disabled = true;

  try {
    // Lazy-load message handler
    const { sendUserMessage } = await import("./message-handler");
    await sendUserMessage(text);
    input.value = "";
    autoResizeTextarea(input);
  } catch (e) {
    console.error("[AI Chat send error]", e);
    if (typeof window.showToast === "function") {
      window.showToast("Không gửi được tin nhắn. Thử lại?", "error");
    }
  } finally {
    input.disabled = false;
    input.focus();
    updateSendButtonState();
  }
}

function autoResizeTextarea(input: HTMLTextAreaElement): void {
  input.style.height = "auto";
  const newHeight = Math.min(input.scrollHeight, 120);
  input.style.height = `${newHeight}px`;
}

function updateSendButtonState(): void {
  const input = document.getElementById(INPUT_ID) as HTMLTextAreaElement | null;
  const btn = document.getElementById("ai-chat-send-btn") as HTMLButtonElement | null;
  if (!input || !btn) return;
  btn.disabled = input.value.trim().length === 0;
}

// ════════════════════════════════════════════════════════════
// Round 108b: Draggable FAB + persist position
// ════════════════════════════════════════════════════════════

function getDefaultPosition(): FabPosition {
  const isMobile = window.matchMedia("(max-width: 480px)").matches;
  return isMobile
    ? { right: 16, bottom: 80 }
    : { right: 24, bottom: 24 };
}

function loadFabPosition(): FabPosition {
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (!raw) return getDefaultPosition();
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.right === "number" &&
      typeof parsed?.bottom === "number"
    ) {
      return { right: parsed.right, bottom: parsed.bottom };
    }
  } catch {
    // Ignore parse errors
  }
  return getDefaultPosition();
}

function saveFabPosition(pos: FabPosition): void {
  try {
    localStorage.setItem(FAB_POS_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

function applyFabPosition(fab: HTMLElement, pos: FabPosition): void {
  const fabRect = fab.getBoundingClientRect();
  const fabWidth = fabRect.width || 52;
  const fabHeight = fabRect.height || 52;

  const maxRight = window.innerWidth - fabWidth - FAB_MARGIN;
  const maxBottom = window.innerHeight - fabHeight - FAB_MARGIN;

  const boundedRight = Math.max(FAB_MARGIN, Math.min(pos.right, maxRight));
  const boundedBottom = Math.max(FAB_MARGIN, Math.min(pos.bottom, maxBottom));

  fab.style.right = `${boundedRight}px`;
  fab.style.bottom = `${boundedBottom}px`;
  fab.style.left = "auto";
  fab.style.top = "auto";
}

export function resetFabPosition(): void {
  try {
    localStorage.removeItem(FAB_POS_KEY);
  } catch {
    // ignore
  }
  const fab = document.getElementById(FAB_ID);
  if (fab) applyFabPosition(fab, getDefaultPosition());
}

function initFabDrag(): void {
  const fab = document.getElementById(FAB_ID);
  if (!fab) return;

  applyFabPosition(fab, loadFabPosition());

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startRight = 0;
  let startBottom = 0;
  let movedDistance = 0;

  const getEventPoint = (e: MouseEvent | TouchEvent): { x: number; y: number } => {
    if ("touches" in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if ("changedTouches" in e && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return {
      x: (e as MouseEvent).clientX,
      y: (e as MouseEvent).clientY,
    };
  };

  const onStart = (e: MouseEvent | TouchEvent) => {
    const sidetab = document.getElementById(SIDETAB_ID);
    if (sidetab?.classList.contains("is-open")) return;

    const point = getEventPoint(e);
    startX = point.x;
    startY = point.y;
    movedDistance = 0;

    const computed = window.getComputedStyle(fab);
    startRight = parseFloat(computed.right) || 24;
    startBottom = parseFloat(computed.bottom) || 24;

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
  };

  const onMove = (e: MouseEvent | TouchEvent) => {
    const point = getEventPoint(e);
    const dx = point.x - startX;
    const dy = point.y - startY;
    movedDistance = Math.max(movedDistance, Math.hypot(dx, dy));

    if (!isDragging && movedDistance < DRAG_THRESHOLD_PX) return;

    if (!isDragging) {
      isDragging = true;
      fab.classList.add("is-dragging");
    }

    if ("touches" in e) e.preventDefault();

    const newRight = startRight - dx;
    const newBottom = startBottom - dy;

    applyFabPosition(fab, { right: newRight, bottom: newBottom });
  };

  const onEnd = (_e: MouseEvent | TouchEvent) => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onEnd);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
    document.removeEventListener("touchcancel", onEnd);

    if (isDragging) {
      const computed = window.getComputedStyle(fab);
      const pos: FabPosition = {
        right: parseFloat(computed.right) || 24,
        bottom: parseFloat(computed.bottom) || 24,
      };
      saveFabPosition(pos);

      fab.classList.remove("is-dragging");

      const suppressClick = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        fab.removeEventListener("click", suppressClick, true);
      };
      fab.addEventListener("click", suppressClick, true);
    }

    isDragging = false;
    movedDistance = 0;
  };

  fab.addEventListener("mousedown", onStart);
  fab.addEventListener("touchstart", onStart, { passive: true });

  let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener("resize", () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      applyFabPosition(fab, loadFabPosition());
    }, 100);
  });
}

// ════════════════════════════════════════════════════════════
// R126: Resize sidetab bằng kéo mép trái
// ════════════════════════════════════════════════════════════

const SIDETAB_WIDTH_KEY = "ai-chat-sidetab-width";
const SIDETAB_MIN_WIDTH = 320;
const SIDETAB_MAX_WIDTH_RATIO = 0.85; // tối đa 85% viewport

function getSidetabMaxWidth(): number {
  return Math.max(SIDETAB_MIN_WIDTH, Math.floor(window.innerWidth * SIDETAB_MAX_WIDTH_RATIO));
}

function clampSidetabWidth(w: number): number {
  return Math.max(SIDETAB_MIN_WIDTH, Math.min(getSidetabMaxWidth(), Math.round(w)));
}

function loadSidetabWidth(): number | null {
  try {
    const raw = localStorage.getItem(SIDETAB_WIDTH_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < SIDETAB_MIN_WIDTH) return null;
    return n;
  } catch { return null; }
}

function saveSidetabWidth(w: number): void {
  try { localStorage.setItem(SIDETAB_WIDTH_KEY, String(w)); } catch { /* localStorage disabled */ }
}

function applySidetabWidth(w: number): void {
  // Sửa CSS var trên :root → .ai-sidetab dùng var(--ai-sidetab-width)
  document.documentElement.style.setProperty("--ai-sidetab-width", w + "px");
}

function initSidetabResize(): void {
  // Restore width đã lưu (nếu có)
  const saved = loadSidetabWidth();
  if (saved !== null) applySidetabWidth(clampSidetabWidth(saved));

  const sidetab = document.getElementById(SIDETAB_ID);
  if (!sidetab) return;
  const handle = sidetab.querySelector<HTMLElement>(".ai-sidetab__resizer");
  if (!handle) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  const onMove = (e: PointerEvent) => {
    if (!isResizing) return;
    // Sidetab fixed bên phải → kéo qua trái thì width tăng
    // dx = startX - currentX (nếu kéo trái, currentX < startX → dx > 0)
    const dx = startX - e.clientX;
    const newW = clampSidetabWidth(startWidth + dx);
    applySidetabWidth(newW);
  };

  const onUp = () => {
    if (!isResizing) return;
    isResizing = false;
    handle.classList.remove("is-resizing");
    document.body.classList.remove("ai-sidetab-resizing");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);

    // Persist current width
    const cs = getComputedStyle(sidetab);
    const w = parseFloat(cs.width);
    if (Number.isFinite(w)) saveSidetabWidth(Math.round(w));
  };

  handle.addEventListener("pointerdown", (e: PointerEvent) => {
    // Chỉ phím trái mouse (button=0) hoặc touch/pen
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    const cs = getComputedStyle(sidetab);
    startWidth = parseFloat(cs.width) || SIDETAB_MIN_WIDTH;
    handle.classList.add("is-resizing");
    document.body.classList.add("ai-sidetab-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  // Keyboard accessibility: arrow keys khi handle có focus
  handle.addEventListener("keydown", (e: KeyboardEvent) => {
    const STEP = e.shiftKey ? 50 : 16;
    let delta = 0;
    if (e.key === "ArrowLeft") delta = STEP;   // mở rộng
    else if (e.key === "ArrowRight") delta = -STEP; // thu hẹp
    else return;
    e.preventDefault();
    const cs = getComputedStyle(sidetab);
    const cur = parseFloat(cs.width) || SIDETAB_MIN_WIDTH;
    const newW = clampSidetabWidth(cur + delta);
    applySidetabWidth(newW);
    saveSidetabWidth(newW);
  });

  // Re-clamp khi window resize (tránh sidetab to hơn viewport)
  window.addEventListener("resize", () => {
    const cs = getComputedStyle(sidetab);
    const cur = parseFloat(cs.width);
    if (!Number.isFinite(cur)) return;
    const clamped = clampSidetabWidth(cur);
    if (clamped !== Math.round(cur)) applySidetabWidth(clamped);
  });
}

// ════════════════════════════════════════════════════════════
// Init (Round 108 — main entry, gọi từ main.ts)
// ════════════════════════════════════════════════════════════

export function initAiChatSidetab(): void {
  // Round 109: Role gate — ẩn UI nếu không có quyền
  if (!canAccessAi()) {
    hideAiUi();
    // Re-check sau khi auth load (auth có thể chưa load lúc init đầu)
    setTimeout(() => {
      if (canAccessAi()) {
        showAiUi();
        completeInit();
      }
    }, 1500);
    return;
  }

  showAiUi();
  completeInit();
}

function completeInit(): void {
  // Keyboard shortcut: Ctrl+J / Cmd+J
  document.addEventListener("keydown", (e) => {
    if (!canAccessAi()) return;
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    if (modKey && e.key.toLowerCase() === "j") {
      e.preventDefault();
      toggleAiChatSidetab();
    }
    if (e.key === "Escape") {
      const sidetab = document.getElementById(SIDETAB_ID);
      if (sidetab?.classList.contains("is-open")) {
        closeAiChatSidetab();
      }
    }
  });

  // Input listener
  const input = document.getElementById(INPUT_ID) as HTMLTextAreaElement | null;
  if (input) {
    input.addEventListener("input", () => {
      autoResizeTextarea(input);
      updateSendButtonState();
    });
    input.addEventListener("keydown", (e) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && e.key === "Enter") {
        e.preventDefault();
        onAiChatSend();
      }
    });
  }

  updateSendButtonState();
  initFabDrag();
  initSidetabResize();

  // Round 109: init conversation list
  initConversationList();
  restoreConvSidebarState();
}

// ════════════════════════════════════════════════════════════
// Expose to window (single unified block)
// ════════════════════════════════════════════════════════════

if (typeof window !== "undefined") {
  // Round 108
  (window as any).toggleAiChatSidetab = toggleAiChatSidetab;
  (window as any).closeAiChatSidetab = closeAiChatSidetab;
  (window as any).onAiChatSuggestion = onAiChatSuggestion;
  (window as any).onAiChatSend = onAiChatSend;
  // Round 108b
  (window as any).resetAiChatFabPosition = resetFabPosition;
  // Round 109
  (window as any).onNewChatClick = onNewChatClick;
  (window as any).onLoadConv = onLoadConv;
  (window as any).onDeleteConv = onDeleteConv;
  (window as any).toggleConvSidebar = toggleConvSidebar;
  // Round 110
  (window as any).onCopyMessage = onCopyMessage;
}

// ════════════════════════════════════════════════════════════
// Round 114b: Mic toggle handler
// ════════════════════════════════════════════════════════════
import type { SpeechRecorder } from "../voice/speech-recorder";

let micRecorder: SpeechRecorder | null = null;

export async function onAiMicToggle(): Promise<void> {
  const micBtn = document.getElementById("ai-chat-mic-btn") as HTMLButtonElement | null;
  if (!micBtn) return;

  // Lazy-load recorder module
  if (!micRecorder) {
    const { SpeechRecorder, isVoiceRecordingSupported } = await import("../voice/speech-recorder");
    if (!isVoiceRecordingSupported()) {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast("Trình duyệt không hỗ trợ ghi âm", "error");
      }
      micBtn.disabled = true;
      return;
    }
    micRecorder = new SpeechRecorder({
      onError: (e) => {
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("Mic: " + e.message, "error");
        }
      },
    });
  }

  const state = micRecorder.getState();

  if (state === "idle") {
    // Start recording
    try {
      await micRecorder.start();
      micBtn.dataset.recording = "true";
      micBtn.title = "Dừng ghi âm";
    } catch (e) {
      console.error("[mic] Start failed:", e);
    }
    return;
  }

  if (state === "recording") {
    // Stop + transcribe
    delete micBtn.dataset.recording;
    micBtn.dataset.processing = "true";
    micBtn.title = "Đang xử lý...";

    try {
      const result = await micRecorder.stop();
      if (result && result.transcript) {
        // Fill transcript vào input
        const input = document.getElementById(INPUT_ID) as HTMLTextAreaElement | null;
        if (input) {
          input.value = input.value
            ? input.value + " " + result.transcript
            : result.transcript;
          input.focus();
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } else {
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("Không nghe được. Thử lại?", "warning");
        }
      }
    } catch (e: any) {
      console.error("[mic] Transcribe failed:", e);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast("Lỗi nhận dạng: " + (e.message || "unknown"), "error");
      }
    } finally {
      delete micBtn.dataset.processing;
      micBtn.title = "Ghi âm (mic)";
    }
    return;
  }
}

export async function onAiMsgSpeak(target: HTMLElement): Promise<void> {
  const bubble = target.closest(".ai-msg") as HTMLElement | null;
  if (!bubble) return;
  const contentEl = bubble.querySelector(".ai-msg__content");
  if (!contentEl) return;

  const text = (contentEl as HTMLElement).innerText || (contentEl as HTMLElement).textContent || "";
  if (!text) return;

  const { getTts } = await import("../voice/text-to-speech");
  const tts = getTts();

  // If currently speaking THIS bubble → stop
  const isThisSpeaking = target.dataset.speaking === "true";

  // Always stop current speaker UI
  document.querySelectorAll('[data-action="ai-msg-speak"][data-speaking="true"]').forEach((el) => {
    delete (el as HTMLElement).dataset.speaking;
  });

  if (isThisSpeaking) {
    tts.stop();
    return;
  }

  // Start speaking
  target.dataset.speaking = "true";
  tts.speak(text, {
    onStateChange: (state) => {
      if (state === "idle") {
        delete target.dataset.speaking;
      }
    },
  });
}

// Round 114b: Expose voice handlers
if (typeof window !== "undefined") {
  (window as any).onAiMicToggle = onAiMicToggle;
  (window as any).onAiMsgSpeak = onAiMsgSpeak;
}

