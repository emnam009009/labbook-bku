# AGENTS.md

> Tài liệu này dành cho **AI agent** (Claude, Cursor, Copilot, etc.) đọc đầu tiên khi vào codebase. Cập nhật khi cấu trúc thay đổi đáng kể.

---

## 0. TL;DR — Đọc 30 giây

LabBook BKU là web app quản lý phòng thí nghiệm hoá. Stack **Vite 8 + Tailwind 3 + Firebase Realtime DB + TypeScript (ESM)**. Triển khai trên **Firebase Hosting (Spark plan)**: `https://lab-manager-268a6.web.app`.

- **Working dir** (WSL Ubuntu): `~/LAB-MANAGER/labbook-vite-tailwind/labbook`
- **Firebase project ID**: `lab-manager-268a6`
- **Repo**: https://github.com/emnam009009/labbook-bku
- **Owner ngôn ngữ**: tiếng Việt (toàn bộ giao tiếp + UI strings)
- **Tests**: 62 unit tests (Vitest). Phải pass khi đụng code.
- **Latest round**: Round 90 (Drop replace preview + upload speedups). Xem section 12 cho timeline Round 73-90.
- **AGENTS.md tracked in repo** từ Round 72 — đầu session `git pull` để sync, KHÔNG `rm -f`.

---

## 1. Stack & Architecture

### Build / Deploy
- **Vite** bundle TypeScript. `index.html` là root, `src/js/main.ts` là entry.
- **Tailwind 3** + custom CSS (xem `src/css/`).
- **Firebase**: Auth + Realtime Database (Spark plan, không có Cloud Functions).
- **Hosting**: Firebase Hosting (Static), có CSP header strict (xem `firebase.json`).
- **PWA**: vite-plugin-pwa, service worker tự generate.

### Workflow
```bash
npm run dev          # vite dev server
npm run typecheck    # tsc --noEmit (strict: noImplicitAny + strictNullChecks)
npm run build        # build vào dist/
npm test             # vitest 62 tests
firebase deploy --only hosting   # deploy
```

### Module hệ thống
- **TypeScript ESM** (không React/Vue). Tất cả file dùng `import/export`.
- File ngoài `src/js/` được Vite bundle thành `dist/assets/index-*.js`.
- **TypeScript strict mode**: `noImplicitAny` + `strictNullChecks` + `noUnusedLocals` + `noUnusedParameters` ON. `strict: true` chưa bật.
- 24 file lớn render-heavy (DOM/Chart.js/jsPDF/Worker) có `@ts-nocheck` directive — strict flag không apply cho các file này.
- Migration TS hoàn tất ở Round 71. Feature work tiếp tục Round 72-90 (xem section 12).

---

## 2. Folder map

```
labbook/
├── index.html                  # Single page, ~1700 lines, MỌI modal/page section ở đây
├── firebase.json               # Hosting config + CSP header (strict)
├── package.json                # Vite + Firebase + xlsx/pdfmake/qrcode + typescript
├── tsconfig.json               # TS strict: noImplicitAny + strictNullChecks ON
├── src/
│   ├── css/                    # Tailwind + custom CSS
│   └── js/                     # 77 .ts files, 0 .js files
│       ├── main.ts             # ENTRY. Init code + DOMContentLoaded (@ts-nocheck)
│       ├── auth.ts             # Firebase Auth wrapper, exports currentAuth
│       ├── firebase.ts         # Firebase RTDB SDK wrapper (typed)
│       ├── state.ts            # Global cache: { hydro, electrode, electrochem,
│       │                       #   chemicals, members, history, ink, equipment, groups }
│       ├── labbook-extensions.ts  # Chart.js + AI integration (@ts-nocheck)
│       ├── types/
│       │   ├── global.d.ts     # window.* declarations + AppCache + CurrentAuth
│       │   └── qrcode.d.ts     # Stub declarations for 'qrcode' module
│       ├── pages/              # 1 file per "trang" (route). Render + page-specific delegation
│       │   ├── experiments.ts  # Hydro / Electrode / Electrochem / Ink (4 sub-tabs)
│       │   ├── booking.ts      # Đăng ký thiết bị (list + calendar view)
│       │   ├── chemicals.ts, equipment.ts, members.ts, ink.ts
│       │   ├── dashboard.ts, settings.ts, history.ts
│       │   └── reports.ts, users.ts, chat.ts, auth-flow.ts
│       ├── services/           # Cross-page services
│       │   ├── global-delegation.ts  # ⭐ KEY FILE - data-action dispatcher cấp document.body
│       │   ├── bulk-actions.ts       # Checkbox + bulk select cho mọi bảng
│       │   ├── render-dispatcher.ts  # render*() router
│       │   ├── save-handlers.ts      # save*() router
│       │   ├── form-helpers.ts, edit-handlers.ts, image-handlers.ts
│       │   ├── notifications.ts, presence.ts, history-log.ts
│       │   ├── threads-bg.ts         # Login screen WebGL animation
│       │   ├── mobile-sidebar.ts     # Mobile UX
│       │   ├── parsers/              # JCAMP-DX, CSV/TSV/Excel parsers (typed)
│       │   ├── plot/                 # Tauc plot, bandgap fit (typed)
│       │   ├── pdf/                  # jsPDF wrapper
│       │   └── (...nhiều helpers khác)
│       ├── ui/                 # UI components (modals, toasts)
│       └── utils/              # Pure helpers (typed)
│           ├── format.ts       # escapeHtml, escapeJs, vals, fuzzy, fmtDate, autoPrefix
│           ├── dom.ts          # flashRow, setText, setHtml
│           ├── auth-helpers.ts # canDelete, canEdit, getPersonName
│           └── async.ts        # safeAsync wrapper
└── tests/utils/                # 3 .test.ts files (62 tests total)
├── tests/                      # Vitest unit tests
└── dist/                       # Build output (gitignored)
```

---

## 3. Conventions sống còn

### 3.1. KHÔNG có inline event handlers (Phase CSP)
Strict CSP đã active (Mozilla Observatory **125/100 Grade A+**). **CẤM**:
- ❌ `onclick="..."`, `onmouseover="..."`, `onsubmit="..."`, `onchange="..."`, etc.
- ❌ `<script>...</script>` inline (chỉ cho phép `<script type="module" src="...">`)
- ❌ `eval()`, `new Function(...)`

**Pattern thay thế**: data-attribute + delegation listener cấp `document.body` trong `services/global-delegation.js`.

```html
<!-- SAI (sẽ bị CSP chặn) -->
<button onclick="saveHydro()">Lưu</button>

<!-- ĐÚNG -->
<button data-action="save-hydro">Lưu</button>
```

Trong `global-delegation.js`:
```js
case 'save-hydro': if (typeof window.saveHydro === 'function') window.saveHydro(); break;
```

### 3.2. KHÔNG dùng CSS `:has()` selector
Browser version trên máy user **đã xác nhận hỏng** với `:has()`. Dùng JS class toggle thay thế.

### 3.3. **Inline `style="..."` được phép**
`style-src` trong CSP vẫn `'unsafe-inline'` (vì 437+ inline styles trong index.html, refactor là phase riêng). `element.style.X = Y` runtime cũng OK.

### 3.4. Không dùng React/Vue
Chỉ ES modules + DOM API thuần. Render bằng template literals + `tbody.innerHTML = rows.map(...).join('')`.

### 3.5. Tests phải pass
```bash
npm test   # 62/62 passing - phải maintain
```

---

## 4. Patterns then chốt

### 4.1. Global delegation (CSP-safe events)
- File chính: `src/js/services/global-delegation.js`
- Listen 7 sự kiện trên `document.body`: click, submit, change, input, keydown, dragover, dragleave, drop
- Dispatch theo `data-action`/`data-submit-action`/`data-change-action`/`data-input-action`/`data-keydown-action`/`data-drop-zone`
- **Idempotent** qua `document.body._globalDelegated` flag

Ngoài ra mỗi trang có thể có **delegation cấp tbody** riêng (e.g. `attachExpDelegation` trong `experiments.js`) cho actions cụ thể của trang đó. **Quy tắc tránh double-call**: nếu `data-action` value trùng với handler ở body level, REMOVE case khỏi tbody handler.

### 4.2. Cache pattern (state.ts)
```js
window.cache = {
  hydro: { 'firebase_key_1': { code, name, ... }, ... },
  electrode: { ... },
  // ...
}
```
- Mỗi collection là object, key = Firebase push key, value = record.
- Helper `vals(obj)` chuyển sang array với `_key` field.
- Listen `onValue(ref(db, col))` ở `main.ts` → cập nhật `cache[col]` → trigger render.

### 4.3. Render pattern
- Mỗi trang export `renderXxx()` → đọc `cache.xxx` → tạo HTML rows → set vào `tbody.innerHTML`.
- Sau render, gọi `injectCheckboxes(tbodyId)` (bulk-actions.js) để chèn checkbox column.
- Render được trigger từ `render-dispatcher.js` khi cache update.

### 4.4. Save pattern (xem save-handlers.ts)
```js
// 1. Validate form
// 2. Build object từ DOM inputs
// 3. fbPush(col, obj) hoặc fbSet(`${col}/${key}`, obj)
// 4. logHistory(action, before, after)
// 5. closeModal + toast success
```

### 4.5. Bulk-select pattern (bulk-actions.ts)
- Auto-inject checkbox column vào header + mỗi row
- Function `getRowKey(tr, tbodyId)` đọc `data-key` từ button con có `data-action`
- Round 59 fix: nếu không có `data-key`, fall back về regex parse onclick (legacy)

### 4.6. Auth/Role
- 3 role: `superadmin` > `admin` > `member`
- `currentAuth` global object trong `auth.js`: `{ uid, email, name, role, isAdmin, isSuperAdmin, isMember }`
- UI ẩn/hiện theo role qua `applyRoleUI()` + class `.admin-only` / `.superadmin-only`
- Hard-coded super admin email: `nvhn.7202@gmail.com` (Round 52a moved từ inline)

### 4.7. Modal pattern
- Tất cả modal ở `index.html` với id `modal-xxx`
- Mở: `data-action="open-modal" data-modal="modal-xxx"` hoặc `window.openModal('modal-xxx')`
- Đóng: `data-action="close-modal" data-modal="modal-xxx"` hoặc nút X
- Close on click outside: listener trong `main.ts`

### 4.8. Notifications
- Schema **flat** (không nested by rule). Bug #11 đã defer — không refactor unless user yêu cầu.

### 4.9. Attachments system (Round 73+, đỉnh điểm Round 90)

**Architecture**:
- Files lưu Firebase Storage tại path `attachments/{refType}/{refId}/{ts}_{safe}`
- Metadata lưu RTDB tại `attachments/{refType}/{refId}/{attachmentId}`
- 12 categories: xrd, sem, tem, raman, ftir, uvvis, uvvis-drs, pl,
  eds, xps, electrochem, other (Round 77a thêm 3 cuối)
- Per-experiment limit: 20 files, per-file: 25 MB

**Pipeline khi user drop file**:
1. `detectCategory(file)` → 4 layers: extension → filename → JCAMP/CorrWare → header keywords
2. Auto-set dropdown category (Round 74)
3. Single file + parseable + canAutoPlot → preview chart
4. Multi-file/non-parseable → bulk upload
5. Parallel upload pool (8 concurrent, Round 90), small files <1MB
   dùng `uploadBytes` (single PUT), files lớn dùng `uploadBytesResumable`

**Auto-plot subtypes** (Round 86):
- CorrWare `.cor` electrochem files: detect subtype CV/LSV/GCD từ header
  - CV/LSV: X=Potential (V), Y=Current density (A/cm²)
  - GCD: X=Time (s), Y=Potential (V)
- JCAMP-DX (`.txt` JASCO UV-Vis output): standard format

**RTDB rules** (`database.rules.json` line ~216):
- Category regex MUST include all 12 values:
  `/^(xrd|sem|tem|raman|ftir|uvvis|uvvis-drs|pl|eds|xps|electrochem|other)$/`
- Quên update regex khi thêm category sẽ gây PERMISSION_DENIED (Round 88 fix).
- Sau khi sửa rules: `firebase deploy --only database` (KHÔNG chỉ hosting!)

### 4.10. PNG export — OffscreenCanvas + Web Worker (Round 89)

`renderHighResPNG()` trong `services/plot/plot-preview.ts` là dispatcher:
- Feature-detect `OffscreenCanvas` + `Worker` + `transferControlToOffscreen`
- ✓ Support → spawn worker (`./highres-png.worker.ts?worker`), transfer canvas,
  worker render Chart.js + convertToBlob → postMessage blob về (DPI 300, main thread free)
- ✗ Fallback → sync render trên main thread (DPI 220 thay vì 300)

**Worker code self-contained** — KHÔNG import từ main thread (functions
không cross postMessage được). buildChartConfig + 5 plugins inline trong
worker scope. Khi sửa preview rendering logic, NHỚ sync giữa
`plot-preview.ts` (preview path) và `highres-png.worker.ts` (export path)
để saved PNG khớp preview.

**Plugins Chart.js cho hi-res**: whiteBg, chartFrameHires, xAxisTicksHires,
yAxisTicksHires, egAnnotation (Tauc only).

**Vite bundle**: `?worker` syntax tự handle — output 2 chunks (worker entry
+ Chart.js shared). Lazy-loaded on first save click — 0KB delta initial bundle.

### 4.11. Busy overlay pattern (Round 87)

Tránh spam upload — `src/js/ui/upload-busy-overlay.ts`:
- `showBusyOverlay(panel, msg)`: insert spinner overlay over `.att-panel`,
  disable file input + `.att-upload-btn`
- `setBusyMessage(msg)`: update message qua các stages mà không thay đổi
  visibility (ví dụ "Đang phân tích" → "Đang đọc" → "Đang vẽ" → "Đang tải lên")
- `hideBusyOverlay(panel)`: reverse, reference-counted (multiple show
  calls require matching hide)
- `isBusy()`: handleFiles entry check + savePlotBtn click check

CSS trong `attachments.css` Round 88: KHÔNG dùng `backdrop-filter: blur(2px)`
(GPU contention với heavy canvas renders) — dùng opaque background.

### 4.12. Drop-to-replace preview (Round 90)

Khi đang preview file (chưa upload), drop file mới vào canvas area
→ tự động `closePreview()` + `handleFiles(newFile)`. Drop chỉ block
khi `isBusy()`. Click handler trong dropzone vẫn chỉ trigger file picker
khi state='empty' AND target không phải interactive child (Round 85).

### 4.13. Modal stacking (Round 83)

`openModalStacked(modalId)`:
- KHÔNG close other modals khi mở (như `openModal` legacy)
- Compute z-index = max of currently-open + 10
- Dùng cho overview modal stacked trên attachments modal

**ESC handler** (`main.ts`): pick TOP modal theo z-index (Round 85), không
phải first DOM-order.

---

## 5. Quy trình patch (cách làm việc với owner)

Owner thường yêu cầu các "Round" sửa bugs/features. Quy trình:

### 5.1. Patch script Python
- Đặt ở `/mnt/user-data/outputs/labbook-patches/round{N}-{description}.py`
- **Phải idempotent**: chạy lại không gây lỗi, có check trước khi sửa
- **Phải có backup**: `.bak{N}` extension cho mọi file đụng vào
- **Phải verify trước khi viết**: dùng `grep`/`view` đọc nội dung thực tế, đừng đoán cấu trúc HTML/JS
- **Phải có post-check**: sau replace, verify pattern mong đợi xuất hiện
- **Hướng dẫn rollback**: cuối script in commands restore từ backup

### 5.2. Helper script
- File: `/mnt/user-data/outputs/labbook-patches/apply-patches.sh`
- Add case mới cho mỗi round
- Cập nhật rollback list + cleanup find pattern với suffix mới

### 5.3. Owner workflow
```
Windows D:\labbook-patches  →  copy  →  ~/labbook-patches/  →  bash apply-patches.sh {N}
→ firebase deploy --only hosting
→ test (Incognito nếu CSP/cache liên quan)
→ git commit + push
```

### 5.4. Test convention
- Hard reload (Ctrl+Shift+R) hoặc Incognito sau mỗi deploy
- F12 console phải sạch
- Không có command `eslint` hay `prettier` — không format/lint trừ khi owner yêu cầu

---

## 6. CSP & Security Status

- **Mozilla Observatory: 125/100 Grade A+** (sau Phase CSP rounds 55-58e)
- `script-src 'self' https://*.googleapis.com ...` — KHÔNG có `unsafe-inline` hay `unsafe-eval`
- `style-src 'self' 'unsafe-inline' ...` — vẫn permissive (chấp nhận, vì 437+ inline styles)
- Defense XSS injection inline: ACTIVE
- Defense eval: ACTIVE

**Khi đụng index.html** hoặc thêm event handler mới, NHỚ:
1. KHÔNG dùng inline `on*=` attributes
2. Convert sang `data-action` + thêm case vào `global-delegation.js`
3. Verify bằng `grep -E "on[a-z]+=" index.html` → kết quả phải là 0 (loại trừ false positive như `ontent`)

---


**CSP Hardening Status (Round 68-70):**
- Phase CSP gốc (Round 55-58): ~480 inline events trong index.html → cleaned
- Round 68 (dashboard.ts): 9 inline handlers + 4 hovers → data-action delegation
- Round 69 (5 pages): 27 inline handlers + 6 hovers (ink, chat, users, reports, settings)
- Round 70 (10 services/ui/ext): 32 inline handlers + 5 hovers (labbook-extensions, theme-picker, form-helpers, edit-handlers, booking-suggestions, custom-selects, pdf-report, group-lock-mgmt, attachments-panel, notifications)

→ **0 inline event handlers** trong code paths thực tế. Hover effects → CSS classes (xem `src/css/components.css`, `dashboard.css`).

Tool configs (`vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `vitest.config.js`, `commitlint.config.js`) giữ nguyên `.js` theo convention Node.js.
## 7. Bugs đã defer (đừng đụng trừ khi user yêu cầu)

- **Bug #11**: Notifications schema flat vs rule-nested. App chạy đúng dù schema không nhất quán. Refactor cost không xứng cho ~50 users.

---

## 8. Roadmap đã thảo luận

- ✅ **Phase Critical Bugs** (51-54): XSS, hard-coded email, presence cleanup
- ✅ **Phase CSP** (55-58e): strict CSP, ~480 inline events removed
- ✅ **UI fixes** (57d, 60, 60b): booking column layout
- ✅ **Phase TS migration** (61-71): 100% TypeScript, strict flags ON
- ✅ **Phase Attachments** (73-77): Firebase Storage upload, 12 categories,
     auto-detect, preview Chart.js, Tauc plot, save high-res PNG
- ✅ **Phase Reskin** (78-82): UI polish, image lightbox, axisSettings persisted
- ✅ **Phase UX** (83-88): stacked modals, drop-zone canvas merge, axis save UX,
     .cor RTDB rules fix
- ✅ **Phase Performance** (87-90): parallel upload pool, busy overlay,
     OffscreenCanvas worker, drop replace preview, upload speedups
- 🔮 **Optional**: Bỏ inline `style=` để Mozilla 135/100 max (effort lớn, lợi ích nhỏ)
- 🔮 **Optional**: Strip @ts-nocheck từng file (opportunistic — xem section 11)

---

## 9. Khi cần đọc codebase nhanh

Đề xuất thứ tự:
1. `package.json` — stack overview
2. `index.html` (search "id=" để map page IDs) — UI structure
3. `src/js/main.ts` — init flow + Firebase listeners (@ts-nocheck, lớn nhất)
4. `src/js/services/global-delegation.ts` — toàn bộ event routing
5. `src/js/state.ts` — cache schema (typed)
6. `src/js/auth.js` — currentAuth + role checks
7. `src/js/pages/{trang}.js` — page-specific render + actions

---

## 10. Liên hệ với owner (giao tiếp với bạn Nam)

- Tiếng Việt
- Đưa block lệnh đầy đủ (cd → cp → chmod → bash → deploy) thay vì giải thích từng bước
- Test instructions bằng tiếng Việt, đánh số rõ ràng
- Sau patch luôn verify build + tests pass (62/62)
- Khi user paste output multi-block, cẩn thận: user thường chỉ paste BLOCK CUỐI → đặt mọi command vào 1 block ở đầu response

---

## 11. TypeScript Migration (đã hoàn tất — Round 71)

**Status**: COMPLETE. 100% TypeScript trong code paths (`src/` + `tests/`).

**Stats hiện tại** (post-Round 90):
- 87 `.ts` files (84 source + 3 tests), 0 `.js` files trong code paths
- Strict flags ON: `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`
- 24 file render-heavy còn `@ts-nocheck` (DOM/Chart.js/jsPDF/Worker) — intentional,
  strict flag không apply cho các file này
- 5 `.js` còn lại đều là build/tool configs (vite/tailwind/postcss/vitest/
  commitlint), giữ nguyên theo convention Node.js

**Config quan trọng** (xem `tsconfig.json`):
- `strict: false` (chưa bật full strict — sẽ thêm strictFunctionTypes,
  strictBindCallApply, strictPropertyInitialization nếu bật)
- `noImplicitAny: true`, `strictNullChecks: true`
- `noEmit: true` — Vite tự handle compile, TS chỉ type-check
- `isolatedModules: true` — Vite requirement
- `types: ['vite/client']` — cho `import.meta.env`
- `allowJs: true`, `checkJs: false` — vẫn để vì test files migrate xong
  nhưng tool configs vẫn là `.js`

**Window types**: Khai báo trong `src/js/types/global.d.ts`. Stub modules
(như `qrcode`) trong `src/js/types/qrcode.d.ts`. Khi thêm `window.X` mới
trong code → thêm declaration ở `global.d.ts`.

**Commands**:
```bash
npm run typecheck         # check types (strict mode active)
npm run typecheck:watch   # watch mode
npm run build             # Vite build (ignore type errors, vẫn check syntax)
npm test                  # 62/62 phải maintain
```

**Khi remove `@ts-nocheck` từ file cụ thể** (opportunistic during feature
work — KHÔNG cần làm proactive):
1. Xóa dòng `// @ts-nocheck` ở đầu file
2. Chạy `npm run typecheck` → expect 30-250 errors tùy file
3. Fix lần lượt: thêm `as HTMLInputElement` casts, possibly-null guards,
   `as any` cho `window.X` dispatching
4. Tests + build pass trước khi commit

Benchmark đã đo (Round 67d):
- `services/edit-handlers.ts` (378 lines): ~247 errors
- `services/plot/plot-preview.ts` (427 lines): ~50 errors
- `services/pdf/pdf-report.ts` (393 lines): ~35 errors

→ Chi phí cao, lợi ích thấp. Code đã chạy đúng + 62/62 tests pass.

## Migration & CSP Cleanup — Final Status (Round 71)

The TypeScript migration + CSP hardening is COMPLETE through Round 71.

**Migration timeline:**
- Round 61: TypeScript toolchain setup (tsconfig, vitest config, types/global.d.ts)
- Round 62: utils/* migrated with proper types
- Round 63: state.ts + auth.ts typed
- Round 64a-e: services/* (45 files, mixed strategy)
- Round 65a-d: pages/* (14 files, mostly @ts-nocheck for render-heavy code)
- Round 66: firebase + ui/* + main.ts (10 files) + index.html main.js → main.ts
- Round 67a: noUnusedLocals/Parameters + vite/client types + 9 dead-code fixes
- Round 67b: strictNullChecks + 6 null-check fixes
- Round 67c: noImplicitAny + 21 fixes + qrcode.d.ts stub declarations
- Round 67d: Removed orphan pages/week-grid-snippet.ts (verified unused)
- Round 68-70: CSP hardening — 68 inline handlers + 15 hovers eliminated across
  dashboard, 5 pages, and 10 services/ui/extensions files
- Round 71: Removed root-level orphan ./booking-suggestions.js + migrated
  3 test files (tests/utils/*.test.js → .test.ts)

**Final state:**
- 80 .ts files (77 src + 3 tests), 0 .js files in code paths
- Strict flags active: `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`
- `strict: true` NOT enabled (would require strictFunctionTypes,
  strictBindCallApply, strictPropertyInitialization, etc.)
- 23 files retain `@ts-nocheck` directive intentionally — large render-heavy
  files (DOM manipulation, Chart.js, jsPDF) where removing would require
  200+ type assertions per file with little practical safety benefit
- 0 CSP-violating inline event handlers in code paths
- 62/62 tests pass; build OK; Mozilla Observatory grade A+ maintained

**Remaining .js files (5 — intentional):**
vite.config.js, tailwind.config.js, postcss.config.js, vitest.config.js,
commitlint.config.js — build/tool configs, standard Node.js convention.

**Removing `@ts-nocheck` from a specific file later** (opportunistic during
feature work): expect to add HTMLInputElement casts, possibly-null guards,
and `as any` for window.X dispatching. Benchmarked at Round 67d:
- services/edit-handlers.ts (378 lines): ~247 type errors
- services/plot/plot-preview.ts (427 lines): ~50 errors
- services/pdf/pdf-report.ts (393 lines): ~35 errors

Most errors are DOM type assertions that bloat code without adding real
safety — code already runs correctly with full test coverage.

---

## 12. Post-migration feature work (Round 72-90)

Sau khi TS migration hoàn tất ở Round 71, tập trung vào **attachments system**
+ **performance/UX**. Tóm tắt timeline (chi tiết xem git log):

### Phase Attachments — Foundation (73-77)
- **Round 73**: Initial attachments panel — Firebase Storage upload, RTDB metadata,
  basic categories (xrd/sem/tem/raman/ftir/uvvis/uvvis-drs/pl/other), 25 MB limit
- **Round 74**: Auto-detect category (4-layer pipeline trong `parsers/detect.ts`)
- **Round 75-75b**: CSV/TSV parser, Chart.js preview, axis title plugins, Tauc plot
- **Round 76**: Bandgap fit (linear regression on Tauc plot)
- **Round 77a**: Extended categories — eds, xps, electrochem (3 mới)
- **Round 77b**: Per-experiment overview modal — accordion 6 groups
- **Round 77c**: Drag-to-open row + sidebar overview page + jump-to-row

### Phase Reskin — Polish (78-82)
- **Round 78**: Shared classifier extracted to `services/attachment-classifier.ts`
- **Round 79**: Sticky sidebar brand + footer
- **Round 80**: Smooth drag-to-open row + click suppression
- **Round 81**: Status badge colors fixed
- **Round 82**: ⭐ Image lightbox + Vietnamese diacritics + axisSettings persisted
  (saved PNG matches preview), bandgapFit persisted

### Phase UX (83-86)
- **Round 83**: Merged dropzone into preview canvas, stacked modals, gallery icon,
  modal Tổng quan resize
- **Round 84**: Empty-state polish, Tổng quan button solid fill, accordion
  padding leak fix
- **Round 85**: Button heights 38px, dropzone click guards (only fire in empty
  state, skip interactive children), ESC handler picks top modal by z-index
- **Round 86**: ⭐ CorrWare ASCII (.cor) parser — CV/LSV/GCD/EIS support,
  axes per subtype (CV: X=Potential/Y=Current; GCD: X=Time/Y=Potential)

### Phase Performance (87-90)
- **Round 87**: ⭐ uploadMany sequential → parallel pool 5 concurrent + busy
  overlay (`ui/upload-busy-overlay.ts`) + spam guard. Pre-fetch existing list
  once. Stage messages: "Đang phân tích → Đang đọc → Đang vẽ → Đang tải lên"
- **Round 88**: 3 fixes:
  - axSaveBtn auto-disable when no attachmentId (state-aware tooltip)
  - **Critical**: `database.rules.json` regex extended với eds/xps/electrochem
    (Round 77a thêm TS constants nhưng forgot RTDB rules → .cor PERMISSION_DENIED).
    **Phải `firebase deploy --only database`** — không chỉ hosting!
  - PNG render perf: DPI 300→220, decimation >4000 points, yield event loop,
    overlay backdrop-filter removed (GPU contention)
- **Round 89**: ⭐⭐ OffscreenCanvas + Web Worker for PNG export
  - NEW `services/plot/highres-png.worker.ts` (~330 lines, @ts-nocheck) —
    self-contained Chart.js render in worker
  - `renderHighResPNG` becomes dispatcher: feature-detect → worker path (DPI 300,
    main thread free) or sync fallback (DPI 220)
  - Vite `?worker` syntax bundles worker chunk lazily (loaded on first save)
  - Net effect: UI freeze 1s → 0ms; DPI bumped back to 300
- **Round 90**: Drop replace preview + 4 upload speedups
  - Drop in preview state now triggers closePreview + handleFiles (replaces
    current preview without clicking Hủy)
  - `uploadAttachment.skipDupCheck` option — uploadMany passes true since
    dedupe already done at batch level (saves N-1 listAttachments round-trips)
  - Files ≤1MB use `uploadBytes` (single PUT) instead of `uploadBytesResumable`
    (~30-50% faster for typical CSV/.cor files)
  - Fire-and-forget `logHistory` — don't await, save 150-300ms/file
  - Concurrency 5 → 8 simultaneous uploads
  - Net: 5x500KB files ~2.5s → ~1.5s; 10 mixed ~5s → ~2.5s

### Critical conventions established Round 73-90

1. **Patch safety** — Always `grep`/`view` ACTUAL file contents before writing
   replace patterns. Scripts must verify boundaries exist before replacing
   and assert critical IDs after.

2. **Backup convention** — `.bak{N}` suffix per round. Always create before
   modifying. Cleanup at end of session: `find . -name "*.bak{N}" -delete`.

3. **AGENTS.md is tracked** (since Round 72). Don't `rm -f` at session start —
   use `git pull` to sync. Update sections after major rounds.

4. **`:has()` selector confirmed broken** in user's browser. Never use.

5. **`uploadBytes` vs `uploadBytesResumable`** — file size threshold 1 MB
   (Round 90). Single-PUT for small files, chunked for large (with progress).

6. **Worker code self-contained** — can't import from main code paths because
   functions/closures don't survive postMessage. Plugins must be inlined.
   If main config diverges from worker config, saved PNG won't match preview.

7. **Category enum changes need 3-place sync**:
   - TS constant `ATTACHMENT_CATEGORIES`
   - `database.rules.json` validate regex (deploy with `--only database`)
   - `parsers/detect.ts` extension/keyword maps (if auto-detect needed)

### Deferred / not done

- **Bug #11**: Notifications schema flat vs rule-nested. Reviewed Round 88,
  intentionally deferred — refactor cost not justified for ~50 users.
- **EIS-specific parser**: Round 86 covered CV/LSV/GCD; EIS in CorrWare uses
  different multi-column format (Z'/Z''/freq). Falls through to generic
  electrochem parser. User can manually pick columns.
- **uPlot.js migration**: Considered Round 89 as alternative to OffscreenCanvas.
  Decided against — would require duplicate logic vs Chart.js preview, risk
  saved PNG ≠ preview. OffscreenCanvas chosen for compatibility.

---

## 13. Quick reference — Files đã đụng nhiều trong attachments system

Khi sửa attachments-related, đây là mức độ ảnh hưởng:

**TIER 1 — đụng tới 90% các fix**:
- `src/js/ui/attachments-panel.ts` (~1100 lines): handleFiles, preview chart,
  axis controls, save plot button, dropzone state management
- `src/js/services/attachments.ts` (~457 lines): uploadAttachment, uploadMany,
  validateFile, sanitizeFileName, listAttachments, deleteAttachment
- `src/css/attachments.css` (~1572 lines): toàn bộ styling

**TIER 2 — đụng khi liên quan parsing/plotting**:
- `src/js/services/parsers/detect.ts`: 4-layer auto-detect category
- `src/js/services/parsers/index.ts`: parseDataFile dispatcher, isParseableFile whitelist
- `src/js/services/parsers/{jcamp-jasco,corrware,parser-core}.ts`: format-specific parsers
- `src/js/services/plot/plot-preview.ts`: renderPreview, renderHighResPNG dispatcher
- `src/js/services/plot/highres-png.worker.ts`: worker PNG render

**TIER 3 — đụng khi liên quan UX modals/lightbox**:
- `src/js/ui/overview-modal.ts`: 6-group accordion modal
- `src/js/ui/upload-busy-overlay.ts`: spinner + spam guard
- `src/js/ui/image-lightbox.ts`: click-to-zoom thumbnails
- `src/js/ui/modal.ts`: openModal + openModalStacked

**TIER 4 — RTDB/Storage rules** (deploy riêng `firebase deploy --only database`):
- `database.rules.json`: attachments validate (category regex, file metadata fields)
- `storage.rules`: attachments path whitelist + 25 MB limit

