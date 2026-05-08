# CHANGELOG

Concise version history. For full git log: `git log --oneline`.

## [Round 115a-d] - 2026-05-08

### Added — Action Tools với Confirm UI Pattern
- **3 write tools** (superadmin only):
  - `createExperimentDraft` (hydro + electrochem categories)
  - `updateChemicalStockDraft` (search by name/CAS/formula, calculate new value)
  - `createBookingDraft` (search equipment, validate time slots)
- **Draft confirmation pattern**: Tool returns `DRAFT` (NOT write DB) → frontend renders inline confirmation card → user click "Xác nhận" → POST `/confirmAction` commits to RTDB + audit log
- **NEW Cloud Function**: `confirmAction` (asia-southeast1, superadmin verify)
- **NEW files**:
  - `functions/src/handlers/confirm-action.ts`
  - `functions/src/tools/actions.ts` (4 functions: 3 draft generators + commitDraft)
  - `src/ts/ai/ui/confirmation-card.ts` (~250 lines, render + handlers)
- **Audit log**: `actionAudit/{ts}` với uid, action, targetPath, resultKey

### Modified
- `functions/src/tools/registry.ts` — refactored `executeTool(name, args, context: {uid})`, added 3 action tools, exported `ACTION_TOOL_NAMES`
- `functions/src/handlers/tool-executor.ts` — split role check (action tools require superadmin)
- `src/ts/ai/llm/system-prompt.ts` — added "ACTION TOOLS" section với trigger keywords + examples + anti-refusal directive
- `src/ts/ai/llm/gemini-client.ts` — embed `<!--AI_DRAFT:base64-->` marker khi tool returns draft
- `src/ts/ai/ui/markdown-render.ts` — extract markers → span placeholder → DOMPurify sanitize → re-inject card HTML (bypass sanitize for trusted content)
- `src/ts/services/global-delegation.ts` — handle `ai-confirm-action`, `ai-cancel-action`
- `src/css/ai-chat.css` — confirmation card styles (cyan theme, 3 states: pending/confirmed/cancelled)

### Fixed (R115a2, R115b-fix, R115d-v2/v3/v4)
- `TOOL_NAMES` order: `Object.keys(TOOLS)` computed BEFORE action tools merged → fixed với `TOOL_NAMES.push(...)` after assign
- R115b boundary mismatch (file thực tế có blank lines giữa blocks)
- DOMPurify strip card HTML: thử nhiều placeholder formats (`__FOO__` → markdown parse `<strong>`, HTML comment → strip, finally span + data-idx)

### Permission
- Chỉ **superadmin** dùng được action tools
- Backend: `tool-executor.ts` pre-check `ACTION_TOOL_NAMES.includes(name)` → require superadmin
- `confirmAction` endpoint: separate verify

## [Round 114a-b3] - 2026-05-07

### Added — Voice STT/TTS (Phase A item D)
- **Backend**: `speechProxy` Cloud Function (asia-southeast1)
  - Forward audio to Google Cloud Speech v2 với Chirp 2 model
  - Single language `vi-VN` (asia-southeast1 không support multi-lang recognition)
  - Default service account: `478810777276-compute@developer.gserviceaccount.com`
- **Frontend voice module**: `src/ts/ai/voice/`
  - `speech-recorder.ts` — MediaRecorder wrapper, max 30s, blob → base64 → speechProxy
  - `text-to-speech.ts` — Browser native `speechSynthesis` với vi-VN voice priority
  - `types.ts` — TypeScript interfaces
- **UI buttons**:
  - Mic button trong input area (cyan, pulse red khi record, yellow khi processing)
  - Speaker button trong assistant message bubble (đọc to bằng vi-VN voice)

### Modified
- `firebase.json` — `Permissions-Policy: microphone=(self)` (default deny → allow same-origin)
- `index.html` — added mic button HTML
- `src/css/ai-chat.css` — mic + speaker animations (pulse keyframes)
- `src/ts/ai/ui/message-bubble.ts` — added speaker button trong `ai-msg__actions`
- `src/ts/ai/ui/chat-sidetab.ts` — `onAiMicToggle` + `onAiMsgSpeak` handlers
- `src/ts/services/global-delegation.ts` — `ai-mic-toggle` + `ai-msg-speak` routes

### Manual setup required (1 lần)
- Enable `speech.googleapis.com` API
- Grant **Cloud Speech Client** role to compute service account

## [Round 113a-b3] - 2026-05-07

### Added — UI Polish + Reliability
- **Stop button** ⏹ — `AbortController` save partial response với `_(Đã dừng)_`
- **Regenerate button** 🔄 — delete last assistant message + re-stream với history
- **Auto-rename conversation** — `title-generator.ts` background gen 3-6 word Vietnamese title sau message đầu
- **Better error toasts** — parse HTTP 429/401/500 → friendly Vietnamese messages

### Fixed (R113a/a2/a3)
- **Duplicate assistant bubble race condition**: chunk 1 await `appendMessageToDom` (slow markdown), chunk 2 fires DURING await → `assistantMsgEl=null` → tạo bubble nữa. Fix: sync flag `creatingBubble` locks immediately
- **Streaming stuck bug** (R113a2): `creatingBubble` blocks chunks 2-N during chunk 1 await, no catch-up after. Fix: `latestAccumulated` tracker + sync after bubble ready
- **CSP block KaTeX/highlight CSS** từ `cdn.jsdelivr.net`: added vào `style-src` + `style-src-elem` + `font-src` (R113a3)

### Modified
- `src/ts/ai/ui/message-handler.ts`, `message-bubble.ts`, `chat-sidetab.ts`
- `src/ts/ai/memory/conversation-store.ts`
- `src/ts/services/global-delegation.ts`
- `firebase.json` — CSP additions

## [Round 112+112b+112c] - 2026-05-06

### Added — Backend-side Tool Calling (Phase A item B+C)
- **6 read tools** via Cloud Function `toolExecutor`:
  - `searchChemicals` (name/CAS/formula, low_stock filter)
  - `searchEquipment` (status, location)
  - `searchExperiments` (4 categories: hydro/electrode/electrochem/ink)
  - `getBookings` (date filter)
  - `listMembers` (role filter)
  - `getCurrentDate` (VN timezone)
- **Function calling loop** trong `gemini-client.ts` (max 5 iterations)
- **Tool registry** `functions/src/tools/registry.ts` với JSON Schema definitions
- **System prompt** dạy AI khi nào gọi tool

### Fixed
- R112b: `normalizeDate` signature accept undefined
- R112c: removed visual marker for cleaner UX

## [Round 111+111b] - 2026-05-05

### Added — Real Gemini Flash Streaming
- **Cloud Function `geminiProxy`** (asia-southeast1, SSE streaming)
- **Secret manager**: `GEMINI_API_KEY` (Default Gemini Project Free tier key)
- **CSP**: added `*.cloudfunctions.net` vào `connect-src`

## [Round 109-110] - 2026-05-04

### Added — Chat Foundation
- **Conversation persistence**: `aiConversations/{uid}/{convId}` trong RTDB với role gate
- **Markdown rendering**: marked + KaTeX + highlight.js (lazy-loaded), DOMPurify sanitize
- **Message bubbles**: 4 styles (user/assistant/system/error)
- **Mock streaming** (placeholder before R111)

## [Round 108+108b] - 2026-05-03

### Added — AI Chat Sidetab UI Shell
- **Slide-out sidetab** (right side, 380px width, ⌘J toggle)
- **Draggable FAB** button (default bottom-right)
- **Conversation list** UI shell

## [Round 105] - 2026-05-02

### Added — AI Module Foundation
- **`src/ts/ai/`** skeleton: 38 folders, 50+ TypeScript stub files
- **Foundation docs**: `AI_ARCHITECTURE.md`, `DESIGN.md`, `WORKFLOW.md` (root)
- **`docs/ai/*`** + **`docs/design/*`** index files

### Modified
- `.env.example`, `.gitignore`, `CLAUDE.md`, `ROADMAP.md` (extended Phase A-E plan)

## [Round 104] - 2026-05-01

### Added — Claude Code System
- **`CLAUDE.md`** entry point cho AI agents
- **`ROADMAP.md`** future plans
- **`CHANGELOG.md`** version history
- **`.claude/`** (gitignored): config + memory + skills markdown files

## [Round 103a-b] - 2026-04-30

### Performance — Bundle Optimization
- Lazy-load jspdf + qrcode trong `qr-labels.ts`
- Removed unused `html2canvas` dep
- Vite `target: es2022` aligned với tsconfig
- `manualChunks` vendor-firebase chunk for long-term cache
- Rejected: lightningcss (no gain), SVG sprite (5KB saving not worth)
- **Lighthouse Mobile**: Performance 93, Accessibility 95, Best Practices 100, SEO 100

## [Round 95-102] - 2026-04-25 → 04-29

### Added — Origin Lab Integration
- Web "Mở bằng Origin" button generates `.ogs` LabTalk script
- Custom URL protocol `labbook-origin://` registered via `install.bat`
- Wrapper batch copies script to Origin User Files Folder (UFF)
- Origin executes via `-rs run.section(file.ogs, Main)`
- R102: replaced batch echo+escape with PowerShell template fill (avoid escape hell)

## [Round 91-94] - 2026-04-20 → 04-24

### Refactored
- R91: Folder rename `src/js/` → `src/ts/`
- R92-93: closePreview empty state restore + saved PNG matches preview
- R94: Tick padding clear of marks + handleFiles state='preview' + CSP frame-src blob

## [Round 71-72] - 2026-04-10

### Refactored — TypeScript Migration Complete
- All `.js` → `.ts` (300+ files)
- 24 large files với `@ts-nocheck`
- Strict mode partial: `noImplicitAny`, `strictNullChecks`, `noUnusedLocals/Parameters`
- AGENTS.md tracked in repo

## [Round 55-58e] - 2026-04-01 → 04-05

### Security — CSP Hardening
- All ~480 inline events removed (global delegation architecture)
- 2 inline scripts extracted (`threads-bg.js`, `mobile-sidebar.js`)
- Strict CSP applied
- **Mozilla Observatory**: 125/100 Grade A+
- `style-src` kept `'unsafe-inline'` (437 inline styles, separate phase)
