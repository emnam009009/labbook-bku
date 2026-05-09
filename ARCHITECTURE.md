# Architecture

Tài liệu này mô tả kiến trúc, luồng dữ liệu, và quy ước code của LabBook BKU.

> **Last updated**: Round 138 (May 9 2026), sau Phase B.3 (RAG with NotebookLM citations).
> Cho deep-dive về AI module xem `AI_ARCHITECTURE.md`. Cho debug regression xem `AUDIT_LOG.md`.

---

## 🎯 Triết lý thiết kế

- **TypeScript ESM, không framework UI** — Vanilla DOM với event delegation. Không React/Vue. Lý do: nhẹ, ít deps, dễ debug, bundle nhỏ.
- **Single Page App** — Tất cả content trong `index.html`, JS điều khiển hiển thị qua class `.active` trên các `.page`.
- **Firebase RTDB làm primary backend** — Realtime sync cho data, Auth cho user, Hosting cho deploy. Cloud Functions (asia-southeast1, Blaze plan) cho AI proxy + speech + action commit.
- **Realtime first** — Mọi thay đổi data đều sync qua Firebase listeners → re-render. Không có "save button" cho user — mọi update push trực tiếp lên DB.
- **CSP strict + global delegation** — Không inline `onclick`, dùng `data-action` + global delegation handler (xem R55-58e). Mozilla Observatory 125/100 A+.
- **Patches-driven workflow** — Thay đổi code qua git diff patches từ `/mnt/d/labbook-patches/`. Audit history rõ ràng mỗi round (xem CHANGELOG.md).

---

## 📁 Cấu trúc thư mục

```
labbook/
├── index.html                          # SPA shell, ~1900 lines, all modals + page containers
├── src/
│   ├── ts/                             # Frontend TypeScript (ESM)
│   │   ├── main.ts                     # Entry point, init flow, lazy loaders, window globals
│   │   ├── firebase.ts                 # Init Firebase + helpers (fbSet/fbGet/fbListen/fbPush/runTransaction/incrementStock)
│   │   ├── auth.ts                     # Auth core (login, register, role listener với unsub tracking — R116)
│   │   ├── state.ts                    # Module-level state shared
│   │   ├── labbook-extensions.ts       # Legacy (deprecate dần)
│   │   │
│   │   ├── pages/                      # 1 file = 1 page
│   │   │   ├── auth-flow.ts            # Login/Register/Logout UI
│   │   │   ├── dashboard.ts            # Trang chủ với KPI cards, charts, recent activity
│   │   │   ├── experiments.ts          # Hydrothermal + Electrode + Electrochem dispatcher
│   │   │   ├── chemicals.ts            # Quản lý hóa chất (stock, group, CAS lookup)
│   │   │   ├── ink.ts                  # Mực in điện cực
│   │   │   ├── equipment.ts            # Thiết bị
│   │   │   ├── booking.ts              # Đặt lịch + week time-grid + booking_locks transaction (~1900 lines)
│   │   │   ├── members.ts              # Thành viên lab
│   │   │   ├── users.ts                # User accounts management (admin only)
│   │   │   ├── history.ts              # Audit log viewer (admin only)
│   │   │   ├── chat.ts                 # Group chat
│   │   │   ├── overview.ts             # Cross-experiment overview (R77c+)
│   │   │   ├── reports.ts              # Monthly reports PDF
│   │   │   ├── settings.ts             # User profile + lab title/subtitle
│   │   │   └── workbench/              # AI Workbench (Phase B+ skeleton)
│   │   │
│   │   ├── services/                   # Business logic, không trực tiếp render
│   │   │   ├── listeners.ts            # Firebase listeners — SMALL_COLLECTIONS + LARGE_COLLECTIONS_CONFIG + per-user notifications (R122)
│   │   │   ├── presence.ts             # Online/offline tracking (start/stop ordering critical — R116)
│   │   │   ├── notifications.ts        # Bell + toast — fan-out per recipient nested schema (R122)
│   │   │   ├── notifications-hooks.ts  # Auto-create notification trên save/approve/reject events
│   │   │   ├── render-dispatcher.ts    # Gọi đúng renderXxx() cho page active
│   │   │   ├── theme-manager.ts        # Theme switching (color tokens via CSS vars)
│   │   │   ├── theme-picker-ui.ts      # Color picker dropdown
│   │   │   ├── avatar.ts               # User avatar generation (initial/color)
│   │   │   ├── avatar-menu-a11y.ts     # ARIA + keyboard nav
│   │   │   ├── save-handlers.ts        # Form save (saveHydro/saveElectrode/saveElectrochem/saveInk) — atomic stock via incrementStock (R118)
│   │   │   ├── edit-handlers.ts        # Inline row edit — escapeHtml on values (R116 XSS fix)
│   │   │   ├── image-handlers.ts       # Upload/paste/drop với validateImageFile (R118)
│   │   │   ├── form-helpers.ts         # Calc loading, lookup CAS, compute formula
│   │   │   ├── group-lock-mgmt.ts      # Nhóm + lock items (locked items immutable)
│   │   │   ├── duplicate-delete.ts     # Duplicate row + delete + undo — atomic stock (R118)
│   │   │   ├── attachments.ts          # Storage upload với rollback (R117 orphan fix)
│   │   │   ├── attachment-classifier.ts # Auto-detect category (XRD/UV-Vis/PL/Raman/...)
│   │   │   ├── bulk-actions.ts         # Bulk select + bulk export/lock/delete
│   │   │   ├── bulk-multi-select.ts    # Multi-select state
│   │   │   ├── bulk-row-style.ts       # CSS hooks cho bulk select rows
│   │   │   ├── date-range-filter.ts    # Filter theo khoảng ngày (DD/MM/YYYY)
│   │   │   ├── member-filter.ts        # Filter theo thành viên
│   │   │   ├── global-search.ts        # Top-bar search với reset trên navigate (R121)
│   │   │   ├── global-delegation.ts    # Single delegation handler cho data-action (CSP strict)
│   │   │   ├── excel-export.ts         # SheetJS XLSX export
│   │   │   ├── pdf-report.ts           # pdfmake monthly report (lazy-loaded, R103)
│   │   │   ├── pdf/                    # PDF utilities
│   │   │   ├── parsers/                # Reusable parsers (corrware, jcamp-jasco, detect)
│   │   │   ├── plot/                   # Tauc plot, bandgap fit, OffscreenCanvas worker
│   │   │   ├── qr-labels.ts            # QR label print + jspdf (lazy-loaded, R103) — VN diacritics fixed (R124)
│   │   │   ├── origin-labtalk.ts       # .ogs script gen cho Origin Lab (R95-102)
│   │   │   ├── origin-launcher.ts      # `labbook-origin://` protocol launcher
│   │   │   ├── booking-suggestions.ts  # Smart suggest free slots
│   │   │   ├── table-sort.ts           # Header click sort
│   │   │   ├── table-align.ts          # Layout helper
│   │   │   ├── custom-select-keyboard.ts # Keyboard nav cho custom selects
│   │   │   ├── a11y-enhancements.ts    # ARIA + focus management
│   │   │   ├── history-log.ts          # Helper ghi history collection
│   │   │   ├── mobile-sidebar.ts       # Mobile drawer (extracted inline script — R58)
│   │   │   └── sticky-header.ts        # Sticky table headers
│   │   │
│   │   ├── ui/                         # UI primitives, không phụ thuộc business logic
│   │   │   ├── modal.ts                # Open/close modal + hooks
│   │   │   ├── toast.ts                # Show/hide toast với undo button
│   │   │   ├── navigation.ts           # showPage (resets header search — R121) + sidebar toggle
│   │   │   ├── custom-selects.ts       # Custom dropdown
│   │   │   ├── attachments-panel.ts    # File picker + dropzone (visually-hidden input — R124)
│   │   │   ├── exp-actions-menu.ts     # 3-line menu Nhập/Xuất (admin-only — R124)
│   │   │   ├── pdf-export-modal.ts     # PDF preview before export
│   │   │   ├── pdf-preview-lightbox.ts # Lightbox cho PDF view
│   │   │   ├── image-lightbox.ts       # Lightbox cho ảnh
│   │   │   ├── overview-modal.ts       # Cross-experiment overview popup
│   │   │   ├── upload-busy-overlay.ts  # Spinner trong khi upload
│   │   │   └── drag-row-overview.ts    # Drag rows giữa experiments
│   │   │
│   │   ├── utils/                      # Pure functions, không side effect
│   │   │   ├── format.ts               # escapeHtml, escapeJs (R117 fix), vals, fuzzy, formatChemical, fmtDate
│   │   │   ├── dom.ts                  # flashRow, setText, setHtml
│   │   │   ├── async.ts                # safeAsync wrapper
│   │   │   ├── auth-helpers.ts         # canEdit, canDelete, getPersonName
│   │   │   ├── pagination.ts           # Pagination helper
│   │   │   └── display-limit.ts        # Show more/less for long lists
│   │   │
│   │   ├── types/                      # Shared TypeScript types
│   │   │
│   │   └── ai/                         # AI module (Phase A done, B+ in progress)
│   │       ├── llm/                    # gemini-client, system-prompt, types
│   │       ├── tools/                  # tool-client, tool-definitions
│   │       ├── ui/                     # chat-sidetab (resizable — R126), message-bubble, markdown-render, confirmation-card
│   │       ├── voice/                  # speech-recorder (STT), text-to-speech (TTS)
│   │       ├── memory/                 # conversation-store
│   │       └── core/, agent/, analyzers/, rag/, scientist/, provenance/, types/, python-bridge/
│   │              # Skeleton folders — implement Phase B-E
│   │
│   └── css/
│       ├── main.css                    # ~3300 lines, root vars + components + responsive
│       ├── tokens/                     # Design token files (Phase B+)
│       ├── components.css              # Reusable component classes
│       ├── dashboard.css               # Dashboard-specific
│       ├── attachments.css             # Attachments panel + dropzone
│       ├── ai-chat.css                 # AI chat sidetab + resizer (R126)
│       ├── argon-flavor.css            # Argon-style polish
│       ├── theme-swatches.css          # Color picker UI
│       ├── dark-mode.css               # Dark mode overrides
│       ├── mobile-ux.css               # Mobile-specific tweaks
│       ├── polish.css                  # Final visual polish
│       ├── sidebar-smooth.css          # Sidebar animations
│       ├── sticky-header.css           # Sticky table headers
│       └── fix-avatar-zindex.css       # Avatar dropdown z-index fix
│
├── functions/src/                      # Cloud Functions TypeScript (asia-southeast1)
│   ├── index.ts                        # Function exports
│   ├── handlers/
│   │   ├── gemini-proxy.ts             # SSE streaming Gemini 2.5 Flash với tool calling (R111)
│   │   ├── tool-executor.ts            # Dispatch 9 tools (6 read + 3 action) với role check (R112+R115a)
│   │   ├── speech-proxy.ts             # Cloud Speech v2 Chirp 2 STT (R114)
│   │   ├── confirm-action.ts           # Commit action drafts → RTDB + audit log (R115)
│   │   ├── python-bridge.ts            # Bridge tới Python service (Phase C+)
│   │   ├── secret-test.ts              # Dev/debug secret manager
│   │   └── hello.ts                    # Health check
│   ├── tools/
│   │   ├── registry.ts                 # TOOLS object + executeTool dispatcher
│   │   ├── chemicals.ts, equipment.ts,
│   │   ├── experiments.ts, bookings.ts,
│   │   ├── members.ts, utils.ts        # 6 read tools (R112)
│   │   └── actions.ts                  # 3 draft generators + commitDraft (R115)
│   └── utils/
│       ├── auth.ts                     # verifyAuth với role hierarchy
│       └── logger.ts
│
├── scripts/
│   ├── migrate-notifications-r122.mjs  # One-shot migration flat → nested (R122)
│   └── subset-fonts.mjs                # Font subsetting cho Vietnamese
│
├── database.rules.json                 # Firebase RTDB rules (strict per-uid notifications, booking_locks)
├── storage.rules                       # Storage rules (admin write only)
├── firebase.json                       # Hosting + Functions + CSP headers config
├── firestore.indexes.json              # Firestore Vector Search indexes (Phase B+)
├── .gitignore                          # serviceAccountKey.json, backup-notifications-*, etc.
└── package.json                        # firebase-admin devDep + npm run migrate:notifications
```

---

## 🔄 Data flow

### 1. Khởi động app

```
[index.html] loads, body{visibility:hidden} chống FOUC
    ↓
[main.ts] imports core modules + lazy loaders
    ↓
DOMContentLoaded
    ↓
[main.ts] initAuth() → onAuthStateChanged listener
    ↓
User đã login? → onLogin callback chạy
    ↓
[main.ts] startListeners()
    ↓
[listeners.ts] đăng ký:
    • LARGE_COLLECTIONS: hydro, electrode, electrochem, ink, bookings (limitToLast với orderBy)
    • SMALL_COLLECTIONS: chemicals, members, equipment, groups, eq_groups, presence
    • Per-user: notifications/{myUid} (R122 nested)
    • Admin-only: history (limit 500), notifications/_admin (R122)
    • Settings: subtitle
    ↓
Mỗi listener → window.cache[col] = data → dispatchEvent('cache-update')
    ↓
[render-dispatcher.ts] → renderXxx() cho page active
    ↓
Body class = '{role}-mode' → CSS hide/show admin-only / member-only elements
    ↓
[chat-sidetab.ts] initAiChatSidetab() — role gate (admin/superadmin only)
```

### 2. User action flow (ví dụ: tạo thí nghiệm hydro)

```
User click "Thêm thí nghiệm" → openModal('modal-hydrothermal')
    ↓
User điền form → click "Lưu"
    ↓
[global-delegation.ts] data-action="save-hydro" routes
    ↓
[save-handlers.ts] saveHydro() validate
    ↓
Atomic stock decrement: incrementStock(chemKey, -consumed) qua runTransaction (R118)
    ↓
fbPush('hydro', data) → trả về newKey
    ↓
Firebase listener tự nhận update → cache.hydro updated → renderHydro()
    ↓
[notifications-hooks.ts] auto-create notification:
    createNotification(type, refKey, targetUid=null)
    ↓
[notifications.ts] createNotification fan-out:
    • targetUid cụ thể → fbPush(notifications/{targetUid}/{notifId})
    • null (broadcast admin) → fetch admins → multi-write per admin
    • Fallback _admin bucket nếu không có quyền
    ↓
Admin's listener trên notifications/{adminUid} fires → bell badge update
```

### 3. Booking flow với atomic slot reservation (R119-R120)

```
User click "Đăng ký" → modal → click "Lưu"
    ↓
[booking.ts] saveBooking():
    1. Pre-flight cache check (UX feedback)
    2. tryReserveSlot(eqKey, date, start, end, tempId) → runTransaction
       trên booking_locks/{eqKey}_{date}, abort nếu overlap với active slots
    3. fbPush(bookings/...) → realKey
    4. updateSlotStatus(tempId → realKey)
       (nếu push fail → slot rollback giữ tempId, cleanupStaleLocks dọn sau)
    ↓
Notification → admin (broadcast)
    ↓
Admin approve/reject → updateSlotStatus update slot status
    ↓
Drag/drop hoặc resize: tryReserveSlotForUpdate (atomic remove old + add new)
```

### 4. AI chat flow (Phase A done)

```
User typed message in sidetab → click send (Ctrl+Enter)
    ↓
[message-handler.ts] append user bubble + persist conversation
    ↓
fetch geminiProxy (Cloud Function, SSE streaming)
    ↓
Gemini 2.5 Flash với system prompt + tools schema:
    • If tool call needed: gemini → toolExecutor (Cloud Function)
    • toolExecutor verify role + dispatch:
      - Read tool (chemicals/equipment/etc) → query RTDB → return data
      - Action tool (createExperiment/etc) → return DRAFT (no DB write)
    • Function calling loop max 5 iterations
    ↓
Stream chunks → markdown-render với placeholder for action drafts
    ↓
DOMPurify sanitize → re-inject confirmation-card HTML
    ↓
User click "Xác nhận" → POST confirmAction → verify superadmin → commit RTDB → audit log
    ↓
Card update: "✅ Đã tạo HT-xxx"
```

### 5. Realtime sync giữa nhiều client

Firebase RTDB push event xuống TẤT CẢ client đang listen (kể cả client gửi).
Không cần "refresh button" — UI luôn đồng bộ với DB.

---

## 🗄 Firebase Realtime Database schema

```
/
├── users/{uid}
│   ├── email
│   ├── displayName
│   ├── role               # superadmin | admin | member | viewer | pending | rejected
│   ├── createdAt
│   └── ...
│
├── hydro/{id}             # Thí nghiệm thủy nhiệt
├── electrode/{id}         # Thí nghiệm điện cực
├── electrochem/{id}       # Thí nghiệm điện hóa
├── ink/{id}               # Mực in điện cực
├── chemicals/{id}         # Hóa chất (stock atomic via runTransaction — R118)
├── equipment/{id}         # Thiết bị
├── members/{id}           # Thành viên lab
├── groups/{id}            # Nhóm hóa chất
├── eq_groups/{id}         # Nhóm thiết bị
│
├── bookings/{id}          # Đặt lịch
│   ├── userId, equipmentId, equipmentKey, equipmentName, userName
│   ├── date, startTime, endTime, purpose
│   ├── status             # pending | approved | in-use | completed | rejected | cancelled
│   └── ...
│
├── booking_locks/         # R119-R120: atomic slot reservation
│   └── {equipmentKey}_{YYYY-MM-DD}/
│       └── slots: [{ start, end, bookingKey, status }, ...]
│
├── notifications/         # R122: nested per-user
│   ├── {uid}/{notifId}/   # User's bucket — strict per-uid read
│   │   ├── type, bookingKey, title, message
│   │   ├── createdAt, readBy: { [uid]: ISO }
│   │   └── deletedBy: { [uid]: ISO }   # tombstone
│   └── _admin/{notifId}   # Broadcast fallback bucket (admin/superadmin readable)
│
├── presence/{uid}
│   ├── online: bool        # Set offline TRƯỚC signOut — R116
│   └── lastSeen: timestamp
│
├── chat/
│   ├── messages/{id}       # Validation cho phép recall (text:null) + superadmin moderation — R117
│   └── typing/{uid}
│
├── aiConversations/{uid}/{convId}/   # AI chat persistence (R109)
│   ├── messages: [{role, content, ts, ...}]
│   ├── title               # Auto-generated 3-6 word VN title (R113)
│   └── createdAt, updatedAt
│
├── actionAudit/{ts}        # AI action commit audit log (R115, R129)
│   ├── uid, action, args, targetPath, resultKey
│   └── ts
│
├── aiPapers/_shared/{paperId}/    # Paper metadata shared across users (R130-R136)
│   ├── title, authors, year, source, uploadedBy
│   ├── ocrStatus, chunkStatus, embedStatus  # Pipeline state per stage
│   └── filename, storageUrl
│
├── history/{id}            # User actions audit log (admin only)
└── settings/
    ├── subtitle            # Hiển thị dưới tên lab
    └── title               # Tên lab
```

Rules chi tiết: `database.rules.json`. Storage rules: `storage.rules`.

**Region**: Tất cả ở `asia-southeast1` (Singapore). RTDB URL: `https://lab-manager-268a6-default-rtdb.asia-southeast1.firebasedatabase.app`.

---

## 🗄 Firestore schema (Phase B+, named DB `labbook`)

Phase B introduced Firestore alongside RTDB. RTDB stays primary for realtime app data; Firestore handles vector search, BM25 inverted index, traces. Same project, separate DB instance named `labbook` (region `asia-southeast1`).

```
labbook (Firestore)/
├── paperChunks/{chunkId}              # R134 chunking pipeline output
│   ├── paperId, chunkIndex, sectionPath
│   ├── text, tokenCount
│   ├── embedding (1024-dim vector)    # R135 Voyage voyage-3-large
│   └── createdAt
│
├── bm25Tokens/{paperId}_{chunkId}     # R137a BM25 inverted index
│   ├── tokens: [{ term, count }, ...]
│   ├── docLength, paperId, chunkId
│   └── createdAt
│
├── aiTraces/{traceId}                 # R137b LLM observability
│   ├── parentTraceId, spans: [...]
│   ├── totalCostUSD, totalLatencyMs
│   ├── userId, query, mode
│   └── status, createdAt
│
└── evalRuns/{runId}                   # R137b RAG evaluation runs
    ├── version, totalQueries
    ├── metrics: { mrr, p_at_10, ndcg }
    └── createdAt, queryResults: [...]
```

**Vector search**: composite index trong `firestore.indexes.json` enables KNN over `paperChunks.embedding` (cosine distance). Filter by `paperId` for scoped search.

**BM25**: tokens written via `backfillBM25` Cloud Function. Hybrid retrieval merges vector + BM25 scores via Reciprocal Rank Fusion (RRF).

**Trace sink**: `FirestoreTraceSink` writes to `aiTraces` (commercial-ready abstraction; can swap to BigQuery for analytics scale).

---

## 🔐 Phân quyền (4 lớp)

Đọc role từ `users/{uid}/role`. Lưu vào `currentAuth.role` trong `auth.ts`.

**Lớp 1 — UI (CSS body class)**:
- `applyRoleUI(role)` set `body.{role}-mode` (superadmin-mode/admin-mode/member-mode/viewer-mode/pending-mode/rejected-mode)
- CSS rules ẩn/hiện element theo class: `.admin-only`, `.member-only`, hoặc `[data-action="..."]`
- Vd R124: `body.member-mode [data-action="exp-actions-menu"] { display: none }`

**Lớp 2 — JS function gate**:
- Helpers `canEdit()`, `canDelete()` trong `utils/auth-helpers.ts`
- Action handlers check role trước khi gọi save/delete
- Vd R124: `case 'exp-actions-menu'` check role ≠ admin → toast deny

**Lớp 3 — Cloud Function gate** (R115a):
- `tool-executor.ts` pre-check `ACTION_TOOL_NAMES.includes(name)` → require superadmin
- `confirmAction` verify superadmin trước khi commit RTDB

**Lớp 4 — Firebase RTDB rules** (lớp duy nhất chống bypass):
- Mỗi path có `.read` + `.write` + `.validate` rule
- R122 strict per-uid notifications: `auth.uid === $uid`
- R119 booking_locks: chỉ member+ ghi
- R117 chat recall rule cho phép `text:null` + superadmin override

⚠️ **Mọi rule mới ở lớp 1-3 phải có rule tương ứng ở lớp 4** — UI/function/Cloud Function chỉ là UX, attacker với DevTools console bypass được.

---

## 🎨 CSS architecture

**Theming pattern**: CSS variables ở `:root`, theme-manager đổi values qua `style.setProperty('--teal', '#0d9488')`. Tất cả components dùng `var(--teal)` thay vì hard-code màu.

```css
:root {
  --teal: #0d9488;
  --teal-light: #f0fdfa;
  --border: #e2e8f0;
  --text: #0f172a;
  --surface: #ffffff;
  --danger: #ef4444;
  /* AI chat resizable width — R126 */
  --ai-sidetab-width: 380px;
  /* ... */
}
```

**Dark mode**: Override các var trong `dark-mode.css` qua `html.dark { ... }`.

**CSP impact**: `style-src` cho phép `'unsafe-inline'` (437 inline styles trong index.html — separate refactor phase). `script-src` strict không có `'unsafe-inline'`.

---

## 🪝 Window globals — Bridging modules với HTML

Lý do còn dùng pattern: HTML có legacy inline `onclick="saveHydro()"` từ trước R55-58e CSP refactor. Các function cần thiết được gắn lên `window`:

```ts
window.saveHydro = saveHydro;
window.openModal = openModal;
// ... ~80 functions tổng
```

**Hiện đang migrate** sang event delegation (`data-action` + `global-delegation.ts`). Đa số inline events đã removed (~480 sites trong R55-58e). Một số vẫn còn cho legacy compat.

**Khi viết module mới**: KHÔNG expose lên `window`. Dùng `data-action` + register handler trong `global-delegation.ts`.

---

## 🧩 Module dependency rules

Để tránh circular import:

| Layer | Có thể import từ |
|---|---|
| `utils/*` | Không gì khác (pure functions only) |
| `ui/*` | `utils/*` |
| `services/*` | `utils/*`, `ui/*`, `firebase.ts`, `auth.ts` |
| `pages/*` | Bất cứ gì |
| `ai/*` | Bất cứ gì + `firebase.ts` qua tool-client |
| `main.ts` | Orchestrator, import tất cả |
| `functions/src/*` | Backend, độc lập với frontend |

**Pattern bypass khi cần truy cập từ thấp lên cao**: dùng `window.cache` hoặc dispatch CustomEvent (`'cache-update'`, `'pageChange'`).

---

## 🚦 Listener vs fbGet vs runTransaction

| Use case | API |
|---|---|
| Realtime sync (hầu hết cases) | `fbListen` |
| Đọc 1 lần (validate, init, migration) | `fbGet` |
| Atomic read-modify-write (stock, slots, counters) | `runTransaction` |
| Atomic increment/decrement | `incrementStock` helper (R118) |
| Push immutable record | `fbPush` (returns key) |
| Set known path | `fbSet` |
| Patch fields | `update` |
| Soft delete vs hard delete | `update({deleted: true})` vs `remove` |

---

## ☁️ Cloud Functions (asia-southeast1)

Triển khai trong `functions/src/`. Deploy: `firebase deploy --only functions`.

### LLM proxies (Tier 1-3)

| Function | Trigger | Purpose |
|---|---|---|
| `geminiProxy` | HTTPS (SSE) | Tier 1 — Gemini 2.5 Flash with tool calling loop, max 5 iter (R111) |
| `claudeProxy` | HTTPS (SSE) | Tier 2/3 — Claude Sonnet 4.6 / Opus 4.7 / Haiku 4.5 (R138a). Anthropic Messages API wrapper, raw fetch, no SDK. SSE normalize: `{text}`, `{toolUse}`, `[DONE]`. NO_SAMPLING_PARAMS gate for Opus 4.7. |

### Tool execution & action commit

| Function | Trigger | Purpose |
|---|---|---|
| `toolExecutor` | HTTPS | Dispatch 11 tools (6 read + 4 action draft + 1 RAG), role gate (R112+R115a+R129+R138b1) |
| `confirmAction` | HTTPS | Commit action draft → RTDB + actionAudit, superadmin verify (R115, R129a-fix validTypes) |

### Speech I/O

| Function | Trigger | Purpose |
|---|---|---|
| `speechProxy` | HTTPS | Cloud Speech v2 Chirp 2 STT (vi-VN single, R114) |

### Paper RAG pipeline (Pub/Sub event chain)

| Function | Trigger | Purpose |
|---|---|---|
| `chandraProxy` | HTTPS | OCR PDF via Chandra (datalab.to) — page-level layout extraction (R133) |
| `chunkPaper` | Pub/Sub `paper-uploaded` | Section-aware chunking (R134) — header detection, ~500-token chunks, sectionPath tracking |
| `paperPipelineRouter` | Pub/Sub `paper-chunked` | Routes to embedding stage (R135) — Voyage voyage-3-large, batch 32 |
| `searchPapers` | HTTPS | Hybrid search endpoint (R136a→R137c2) — vector + BM25 + RRF + Voyage rerank-2.5 |
| `backfillBM25` | HTTPS (admin only) | Backfills BM25 tokens for existing chunks (R137a one-time job) |
| `runEval` | HTTPS (admin only) | Runs RAG eval over ground-truth queries (R137b — MRR, P@K, NDCG) |

**Pipeline state**: Each stage updates RTDB `aiPapers/_shared/{paperId}/{ocrStatus|chunkStatus|embedStatus}` for frontend progress UI.

**Pub/Sub topics**: `paper-uploaded` → `paper-chunked` → (embed) → `paper-ready`.

### Secrets (Google Secret Manager)

- `GEMINI_API_KEY` — geminiProxy
- `ANTHROPIC_API_KEY` — claudeProxy (R138a)
- `VOYAGE_API_KEY` — paperPipelineRouter (embed) + searchPapers (rerank) + toolExecutor (R138b1)
- `CHANDRA_API_KEY` — chandraProxy

**Service account**: Default compute SA `478810777276-compute@developer.gserviceaccount.com` với roles `Cloud Speech Client` + `Firebase Admin` + `Pub/Sub Publisher` + `Secret Manager Secret Accessor`.

**IAM note**: After deploying NEW Cloud Functions, must explicitly grant `allUsers` invoker policy:
```bash
gcloud run services add-iam-policy-binding [function-name] \
  --region=asia-southeast1 --member=allUsers --role=roles/run.invoker \
  --project=lab-manager-268a6
```
(Existing functions keep their IAM after redeploy; only NEW functions need this.)

---

## 🔄 Migration script pattern (R122)

Khi đổi schema RTDB cần migration data, dùng `firebase-admin` SDK với service account key (bypass rules).

Pattern (xem `scripts/migrate-notifications-r122.mjs`):

1. Load service account key từ `./serviceAccountKey.json` hoặc `GOOGLE_APPLICATION_CREDENTIALS` env
2. **Backup tự động** trước khi modify (`backup-notifications-{ts}.json`)
3. **Dry-run plan** in ra terminal
4. **Confirmation prompt** `[yes/no]`
5. **Atomic apply** qua single `ref().update(map)` — Firebase đảm bảo all-or-nothing
6. **Idempotent** — heuristic phân biệt schema cũ vs mới, skip nếu đã migrate

⚠️ `serviceAccountKey.json` + `backup-*.json` PHẢI gitignored. Service account key có quyền admin — không commit, không share, dùng xong xóa.

---

## 🤖 AI Module integration architecture (Phase A + B)

Cho deep-dive xem `AI_ARCHITECTURE.md`. Section này tóm tắt integration points giữa AI module và rest of app.

### Tool registry pattern

Tools live in `functions/src/tools/` and dispatch via `toolExecutor` Cloud Function:

```
functions/src/tools/
├── registry.ts          # TOOL_DEFS_GEMINI + TOOL_DEFS_ANTHROPIC + TOOLS map
├── chemicals.ts         # 6 read tools query RTDB
├── equipment.ts         # cached collection scans, returns matched records
├── experiments.ts       # filters by category (HT-/E-/EC-/INK-)
├── bookings.ts          # date-range + status filters
├── members.ts           # role + name search
├── utils.ts             # getCurrentDate (VN timezone)
├── papers.ts            # searchPapers — RAG (R138b1)
└── actions.ts           # 4 draft generators + commitDraft
```

**Tool format dual-shape**: `registry.ts` exports both Gemini-shaped (`functionDeclarations`) and Anthropic-shaped (`input_schema`) definitions. Single source of truth, two formats. claudeProxy uses Anthropic shape; geminiProxy uses Gemini shape.

### Action tool pattern (R115b draft + confirm)

Write tools NEVER commit directly to RTDB. Pattern:

1. `toolExecutor` invokes draft generator → returns `{type: "X-draft", ...preview}`
2. Frontend `gemini-client.ts` detects draft type → embeds `<!--AI_DRAFT:base64-->` marker into stream
3. `markdown-render.ts` extracts marker before render → calls `confirmation-card.ts` to render UI card
4. User clicks "Xác nhận" → POST to `confirmAction` Cloud Function
5. `confirmAction` re-validates draft type (validTypes whitelist), checks superadmin role, commits to RTDB
6. Logs to `actionAudit/{ts}` for compliance

**Whitelist guard**: `confirm-action.ts` has explicit `validTypes` array. Adding a new action tool requires updating this list (regression: bug H R129a-fix). See AUDIT_LOG.md regression checklist #11.

### RAG retrieval flow (Phase B)

```
User query
  ↓
geminiProxy → tool calling loop
  ↓ (AI decides to call searchPapers)
toolExecutor → searchPapers tool
  ↓
SearchEngine (createSearchEngine "hybrid")
  ↓ parallel: vector search + BM25 search
  ↓ Reciprocal Rank Fusion (RRF) merges scores
  ↓ Top-30 candidates
Voyage Reranker → rerank-2.5 API
  ↓ Top-K (default 5)
enrichTitles() — RTDB lookup paper title
  ↓
Return chunks with position 1..K
  ↓
geminiProxy embeds <!--AI_CITATIONS:base64--> marker
  ↓
Frontend extracts → stores citations keyed by msgId
  ↓ markdown render with strip marker
DOM walk: [N] → <span class="citation-chip">
  ↓
User clicks chip → popover with paper title, section, full chunk text
```

**Trace recording**: every stage writes spans to `aiTraces` Firestore collection (R137b observability). Use `runEval` Cloud Function to evaluate retrieval quality on ground-truth queries.

### Marker pattern (reusable)

R115b established `<!--AI_*-->` marker for embedding tool results into streaming text. R138b2b extended for citations. Reusable for future tools needing rich UI:

```typescript
// Backend: encode payload, embed marker into stream
const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
const marker = `\n\n<!--AI_TYPE:${b64}-->\n\n`;
allAccumulated += marker;

// Frontend: extract before markdown render, store data, strip from text
const re = /<!--AI_TYPE:([A-Za-z0-9+/=]+)-->/g;
text.replace(re, (match, b64) => {
  const data = JSON.parse(decodeURIComponent(escape(atob(b64))));
  storeData(msgId, data);
  return ""; // strip
});

// Post-render: walk DOM, decorate text patterns
walkTextNodes(container, regex, (match, data) => {
  // replace match with custom span/widget
});
```

### Streaming bubble msgId migration (R138b2b-fix4)

Streaming assistant bubbles have NO msgId until `appendMessage` saves to RTDB. Solution:

1. During stream: citations stored under key `""` (empty string)
2. `onComplete` callback: `appendMessage` returns realMsgId
3. `migrateCitations("", realMsgId)` moves data
4. `assistantMsgEl.dataset.msgId = realMsgId`
5. Re-run `attachCitationChips(contentEl, realMsgId)` to render chips

This pattern applies to any tool result needing post-stream UI binding.

---

## 🐛 Tech debt + open issues

### Done (R116-R126) — Pre-Commercial Audit
- ✅ Auth listener leak (R116)
- ✅ Presence stuck online (R116)
- ✅ XSS edit modal (R116)
- ✅ XSS escapeJs `"` (R117)
- ✅ Orphan storage cleanup (R117)
- ✅ Stock race condition (R118)
- ✅ Image upload size DoS (R118)
- ✅ Booking race conditions (R119-R120)
- ✅ Notification security (R122)
- ✅ Stale lock cleanup (R122)
- ✅ Bell empty notifications (R122)
- ✅ Search box stuck UX (R121)
- ✅ Bulk select missing (R121)
- ✅ Member card layout (R121)
- ✅ Admin-only import/export gate (R124)
- ✅ File picker không trigger (R124)
- ✅ VN diacritics qr-labels (R124)

### Done (R129) — Add 4th action tool
- ✅ recordExperimentResultDraft tool — partial update với HT-/EC- detection
- ✅ confirmAction validTypes whitelist (R129a-fix)
- ✅ Diff card visualization (R129b)

### Done (R130-R138) — Phase B AI RAG
- ✅ Paper upload + Chandra OCR (R130-R133)
- ✅ Section-aware chunking (R134)
- ✅ Voyage embeddings via Pub/Sub chain (R135)
- ✅ Vector search backend + frontend (R136)
- ✅ Hybrid retrieval — BM25 + RRF (R137a)
- ✅ Eval framework + observability (R137b)
- ✅ Voyage rerank-2.5 + confidence UI (R137c)
- ✅ Claude proxy (Tier 2/3 infrastructure, R138a)
- ✅ searchPapers tool integration (R138b1)
- ✅ NotebookLM-style citation chips with popover (R138b2b)

### Còn lại (priority Low)
- `main.ts` ~1500 lines, cần split thành sub-modules
- `booking.ts` ~1900 lines, có thể tách week-grid + helpers ra
- `labbook-extensions.ts` legacy, migrate dần
- ~28 empty `catch (e) {}` blocks → log warn
- 437 inline styles trong `index.html` → nên migrate sang CSS class
- `pdfmake` 975KB + `vfs_fonts` 855KB — lazy import qua dynamic `import()` chỉ khi cần
- Window globals nhiều — long-term thay bằng event bus

### Commercialization roadmap (xem ROADMAP.md)
- Multi-tenant rules namespace `users/{tenantId}/{uid}`
- Rate limiting via Cloud Function gateway
- Email verification flow
- Stripe billing integration
- GDPR/PDPA tooling
- Backup automation

---

## 📚 Tham khảo

- [Firebase Realtime Database docs](https://firebase.google.com/docs/database)
- [Firebase Cloud Functions docs](https://firebase.google.com/docs/functions)
- [Vite docs](https://vitejs.dev/)
- [Tailwind CSS docs](https://tailwindcss.com/docs)
- [TypeScript docs](https://www.typescriptlang.org/docs/)
- Internal: `AGENTS.md`, `AI_ARCHITECTURE.md`, `DESIGN.md`, `WORKFLOW.md`, `AUDIT_LOG.md`, `CHANGELOG.md`, `ROADMAP.md`, `CLAUDE.md`
