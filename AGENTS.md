# AGENTS.md

> Tài liệu này dành cho **AI agent** (Claude, Cursor, Copilot, etc.) đọc đầu tiên khi vào codebase. Cập nhật khi cấu trúc thay đổi đáng kể.

---

## 0. TL;DR — Đọc 30 giây

LabBook BKU là web app quản lý phòng thí nghiệm hoá. Stack **Vite 8 + Tailwind 3 + Firebase Realtime DB + vanilla JS (ESM)**. Triển khai trên **Firebase Hosting (Spark plan)**: `https://lab-manager-268a6.web.app`.

- **Working dir** (WSL Ubuntu): `~/LAB-MANAGER/labbook-vite-tailwind/labbook`
- **Firebase project ID**: `lab-manager-268a6`
- **Repo**: https://github.com/emnam009009/labbook-bku
- **Owner ngôn ngữ**: tiếng Việt (toàn bộ giao tiếp + UI strings)
- **Tests**: 62 unit tests (Vitest). Phải pass khi đụng code.

---

## 1. Stack & Architecture

### Build / Deploy
- **Vite** bundle vanilla JS. `index.html` là root, `src/js/main.js` là entry.
- **Tailwind 3** + custom CSS (xem `src/css/`).
- **Firebase**: Auth + Realtime Database (Spark plan, không có Cloud Functions).
- **Hosting**: Firebase Hosting (Static), có CSP header strict (xem `firebase.json`).
- **PWA**: vite-plugin-pwa, service worker tự generate.

### Workflow
```bash
npm run dev       # vite dev server
npm run build     # build vào dist/
npm test          # vitest 62 tests
firebase deploy --only hosting   # deploy
```

### Module hệ thống
- **Vanilla ES modules** (không React/Vue). Tất cả `.js` dùng `import/export`.
- File ngoài `src/js/` được Vite bundle thành `dist/assets/index-*.js`.
- **Không có TypeScript** (đã thảo luận, sẽ migrate trong Phase 59+ nếu user muốn).

---

## 2. Folder map

```
labbook/
├── index.html                  # Single page, ~1700 lines, MỌI modal/page section ở đây
├── firebase.json               # Hosting config + CSP header (strict)
├── package.json                # Vite + Firebase + xlsx/pdfmake/qrcode
├── src/
│   ├── css/                    # Tailwind + custom CSS
│   └── js/
│       ├── main.js             # ENTRY. Init code + DOMContentLoaded
│       ├── auth.js             # Firebase Auth wrapper, exports currentAuth
│       ├── firebase.js         # Firebase RTDB SDK wrapper
│       ├── state.js            # Global cache: { hydro, electrode, electrochem,
│       │                       #   chemicals, members, history, ink, equipment, groups }
│       ├── labbook-extensions.js  # Legacy: globally-attached helpers
│       ├── pages/              # 1 file per "trang" (route). Render + page-specific delegation
│       │   ├── experiments.js  # Hydro / Electrode / Electrochem / Ink (4 sub-tabs)
│       │   ├── booking.js      # Đăng ký thiết bị (list + calendar view)
│       │   ├── chemicals.js, equipment.js, members.js, ink.js
│       │   ├── dashboard.js, settings.js, history.js
│       │   └── reports.js, users.js, chat.js, auth-flow.js
│       ├── services/           # Cross-page services
│       │   ├── global-delegation.js  # ⭐ KEY FILE - data-action dispatcher cấp document.body
│       │   ├── bulk-actions.js       # Checkbox + bulk select cho mọi bảng
│       │   ├── render-dispatcher.js  # render*() router
│       │   ├── save-handlers.js      # save*() router
│       │   ├── form-helpers.js, edit-handlers.js, image-handlers.js
│       │   ├── notifications.js, presence.js, history-log.js
│       │   ├── threads-bg.js         # Login screen WebGL animation
│       │   ├── mobile-sidebar.js     # Mobile UX
│       │   └── (...nhiều helpers khác)
│       ├── ui/                 # UI components (modals, toasts)
│       └── utils/              # Pure helpers
│           ├── format.js       # escapeHtml, escapeJs, vals, fuzzy, fmtDate, autoPrefix
│           ├── dom.js          # flashRow, setText, setHtml
│           ├── auth-helpers.js # canDelete, canEdit, getPersonName
│           └── async.js        # safeAsync wrapper
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

### 4.2. Cache pattern (state.js)
```js
window.cache = {
  hydro: { 'firebase_key_1': { code, name, ... }, ... },
  electrode: { ... },
  // ...
}
```
- Mỗi collection là object, key = Firebase push key, value = record.
- Helper `vals(obj)` chuyển sang array với `_key` field.
- Listen `onValue(ref(db, col))` ở `main.js` → cập nhật `cache[col]` → trigger render.

### 4.3. Render pattern
- Mỗi trang export `renderXxx()` → đọc `cache.xxx` → tạo HTML rows → set vào `tbody.innerHTML`.
- Sau render, gọi `injectCheckboxes(tbodyId)` (bulk-actions.js) để chèn checkbox column.
- Render được trigger từ `render-dispatcher.js` khi cache update.

### 4.4. Save pattern (xem save-handlers.js)
```js
// 1. Validate form
// 2. Build object từ DOM inputs
// 3. fbPush(col, obj) hoặc fbSet(`${col}/${key}`, obj)
// 4. logHistory(action, before, after)
// 5. closeModal + toast success
```

### 4.5. Bulk-select pattern (bulk-actions.js)
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
- Close on click outside: listener trong `main.js`

### 4.8. Notifications
- Schema **flat** (không nested by rule). Bug #11 đã defer — không refactor unless user yêu cầu.

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

## 7. Bugs đã defer (đừng đụng trừ khi user yêu cầu)

- **Bug #11**: Notifications schema flat vs rule-nested. App chạy đúng dù schema không nhất quán. Refactor cost không xứng cho ~50 users.

---

## 8. Roadmap đã thảo luận

- ✅ **Phase Critical Bugs** (51-54): XSS, hard-coded email, presence cleanup
- ✅ **Phase CSP** (55-58e): strict CSP, ~480 inline events removed
- ✅ **UI fixes** (57d, 60, 60b): booking column layout
- 🔮 **Phase 59+ TS migration**: TypeScript (chưa start)
- 🔮 **Optional**: Bỏ inline `style=` để Mozilla 135/100 max (effort lớn, lợi ích nhỏ)

---

## 9. Khi cần đọc codebase nhanh

Đề xuất thứ tự:
1. `package.json` — stack overview
2. `index.html` (search "id=" để map page IDs) — UI structure
3. `src/js/main.js` — init flow + Firebase listeners
4. `src/js/services/global-delegation.js` — toàn bộ event routing
5. `src/js/state.js` — cache schema
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

## 11. TypeScript Migration (đang diễn ra)

**Status**: Round 61 (toolchain setup) đã hoàn tất. Bắt đầu migrate các file dần.

**Strategy**: Pure TypeScript migration (rename `.js` → `.ts` từng file một).

**Thứ tự migrate** (đã thỏa thuận):
1. ✅/⏳ `src/js/utils/*` — hàm thuần, dễ type nhất
2. ⏳ `src/js/state.js` + `auth.js` — state chính
3. ⏳ `src/js/services/*` — bulk-actions, render-dispatcher, save-handlers, ...
4. ⏳ `src/js/pages/*` — booking.js, dashboard.js, etc.
5. ⏳ `src/js/main.js` — file lớn nhất, cuối cùng

**Config quan trọng** (xem `tsconfig.json`):
- `allowJs: true`, `checkJs: false` — `.js` và `.ts` cùng tồn tại trong migrate phase
- `strict: false` ban đầu, **sẽ tighten dần** sau khi migrate xong các phần
- `noEmit: true` — Vite tự handle compile, TS chỉ type-check
- `isolatedModules: true` — Vite requirement

**Window types**: Khai báo trong `src/js/types/global.d.ts`. Khi thêm `window.X` mới trong code → thêm declaration ở đây.

**Commands**:
```bash
npm run typecheck         # check types (không fail build)
npm run typecheck:watch   # watch mode
npm run build             # build vẫn work bình thường (Vite ignore type errors)
npm test                  # 62/62 phải maintain
```

**Quy tắc khi migrate 1 file `.js` → `.ts`**:
1. Rename file: `git mv x.js x.ts`
2. Chạy `npm run typecheck` → fix các type error
3. Imports KHÔNG cần thêm `.ts` extension (Vite resolve cả 2)
4. Tránh dùng `any` rộng rãi — ưu tiên proper types
5. Test pass + build pass trước khi commit
6. **Mỗi round chỉ migrate 1 nhóm file liên quan** để dễ rollback nếu lỗi

