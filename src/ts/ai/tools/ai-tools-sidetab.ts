/**
 * AI Tools Sidetab — Round 131
 * Container cho Library, Workbench, DFT, Materials DB, Lab Memory.
 *
 * Reuses pattern từ chat-sidetab.ts (R108-R126):
 * - Toggle slide animation (transform translateX)
 * - Resize handle với CSS var --ai-tools-width
 * - Tab switching (BEM .is-active)
 *
 * Permission: Visual sidebar item gated by .superadmin-only (CSS).
 * Runtime check: canAccessAiTools() — chỉ superadmin.
 */
// @ts-nocheck

const SIDETAB_ID = "ai-tools-sidetab";
const STORAGE_KEY = "ai-tools-sidetab-width";
const MIN_WIDTH = 360;
const MAX_WIDTH_VW = 0.85;
const DEFAULT_WIDTH = 540;

function canAccessAiTools(): boolean {
  // Body class set bởi auth: superadmin-mode | admin-mode | ...
  return document.body.classList.contains("superadmin-mode");
}

// ════════════════════════════════════════════════════════════
// Toggle / Close
// ════════════════════════════════════════════════════════════

export function toggleAiToolsSidetab(force?: boolean): void {
  if (!canAccessAiTools()) {
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast("AI Tools chỉ dành cho superadmin", "warn");
    }
    return;
  }
  const sidetab = document.getElementById(SIDETAB_ID);
  if (!sidetab) return;
  const willOpen = force !== undefined ? force : !sidetab.classList.contains("is-open");
  if (willOpen) {
    sidetab.classList.add("is-open");
    sidetab.setAttribute("aria-hidden", "false");
    document.body.classList.add("ai-tools-sidetab-open");
    // R132b: Subscribe paper list khi mở Library tab
    import("../papers/paper-list").then((m) => m.startPaperListListener());
  } else {
    sidetab.classList.remove("is-open");
    sidetab.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ai-tools-sidetab-open");
    // R132b: Unsubscribe khi đóng để giảm RTDB connections
    import("../papers/paper-list").then((m) => m.stopPaperListListener());
  }
}

export function closeAiToolsSidetab(): void {
  toggleAiToolsSidetab(false);
}

// ════════════════════════════════════════════════════════════
// Tab switching
// ════════════════════════════════════════════════════════════

const TAB_TITLES: Record<string, string> = {
  library: "📚 Thư viện tài liệu",
  workbench: "🔬 Workbench",
  dft: "💎 DFT Launcher",
  "materials-db": "🧪 Materials Database",
  memory: "🧠 Lab Memory",
};

export function onAiToolsTabSwitch(target: HTMLElement): void {
  const tabName = target.dataset.tab;
  if (!tabName) return;

  // Update tabs (deselect all, select clicked)
  const sidetab = document.getElementById(SIDETAB_ID);
  if (!sidetab) return;
  sidetab.querySelectorAll(".ai-tools-tab").forEach((t) => {
    t.classList.remove("is-active");
    t.setAttribute("aria-selected", "false");
  });
  target.classList.add("is-active");
  target.setAttribute("aria-selected", "true");

  // Update panels
  sidetab.querySelectorAll(".ai-tools-panel").forEach((p) => {
    p.classList.remove("is-active");
  });
  const panel = sidetab.querySelector(`[data-panel="${tabName}"]`);
  panel?.classList.add("is-active");

  // Update title
  const titleEl = sidetab.querySelector("[data-tab-title]");
  if (titleEl) titleEl.textContent = TAB_TITLES[tabName] || "AI Tools";
}

// ════════════════════════════════════════════════════════════
// Resize handle (R126 pattern)
// ════════════════════════════════════════════════════════════

let _isResizing = false;
let _startX = 0;
let _startWidth = 0;

export function onAiToolsResizeStart(target: HTMLElement, ev: PointerEvent): void {
  if (!canAccessAiTools()) return;
  const sidetab = document.getElementById(SIDETAB_ID);
  if (!sidetab) return;
  _isResizing = true;
  _startX = ev.clientX;
  _startWidth = sidetab.offsetWidth;
  document.body.classList.add("ai-tools-sidetab-resizing");
  target.setPointerCapture?.(ev.pointerId);
  ev.preventDefault();
}

function onResizeMove(ev: PointerEvent): void {
  if (!_isResizing) return;
  const dx = _startX - ev.clientX; // drag trái → tăng width
  let newWidth = _startWidth + dx;
  const maxW = window.innerWidth * MAX_WIDTH_VW;
  if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
  if (newWidth > maxW) newWidth = maxW;
  document.documentElement.style.setProperty("--ai-tools-width", `${newWidth}px`);
}

function onResizeEnd(): void {
  if (!_isResizing) return;
  _isResizing = false;
  document.body.classList.remove("ai-tools-sidetab-resizing");
  // Persist
  const sidetab = document.getElementById(SIDETAB_ID);
  if (sidetab) {
    try { localStorage.setItem(STORAGE_KEY, String(sidetab.offsetWidth)); } catch {}
  }
}

// ════════════════════════════════════════════════════════════
// Init
// ════════════════════════════════════════════════════════════

let _initialized = false;

export function initAiToolsSidetab(): void {
  if (_initialized) return;
  _initialized = true;

  // Restore width từ localStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      let w = parseInt(saved, 10);
      if (!isNaN(w)) {
        const maxW = window.innerWidth * MAX_WIDTH_VW;
        if (w < MIN_WIDTH) w = MIN_WIDTH;
        if (w > maxW) w = maxW;
        document.documentElement.style.setProperty("--ai-tools-width", `${w}px`);
      }
    }
  } catch {}

  // Resize move/end listeners (delegation từ window)
  document.addEventListener("pointermove", onResizeMove);
  document.addEventListener("pointerup", onResizeEnd);
  document.addEventListener("pointercancel", onResizeEnd);

  // Re-clamp width on window resize
  window.addEventListener("resize", () => {
    const sidetab = document.getElementById(SIDETAB_ID);
    if (!sidetab) return;
    const cur = sidetab.offsetWidth;
    const maxW = window.innerWidth * MAX_WIDTH_VW;
    if (cur > maxW) {
      document.documentElement.style.setProperty("--ai-tools-width", `${maxW}px`);
    }
  });

  // Esc to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const sidetab = document.getElementById(SIDETAB_ID);
      if (sidetab?.classList.contains("is-open")) closeAiToolsSidetab();
    }
  });

  // Expose globals (used by global-delegation cases)
  (window as any).toggleAiToolsSidetab = toggleAiToolsSidetab;
  (window as any).closeAiToolsSidetab = closeAiToolsSidetab;
  (window as any).onAiToolsTabSwitch = onAiToolsTabSwitch;
  (window as any).onAiToolsResizeStart = onAiToolsResizeStart;

  // R132b: Paper Library globals (lazy import để không block init)
  import("../papers/paper-upload").then((m) => {
    (window as any).onPaperPickClick = m.onPaperPickClick;
    (window as any).onPaperFileSelected = m.onPaperFileSelected;
    (window as any).onPaperDragOver = m.onPaperDragOver;
    (window as any).onPaperDragLeave = m.onPaperDragLeave;
    (window as any).onPaperDrop = m.onPaperDrop;
  });
  import("../papers/paper-list").then((m) => {
    (window as any).onPaperDelete = m.onPaperDelete;
  });
  import("../papers/paper-extract").then((m) => {
    (window as any).onPaperReExtract = m.onPaperReExtract;
  });
  import("../papers/paper-search").then((m) => {
    (window as any).onPaperSearchSubmit = m.onPaperSearchSubmit;
    (window as any).onPaperSearchKeydown = m.onPaperSearchKeydown;
    (window as any).onPaperSearchClear = m.onPaperSearchClear;
  });

  // R132b: Drag/drop native events (KHÔNG đi qua data-action vì native API)
  document.addEventListener("DOMContentLoaded", () => {
    const dz = document.getElementById("ai-paper-dropzone");
    if (dz) {
      dz.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add("is-dragover");
      });
      dz.addEventListener("dragleave", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove("is-dragover");
      });
      dz.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove("is-dragover");
        const files = (e as DragEvent).dataTransfer?.files;
        if (!files || files.length === 0) return;
        const mod = await import("../papers/paper-upload");
        for (const file of Array.from(files)) {
          await mod.uploadPaper(file);
        }
      });
    }
  });
}
