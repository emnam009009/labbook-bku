/**
 * Markdown Renderer with Math + Code Highlight — Round 110
 *
 * Lazy-loads marked + marked-katex-extension + DOMPurify.
 * Highlight.js loaded on-demand khi gặp code block.
 *
 * @see /AI_ARCHITECTURE.md Section 5
 */
// @ts-nocheck — AI module — partial typing (R105+ skeleton). Cleanup after RAG/streaming stabilization.

let _markedInstance: any = null;
let _purify: any = null;
let _hljs: any = null;
let _initPromise: Promise<void> | null = null;

/**
 * Lazy-load all markdown deps.
 * Returns cached promise if already initiated.
 */
async function ensureLoaded(): Promise<void> {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Load marked + KaTeX extension + DOMPurify in parallel
    const [
      { marked },
      markedKatexModule,
      DOMPurifyModule,
    ] = await Promise.all([
      import("marked"),
      import("marked-katex-extension"),
      import("dompurify"),
    ]);

    const markedKatex = markedKatexModule.default;
    _purify = DOMPurifyModule.default;

    // Configure marked with KaTeX support
    marked.use(markedKatex({
      throwOnError: false,
      nonStandard: true,  // R136c-fix: cho phép $...$ không cần space xung quanh
    }));

    // Configure marked options
    marked.setOptions({
      breaks: true,         // Line break = <br>
      gfm: true,            // GitHub-flavored markdown
    });

    _markedInstance = marked;

    // Inject KaTeX CSS via CDN if not already loaded
    if (!document.getElementById("katex-css")) {
      const link = document.createElement("link");
      link.id = "katex-css";
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.45/dist/katex.min.css";
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
  })();

  return _initPromise;
}

/**
 * Lazy-load highlight.js (chỉ khi cần).
 */
async function ensureHljs(): Promise<any> {
  if (_hljs) return _hljs;
  const mod = await import("highlight.js/lib/common");
  _hljs = mod.default;

  // Inject highlight.js CSS
  if (!document.getElementById("hljs-css")) {
    const link = document.createElement("link");
    link.id = "hljs-css";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github.min.css";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
  return _hljs;
}

/**
 * Render markdown text to safe HTML.
 *
 * @param text Markdown source
 * @returns Safe HTML string (sanitized)
 */
export async function renderMarkdown(text: string): Promise<string> {
  await ensureLoaded();

  // Round 115d v4: Extract AI_DRAFT markers TRƯỚC khi render markdown.
  // Card HTML self-generated từ confirmation-card.ts là trusted source.
  // Dùng <span> placeholder (DOMPurify keeps spans + data-idx via ADD_ATTR)
  // thay vì __FOO__ (markdown parse) hoặc HTML comment (DOMPurify strip).
  const draftMarkers: string[] = [];
  const textWithPlaceholders = text.replace(
    /<!--AI_DRAFT:[A-Za-z0-9+/=]+-->/g,
    (match) => {
      const idx = draftMarkers.length;
      draftMarkers.push(match);
      return `<span class="aidr-ph" data-idx="${idx}"></span>`;
    }
  );

  // Parse markdown to HTML
  const rawHtml = await _markedInstance.parse(textWithPlaceholders);

  // Sanitize (Round 115d v4: ADD data-idx for placeholder spans)
  let cleanHtml = _purify.sanitize(rawHtml, {
    ADD_TAGS: ["math", "annotation", "semantics", "mrow", "mn", "mo", "mi", "msup", "msub", "mfrac", "msqrt", "mtable", "mtr", "mtd"],
    ADD_ATTR: ["xmlns", "encoding", "display", "data-idx"],
  });

  // Round 115d v4: Re-inject confirmation card HTML (trusted source).
  if (draftMarkers.length > 0) {
    const { preprocessDraftMarkers } = await import("./confirmation-card");
    // Match span placeholder, accept whitespace/attribute order variations
    cleanHtml = cleanHtml.replace(
      /<span\s+[^>]*?class="aidr-ph"[^>]*?data-idx="(\d+)"[^>]*?><\/span>/g,
      (_match, idx) => {
        const marker = draftMarkers[parseInt(idx, 10)];
        return preprocessDraftMarkers(marker);
      }
    );
    // Also handle reversed attribute order (data-idx first, class second)
    cleanHtml = cleanHtml.replace(
      /<span\s+[^>]*?data-idx="(\d+)"[^>]*?class="aidr-ph"[^>]*?><\/span>/g,
      (_match, idx) => {
        const marker = draftMarkers[parseInt(idx, 10)];
        return preprocessDraftMarkers(marker);
      }
    );
  }

  return cleanHtml;
}

/**
 * Highlight code blocks in container after render.
 * Async — không block render.
 */
export async function highlightCodeBlocks(container: HTMLElement): Promise<void> {
  const codeBlocks = container.querySelectorAll("pre code");
  if (codeBlocks.length === 0) return;

  const hljs = await ensureHljs();
  codeBlocks.forEach((block: any) => {
    if (!block.classList.contains("hljs")) {
      hljs.highlightElement(block);
    }
  });
}

/**
 * Add copy button to each code block.
 */
export function addCodeBlockCopyButtons(container: HTMLElement): void {
  const preBlocks = container.querySelectorAll("pre");
  preBlocks.forEach((pre: HTMLElement) => {
    if (pre.querySelector(".ai-code-copy")) return; // Already added

    const btn = document.createElement("button");
    btn.className = "ai-code-copy";
    btn.type = "button";
    btn.setAttribute("aria-label", "Copy code");
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    `;

    btn.addEventListener("click", () => {
      const code = pre.querySelector("code");
      if (!code) return;
      const text = code.textContent || "";
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add("is-copied");
        setTimeout(() => btn.classList.remove("is-copied"), 1500);
      });
    });

    pre.style.position = "relative";
    pre.appendChild(btn);
  });
}
