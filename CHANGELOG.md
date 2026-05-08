# CHANGELOG

Concise version history. For full git log: `git log --oneline`.

## [Round 126] - 2026-05-08

### Added — Resizable AI sidetab
- **Drag handle** ở mép trái sidetab AI: 6px wide, cyan accent on hover/active
- **CSS var driven** (`--ai-sidetab-width`): inner content tự co dãn theo
- **Pointer events** (mouse/touch/pen): pointerdown → drag → release với `pointermove`/`pointerup`
- **Persist** vào `localStorage[ai-chat-sidetab-width]`, restore khi mount
- **Clamp**: min 320px, max 85vw, auto re-clamp khi window resize
- **Keyboard a11y**: Arrow Left/Right (Shift = step 50px) khi handle focused
- **Mobile**: handle ẩn (<480px, sidetab full width)

### Modified
- `index.html` — `<div class="ai-sidetab__resizer">` ở đầu sidetab
- `src/css/ai-chat.css` — `.ai-sidetab__resizer` + `body.ai-sidetab-resizing` rules
- `src/ts/ai/ui/chat-sidetab.ts` — `initSidetabResize()` cùng `initFabDrag()`

## [Round 125] - 2026-05-08

### Fixed — Console cleanup (cosmetic, not functional)
- **PWA meta deprecated**: thêm `<meta name="mobile-web-app-capable">` cạnh `apple-mobile-web-app-capable` (giữ cả 2 cho Safari cũ)
- **ServiceWorker MIME error ở dev**: wrap register trong `import.meta.env.PROD` — Vite dev không generate `sw.js` → request fallback `index.html` → MIME error
- **Password field warning**: wrap `#admin-pw` trong `<form>` với `name="password"` + `autocomplete="current-password"`. CSP strict → dùng `data-noop-submit="1"` thay `onsubmit="return false"` inline. Bind global submit handler trong `global-delegation.ts`.

### Modified
- `index.html`, `src/ts/main.ts`, `src/ts/services/global-delegation.ts`

## [Round 124] - 2026-05-08

### Fixed — UI/UX
- **Bug E**: Menu "Nhập/xuất dữ liệu" giờ chỉ admin/superadmin. CSS hide trigger `[data-action="exp-actions-menu"]` cho `body.{member|viewer|pending|rejected}-mode` + JS gate ở action handler (defense-in-depth).
- **Bug F**: File picker không trigger được khi click "Chọn file". Root cause: `<input type="file" hidden>` HTML5 attribute → 1 số browser không trigger picker qua label association. Fix: thay `hidden` bằng visually-hidden CSS + thêm explicit click handler trên label làm fallback.
- **Bug G**: Print window QR labels và confirm dialog thiếu dấu Vietnamese (`Dong`, `nhan QR`, `Tai PDF`...). Fix toàn bộ thành chữ có dấu.

### Modified
- `src/css/main.css` (CSS hide rule), `src/ts/pages/experiments.ts` (JS gate), `src/ts/services/qr-labels.ts`, `src/ts/ui/attachments-panel.ts`

## [Round 123] - 2026-05-08

### Fixed — Members KPI card scroll
- Card "Thành viên lab" trên dashboard hardcode `slice(0, 4)` → khi tăng thành viên thì card cao bất thường (xấu vs neighbors).
- Bỏ slice → render tất cả members → wrap trong `dash-scroll` div với `max-height: 104px` (2 hàng × 52px). Dùng class `dash-scroll` đã có sẵn (booking card cùng card row).

### Modified
- `src/ts/pages/dashboard.ts`

## [Round 122] - 2026-05-08

### Added — Notification security overhaul + migration script + lock cleanup

**Bug 13 — Notification schema flat → nested per-user:**
- R121 unblock bell empty bằng cách relax rules cho `notifications` flat. Trade-off: mọi member đọc được mọi notification.
- R122 fix proper: schema `notifications/{uid}/{notifId}` (nested per-user) + `_admin` fallback bucket.
- **`createNotification` fan-out**: target cụ thể → 1 write. Broadcast admin → fetch admin list từ `cache.users` → multi-write per admin. Fallback: `notifications/_admin/{notifId}` nếu member không có quyền đọc users.
- **Listeners**: per-user listen `notifications/{myUid}` thay vì full `notifications`. Admin/superadmin listen thêm `notifications/_admin`.
- **Rules strict**: `auth.uid === $uid || $uid === '_admin'`. `.write` cho member+ ghi mọi path (cần cho fan-out — trade-off thấp với 50-user app).

**Bug 14 — Stale lock cleanup (R119 edge case):**
- `cleanupStaleLocks()`: throttled 5min, admin-only, fire-and-forget từ `renderBooking`
- Drops `tmp_*` slots > 60s, removes slots cho bookings không tồn tại, syncs status mismatch

**Migration script (`scripts/migrate-notifications-r122.mjs`):**
- One-shot Node.js script với `firebase-admin` SDK
- Backup tự động → in plan → hỏi `yes/no` → atomic apply
- Idempotent: phân biệt flat vs nested entries qua heuristic
- 111 flat notifications migrated (26 direct + 85 broadcast × 1 admin = 111 entries)

### Modified
- `database.rules.json`, `src/ts/services/notifications.ts`, `src/ts/services/listeners.ts`, `src/ts/pages/booking.ts`
- New: `scripts/migrate-notifications-r122.mjs`, `package.json` (firebase-admin devDep + `migrate:notifications` script)
- `.gitignore` — exclude `serviceAccountKey.json`, `backup-notifications-*.json`

### Deploy notes
- Migration phải chạy **TRƯỚC** deploy code mới (code mới chỉ đọc nested path — flat data vô hình)
- Workflow: `npm run migrate:notifications` → `npm run build && firebase deploy --only hosting,database` → push

## [Round 121] - 2026-05-08

### Fixed — UI/UX bugs

- **Bug A — Search box stuck expand sau navigate**: `closeDropdown` dùng `removeProperty` xóa inline styles → element không có width inline → render kì lạ. `mouseleave` collapse có check `if (i.value)` skip nếu input còn value → stuck.
  - Fix: `closeDropdown` set explicit `width:40px; border-radius:50%`. `showPage` reset search box state mỗi navigate (clear value, blur, collapse).
- **Bug B — Bulk select missing**:
  - Booking: `<tr>` không có `data-key`. Member viewing booking không phải của mình → action cell rỗng → bulk-actions không tìm được key.
  - Ink: dùng `data-ink-action`/`data-ink-key` (custom) không phải `data-action`/`data-key`.
  - Fix: thêm `data-key="${r._key}"` vào `<tr>` cả 2 file.
- **Bug C — Member card del-btn position varied**: card không có flex column → del button cao theo content. Fix: `.member-card { display: flex; flex-direction: column; height: 100% }` + `.member-del-btn { margin-top: auto; align-self: flex-end }`.
- **Bug D — Bell empty (notifications schema mismatch)**: code `fbPush('notifications', notif)` push flat path, rules expect nested → silent deny. Quick fix R121: relax rules cho flat path. **Trade-off security**: refactor proper trong R122.

### Modified
- `src/ts/services/global-search.ts`, `src/ts/ui/navigation.ts`, `src/ts/pages/booking.ts`, `src/ts/pages/ink.ts`, `src/css/main.css`, `database.rules.json`

## [Round 120] - 2026-05-08

### Fixed — Booking race condition (drag/drop + resize)
Bug 3 continued — R119 fix saveBooking, R120 mở rộng cho drag/drop + resize:

- **Helper mới `tryReserveSlotForUpdate(eqKey, oldDate, newDate, newStart, newEnd, bookingKey)`**:
  - Atomic transaction trên `booking_locks/{eqKey}_{newDate}`
  - Cùng date (chỉ đổi giờ): xóa slot cũ + thêm slot mới trong cùng 1 transaction → no race window
  - Đổi date: thêm slot mới ở date mới (slot cũ ở date cũ release riêng sau)
- `calOnDrop` (drag/drop): atomic reserve trước khi update record, rollback slot mới nếu push fail, release slot cũ nếu đổi date
- `dayOnResizeEnd` (resize): atomic reserve cùng date với self-exclusion, rollback slot nếu push fail

**Behavior change**: Admin không còn force-override conflict được. Server enforces no overlap.

### Modified
- `src/ts/pages/booking.ts`

## [Round 119] - 2026-05-08

### Fixed — Booking race condition (saveBooking)
Bug 3 — `saveBooking` cache-only check + non-atomic push → 2 user concurrent đặt cùng giờ → silent duplicate.

**Architecture**: New path `booking_locks/{equipmentKey}_{date}` với `slots: [{start, end, bookingKey, status}]` array.

- **`tryReserveSlot(eqKey, date, start, end, tempId)`**: `runTransaction` với overlap check trên slots active (pending/approved/in-use). Trả `{ok, conflict?, lockKey}`.
- **`updateSlotStatus(eqKey, date, bookingKey, newStatus, matchTempId?)`**: cleanup khi reject/cancel/complete (remove slot).
- **Flow saveBooking**: tryReserveSlot với tempId → fbPush booking → updateSlotStatus(tempId → realKey).
- **Status handlers cleanup slot**: confirmRejectBooking, cancelBooking, checkInBooking, checkOutBooking, deleteBooking, autoCancelOverdueBookings.

### Modified
- `src/ts/pages/booking.ts`, `database.rules.json` (thêm `booking_locks` rule)

## [Round 118] - 2026-05-08

### Fixed — Stock race + image bloat

- **Bug 10 — Stock race (saveHydro/saveElectrode)**: Read `cache.chemicals[X].stock`, compute `newStock = curStock - delta`, write. 2 user concurrent consume cùng hóa chất → lost data (vd 100g - 50g - 30g concurrent → kết quả 70g thay vì 20g).
- **Bug 11 — Stock leak (delItem)**: refund stock sequentially with `await update` per chemical → fail mid-loop + retry → double refund.
- **Fix cả 2**: helper `incrementStock(chemKey, delta, precision)` trong `firebase.ts` dùng `runTransaction` (atomic server-side read-modify-write). Replace 4 sites trong save-handlers + 2 sites trong duplicate-delete (delete + undo).

- **Bug 12 — Image upload size**: 7 image upload handlers no size check → user push 10MB+ base64 vào RTDB. Fix: helper `validateImageFile(file)` (max 800KB raw, MIME check) wired into ink/electrode/hydro/chemical drop-cell/chemical-upload/equipment-preview/equipment-drop-cell.

### Modified
- `src/ts/firebase.ts`, `src/ts/services/save-handlers.ts`, `src/ts/services/duplicate-delete.ts`, `src/ts/services/image-handlers.ts`

## [Round 117] - 2026-05-08

### Fixed — Storage cleanup + recall rule + escapeJs XSS

- **Bug 7 — Orphan storage**: `uploadAttachment` post-upload steps (getDownloadURL, fbSet) có thể fail → file kẹt trong Storage làm bloat 5GB Spark quota. Fix: wrap fbSet trong try/catch với `deleteObject` rollback.
- **Bug 8 — Chat message recall rule**: rule `hasChildren(['uid','ts','text']) && uid === auth.uid` block recall (text=null fail hasChildren) và superadmin moderation (uid mismatch). Relax thành `hasChildren(['uid','ts']) && (recalled === true || text valid) && (uid === auth.uid || data.exists())`.
- **Bug 9 — escapeJs XSS**: không escape `"` → XSS qua `data-name="${escapeJs(member.name)}"` ở 3 sites delete buttons. Add `.replace(/"/g, '&quot;')`.

### Modified
- `src/ts/utils/format.ts`, `src/ts/services/attachments.ts`, `database.rules.json`, `src/ts/utils/format.test.ts`

## [Round 116] - 2026-05-08

### Fixed — Listener leak, presence stuck, XSS edit modals

- **Bug 1 — `loadUserRole` listener leak**: `onValue` không unsubscribe → leak khi logout/relogin, có thể overwrite `currentAuth.role` cross-user. Fix: track `_roleUnsub` + add `stopRoleListener()`.
- **Bug 2 — Presence stuck online**: `stopPresence()` gọi SAU `signOut(auth)` → rule `auth.uid === $uid` deny write → presence stuck `online: true`. Fix: move `stopPresence()` TRƯỚC `signOut()` trong logout.
- **Bug 4 — XSS edit modal**: `editHydro`/`editInk` rows interpolate `chem.name`/`s.name`/`l.name` vào `value="..."` không escape. Fix: wrap 3 sites với `escapeHtml()`.

### Modified
- `src/ts/auth.ts`, `src/ts/services/edit-handlers.ts`

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
