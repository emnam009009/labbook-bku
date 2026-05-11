/**
 * Citation Popover — Round 138b2b
 *
 * NotebookLM-style citation chips: click [1] [2] chip → popover shows
 * the actual chunk text from the source paper.
 *
 * Module-level Map keyed by message ID stores citations. Extracted from
 * <!--AI_CITATIONS:base64--> markers embedded by gemini-client during
 * searchPapers tool execution.
 */
// @ts-nocheck — AI module — partial typing (R105+ skeleton). Cleanup after RAG/streaming stabilization.

export interface Citation {
  position: number;
  chunkId: string;
  paperId: string;
  paperTitle: string;
  sectionPath: string;
  text: string;
  rerankScore?: number;
}

export type CitationsForMessage = Record<string, Citation>;  // key = position as string

// Module-level storage. Populated either from streaming marker extraction
// or from RTDB-loaded message.citations.
const _citationsByMsgId = new Map<string, CitationsForMessage>();

// ─────────────────────────────────────────────────────────
// Storage API
// ─────────────────────────────────────────────────────────
export function setCitations(msgId: string, citations: CitationsForMessage): void {
  if (!msgId || !citations) return;
  _citationsByMsgId.set(msgId, citations);
}

export function getCitation(msgId: string, position: number | string): Citation | null {
  const map = _citationsByMsgId.get(msgId);
  if (!map) return null;
  return map[String(position)] || null;
}

export function getAllCitations(msgId: string): CitationsForMessage | null {
  return _citationsByMsgId.get(msgId) || null;
}

export function clearCitations(msgId: string): void {
  _citationsByMsgId.delete(msgId);
}

/**
 * R138b2b-fix4: migrate citations from one msgId to another.
 *
 * Used when the streaming bubble had no msgId (saved as "" empty string)
 * and the real msgId is only known after the message is persisted to RTDB.
 *
 * If `from` map exists and `to` doesn't, copies and deletes `from`.
 * No-op if `from` doesn't exist.
 */
export function migrateCitations(fromMsgId: string, toMsgId: string): boolean {
  if (!fromMsgId || !toMsgId || fromMsgId === toMsgId) return false;
  const data = _citationsByMsgId.get(fromMsgId);
  if (!data) return false;
  _citationsByMsgId.set(toMsgId, data);
  _citationsByMsgId.delete(fromMsgId);
  return true;
}

// ─────────────────────────────────────────────────────────
// Marker extraction
// ─────────────────────────────────────────────────────────
const MARKER_RE = /<!--AI_CITATIONS:([A-Za-z0-9+/=]+)-->/g;

/**
 * Extract citations from <!--AI_CITATIONS:base64--> markers in text.
 * Stores into module map keyed by msgId. Returns text with markers removed.
 *
 * Idempotent: if called twice on same msgId, second call overrides
 * (latest tool execution wins).
 */
export function preprocessCitationMarkers(text: string, msgId: string): string {
  if (!text || !text.includes("AI_CITATIONS:")) return text;
  let extracted: CitationsForMessage = {};
  const stripped = text.replace(MARKER_RE, (_match, b64) => {
    try {
      const json = decodeURIComponent(escape(atob(b64)));
      const data = JSON.parse(json);
      // data is array OR map; normalize to map keyed by position
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && typeof item.position === "number") {
            extracted[String(item.position)] = item as Citation;
          }
        }
      } else if (data && typeof data === "object") {
        // Already in map shape
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object") {
            extracted[k] = v as Citation;
          }
        }
      }
    } catch (e) {
      console.warn("[citation-popover] Failed to parse citation marker:", e);
    }
    return "";  // strip marker
  });
  if (Object.keys(extracted).length > 0) {
    setCitations(msgId, extracted);
  }
  return stripped;
}

// ─────────────────────────────────────────────────────────
// DOM post-processing — turn [N] text into clickable chips
// ─────────────────────────────────────────────────────────
const CITATION_TEXT_RE = /\[(\d{1,2})\]/g;

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"\']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\'": "&#39;" } as any)[c]
  );
}

/**
 * Walk text nodes inside container; replace [N] patterns with chip spans.
 * Skips nodes inside <code>, <pre>, existing chips, or links — to avoid
 * mangling code blocks like array[0] or LaTeX.
 */
export function attachCitationChips(container: HTMLElement, msgId: string): void {
  const map = _citationsByMsgId.get(msgId);
  if (!map || Object.keys(map).length === 0) return;

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Skip code/pre/existing-chip parents
        const tag = parent.tagName;
        if (tag === "CODE" || tag === "PRE" || parent.classList.contains("citation-chip")) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip if no [N] or [N,M,...] pattern in node text
        const text = (node as Text).nodeValue || "";
        return /\[\d{1,2}(?:\s*,\s*\d{1,2})*\]/.test(text)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    } as any,
  );

  const toReplace: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    toReplace.push(node as Text);
    node = walker.nextNode();
  }

  for (const textNode of toReplace) {
    const text = textNode.nodeValue || "";
    // Build replacement DocumentFragment
    const frag = document.createDocumentFragment();
    let last = 0;
    let match: RegExpExecArray | null;
    // R138b2b-fix5: match BOTH [N] and combos like [2, 3, 4]
    const re = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;
    while ((match = re.exec(text)) !== null) {
      const inside = match[1]; // "2" or "2, 3, 4"
      // Split into individual position numbers
      const positions = inside.split(",").map((p) => p.trim()).filter(Boolean);
      // Filter out positions we have no citation data for
      const validPositions = positions.filter((p) => map[p]);
      if (validPositions.length === 0) continue;
      // Append text before match
      if (match.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      // R138b2b-fix5: Render one chip per position, side-by-side.
      // [2, 3, 4] → [2][3][4]   (cleaner than [2,3,4] single chip)
      validPositions.forEach((pos, idx) => {
        const chip = document.createElement("span");
        chip.className = "citation-chip";
        chip.dataset.msgId = msgId;
        chip.dataset.position = pos;
        chip.dataset.action = "citation-chip-click";
        chip.textContent = `[${pos}]`;
        const c = map[pos];
        const previewText = (c.text || "").slice(0, 80).replace(/\s+/g, " ");
        chip.title = `${c.paperTitle}\n${c.sectionPath}\n\n${previewText}…`;
        frag.appendChild(chip);
        // Tiny gap between consecutive chips of a combo
        if (idx < validPositions.length - 1) {
          frag.appendChild(document.createTextNode(""));
        }
      });
      last = match.index + match[0].length;
    }
    if (last === 0) continue;  // no replacements made (none had data)
    // Append remainder
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

// ─────────────────────────────────────────────────────────
// Popover (modal-like overlay)
// ─────────────────────────────────────────────────────────
let _popoverEl: HTMLElement | null = null;

function ensurePopoverEl(): HTMLElement {
  if (_popoverEl && document.body.contains(_popoverEl)) return _popoverEl;
  const el = document.createElement("div");
  el.className = "citation-popover";
  el.dataset.action = "citation-popover-bg";  // click outside to close
  el.innerHTML = `
    <div class="citation-popover__panel" data-action-skip="1">
      <div class="citation-popover__header">
        <div class="citation-popover__title-wrap">
          <span class="citation-popover__pos"></span>
          <span class="citation-popover__title"></span>
        </div>
        <button type="button" class="citation-popover__close"
                data-action="citation-popover-close"
                aria-label="Đóng">×</button>
      </div>
      <div class="citation-popover__section"></div>
      <div class="citation-popover__text"></div>
      <div class="citation-popover__footer">
        <span class="citation-popover__score"></span>
      </div>
    </div>
  `;
  el.style.display = "none";
  document.body.appendChild(el);
  _popoverEl = el;
  return el;
}

export function showCitationPopover(msgId: string, position: number | string): void {
  const c = getCitation(msgId, position);
  if (!c) {
    console.warn("[citation-popover] no citation for", msgId, position);
    return;
  }
  const pop = ensurePopoverEl();
  const posEl = pop.querySelector(".citation-popover__pos") as HTMLElement;
  const titleEl = pop.querySelector(".citation-popover__title") as HTMLElement;
  const sectionEl = pop.querySelector(".citation-popover__section") as HTMLElement;
  const textEl = pop.querySelector(".citation-popover__text") as HTMLElement;
  const scoreEl = pop.querySelector(".citation-popover__score") as HTMLElement;

  posEl.textContent = `[${c.position}]`;
  titleEl.textContent = c.paperTitle || c.paperId || "";
  sectionEl.textContent = c.sectionPath || "(no section)";
  // Render text as preformatted (preserve newlines but escape HTML)
  textEl.textContent = c.text || "";
  if (typeof c.rerankScore === "number") {
    scoreEl.textContent = `Rerank score: ${c.rerankScore.toFixed(3)}`;
    scoreEl.style.display = "";
  } else {
    scoreEl.style.display = "none";
  }
  pop.style.display = "flex";
}

export function hideCitationPopover(): void {
  if (_popoverEl) _popoverEl.style.display = "none";
}

// ─────────────────────────────────────────────────────────
// Global click delegation registration (idempotent)
// ─────────────────────────────────────────────────────────
let _delegationAttached = false;

export function attachGlobalCitationDelegation(): void {
  if (_delegationAttached) return;
  _delegationAttached = true;

  document.body.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    if (!target) return;

    // Citation chip click
    const chip = target.closest(".citation-chip") as HTMLElement | null;
    if (chip) {
      ev.preventDefault();
      ev.stopPropagation();
      const msgId = chip.dataset.msgId || "";
      const pos = chip.dataset.position || "";
      if (msgId && pos) showCitationPopover(msgId, pos);
      return;
    }

    // Popover close button
    if (target.closest('[data-action="citation-popover-close"]')) {
      hideCitationPopover();
      return;
    }

    // Click on background (not panel) → close
    if (target.classList.contains("citation-popover")) {
      hideCitationPopover();
      return;
    }
  });

  // ESC closes popover
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && _popoverEl && _popoverEl.style.display !== "none") {
      hideCitationPopover();
    }
  });
}
