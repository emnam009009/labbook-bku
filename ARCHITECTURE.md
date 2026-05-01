# Architecture

Tài liệu này mô tả kiến trúc, luồng dữ liệu, và quy ước code của LabBook BKU.

*This document describes the architecture, data flow, and code conventions of LabBook BKU.*

---

## 🎯 Triết lý thiết kế / Design philosophy

- **Vanilla JS, không framework** — Dự án dùng ES modules thuần, không React/Vue. Lý do: nhẹ, ít dependencies, dễ debug.
- **Single Page App** — Tất cả content trong `index.html`, JavaScript điều khiển hiển thị qua class `.active` trên các `.page`.
- **Firebase làm backend** — Realtime Database cho data, Authentication cho user, Hosting cho deploy. Không có server riêng.
- **Realtime first** — Mọi thay đổi data đều sync qua Firebase listeners → re-render. Không có "save button" cho user, mà mọi update đều push trực tiếp lên DB.

*Vanilla JS with no framework. Single page app. Firebase backend. Realtime sync everywhere.*

---

## 📁 Cấu trúc thư mục / Folder structure

```
src/js/
├── main.js                          # Entry point — import tất cả modules, gắn lên window, khởi động app
├── firebase.js                      # Init Firebase + export helpers (fbSet, fbGet, fbListen, ...)
├── auth.js                          # Authentication core (login, register, role management)
├── state.js                         # Module-level state (chia sẻ giữa các module)
├── labbook-extensions.js            # Extension cũ (chuẩn bị deprecate)
│
├── pages/                           # Mỗi file = 1 trang trong app
│   ├── auth-flow.js                 # Login/Register/Logout UI
│   ├── dashboard.js                 # Trang chủ với KPI + charts
│   ├── experiments.js               # Hydrothermal, Electrode, Electrochem (gộp 3 page)
│   ├── chemicals.js                 # Quản lý hóa chất
│   ├── ink.js                       # Quản lý mực in
│   ├── equipment.js                 # Quản lý thiết bị
│   ├── booking.js                   # Đặt lịch + week time-grid (~1500 lines)
│   ├── members.js                   # Danh sách thành viên
│   ├── users.js                     # Quản lý user accounts (admin only)
│   ├── history.js                   # Lịch sử thao tác (admin only)
│   ├── chat.js                      # Chat group
│   └── week-grid-snippet.js         # Helper cho booking week-grid
│
├── services/                        # Business logic, không trực tiếp render
│   ├── listeners.js                 # Firebase listeners cho 12 collections
│   ├── presence.js                  # Online/offline tracking
│   ├── notifications.js             # Bell icon + toast notifications
│   ├── notifications-hooks.js       # Hooks tự động tạo notification khi có event
│   ├── render-dispatcher.js         # Gọi đúng render function theo collection
│   ├── theme.js                     # Theme switching logic
│   ├── theme-picker-ui.js           # UI cho theme picker
│   ├── avatar.js                    # User avatar logic
│   ├── avatar-menu-a11y.js          # A11y cho avatar dropdown
│   ├── save-handlers.js             # Handler save form (hydro, electrode, ...)
│   ├── edit-handlers.js             # Handler edit row inline
│   ├── image-handlers.js            # Upload/paste/drop ảnh
│   ├── form-helpers.js              # Helper điền form, calc loading, lookup CAS, ...
│   ├── group-lock-mgmt.js           # Quản lý nhóm + lock items
│   ├── duplicate-delete.js          # Duplicate row + delete với undo
│   ├── bulk-actions.js              # Bulk select + bulk operations
│   ├── bulk-multi-select.js         # Multi-select state
│   ├── bulk-row-style.js            # CSS cho bulk select rows
│   ├── date-range-filter.js         # Filter theo khoảng ngày
│   ├── member-filter.js             # Filter theo thành viên
│   ├── global-search.js             # Cmd+K global search
│   ├── excel-export.js              # Export ra Excel
│   ├── table-sort.js                # Sort theo column header
│   ├── table-align.js               # Cân chỉnh table layout
│   ├── custom-select-keyboard.js    # Keyboard nav cho custom selects
│   ├── a11y-enhancements.js         # ARIA + keyboard improvements
│   ├── history-log.js               # Helper ghi vào history collection
│
├── ui/                              # UI primitives, không phụ thuộc logic
│   ├── modal.js                     # Open/close modal + hooks
│   ├── toast.js                     # Show/hide toast
│   ├── navigation.js                # Show page, sidebar toggle
│   └── custom-selects.js            # Custom dropdown component
│
└── utils/                           # Pure functions, không có side effect
    ├── format.js                    # escapeHtml, vals, fuzzy, formatChemical, fmtDate, ...
    ├── dom.js                       # flashRow, setText, setHtml
    ├── async.js                     # safeAsync wrapper
    └── auth-helpers.js              # canEdit, canDelete, getPersonName
```

---

## 🔄 Data flow

### 1. Khởi động app / App startup

```
[index.html] loads
    ↓
[main.js] imports tất cả modules
    ↓
[main.js] gắn handlers lên window cho HTML inline `onclick=...` gọi được
    ↓
DOMContentLoaded fires
    ↓
[main.js] initAuth() → đăng ký onAuthStateChanged listener
    ↓
Nếu user đã login (token còn) → onLogin callback chạy
    ↓
[main.js] gọi startListeners()
    ↓
[listeners.js] đăng ký 12 fbListen() cho: hydro, electrode, electrochem,
    chemicals, members, history, ink, equipment, groups, bookings,
    notifications, presence + listener riêng cho users
    ↓
Mỗi listener nhận data → set window.cache[collection] → renderAll()
    ↓
[render-dispatcher.js] gọi đúng renderXxx() cho page đang active
```

### 2. User thực hiện hành động / User action flow

Ví dụ: tạo thí nghiệm hydrothermal mới.

```
User click "Thêm thí nghiệm" → openModal('modal-hydrothermal')
    ↓
User điền form → click "Lưu"
    ↓
[save-handlers.js] saveHydro() được gọi (qua window.saveHydro)
    ↓
Validate → fbPush('hydro', data)
    ↓
Firebase ghi → listener trong [listeners.js] tự nhận update
    ↓
window.cache.hydro được cập nhật
    ↓
window.dispatchEvent('cache-update', {col: 'hydro'})
    ↓
renderAll() → renderHydro() re-render bảng
    ↓
notifications-hooks.js detect data mới → tạo notification cho admins
```

### 3. Realtime sync giữa nhiều client / Multi-client realtime

Khi user A tạo record mới:
- Firebase nhận `push()` từ A
- Firebase đẩy event xuống TẤT CẢ client đang listen (kể cả A)
- Mỗi client tự cập nhật `cache` của mình → re-render

Đây là lý do dự án không cần "refresh button" — UI luôn đồng bộ với DB.

---

## 🗄 Cấu trúc Firebase Realtime DB

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
├── chemicals/{id}         # Hóa chất
├── equipment/{id}         # Thiết bị
├── members/{id}           # Thành viên lab
├── ink/{id}               # Mực in
├── groups/{id}            # Nhóm hóa chất
├── eq_groups/{id}         # Nhóm thiết bị
│
├── bookings/{id}          # Đặt lịch sử dụng thiết bị
│   ├── userId
│   ├── equipmentId
│   ├── date
│   ├── startTime, endTime
│   ├── status             # pending | approved | in-use | completed | rejected | cancelled
│   └── ...
│
├── notifications/{uid}/{id}
├── presence/{uid}
│   ├── online: bool
│   └── lastSeen: timestamp
│
├── chat/
│   ├── messages/{id}
│   └── typing/{uid}
│
├── history/{id}           # Audit log (admin only)
└── settings/
    ├── title              # Tên lab hiển thị
    └── subtitle
```

Rules chi tiết: `database.rules.json`. *Detailed rules in `database.rules.json`.*

---

## 🪝 Window globals — Pattern bridging modules với HTML inline

Vì HTML có rất nhiều `onclick="saveHydro()"` (legacy), `main.js` gắn các function cần thiết lên `window`:

```js
window.saveHydro = saveHydro;
window.openModal = openModal;
window.showToast = showToast;
// ... ~80 functions tổng
```

**Lý do còn dùng pattern này:** Đã có sẵn trong codebase từ trước refactor. Nếu refactor toàn bộ HTML để dùng `addEventListener` thì là task lớn riêng.

**Khi viết module mới:** Chỉ expose ra `window` nếu HTML cần gọi inline. Bình thường dùng `import/export`.

---

## 🔐 Phân quyền / Role-based access

Đọc role từ `users/{uid}/role`. Lưu vào `currentAuth.role` (object trong `auth.js`).

**3 lớp kiểm tra:**

1. **UI layer** — `applyRoleUI(role)` trong `auth.js` ẩn/hiện element theo class `.admin-only`, `.member-only`. Body có class `viewer-mode` để CSS điều khiển.
2. **Function layer** — Helper `canEdit()`, `canDelete()` trong `utils/auth-helpers.js`. Các save/edit handler check trước khi ghi.
3. **Database layer** — Firebase rules trong `database.rules.json` chặn ở DB level. **Đây là lớp duy nhất chống được attack** — UI và function layer chỉ là UX, ai có console đều bypass được.

⚠️ **Quan trọng:** Mọi rule mới ở 2 lớp đầu phải có rule tương ứng ở DB rules. *Any UI/function rule must have a corresponding DB rule.*

---

## 🎨 CSS architecture

```
src/css/
├── main.css                # Toàn bộ styles chính (~3000 lines)
├── argon-flavor.css        # Theme Argon variant
├── theme-swatches.css      # Color picker UI
└── sidebar-smooth.css      # Sidebar animation tinh chỉnh
```

**Theming pattern:** CSS variables ở `:root`, theme picker đổi values qua `style.setProperty('--teal', '#0d9488')`. Tất cả component dùng `var(--teal)` thay vì hard-code màu.

```css
:root {
  --teal: #0d9488;
  --teal-light: #f0fdfa;
  --border: #e2e8f0;
  --text: #0f172a;
  --surface: #ffffff;
  --danger: #ef4444;
  /* ... */
}
```

**Dark mode:** Override các var trong `html.dark { ... }`.

---

## 🧩 Module dependency rules

Để tránh circular import:

- `utils/*` — không import gì khác trong project (pure)
- `ui/*` — chỉ có thể import từ `utils/*`
- `services/*` — có thể import từ `utils/*`, `ui/*`, `firebase.js`, `auth.js`
- `pages/*` — có thể import bất cứ thứ gì
- `main.js` — orchestrator, import tất cả

**Pattern bypass:** Nếu cần truy cập từ thấp lên cao, dùng `window.cache` hoặc dispatch CustomEvent.

---

## 🚦 Khi nào dùng listener vs fbGet?

- **fbListen** — khi cần realtime sync (hầu hết trường hợp)
- **fbGet** — khi chỉ cần đọc 1 lần (validate trước khi ghi, init data, ...)

---

## 🐛 Known technical debt

- `main.js` quá lớn (~1300 lines), cần split thành sub-modules
- `booking.js` ~1500 lines, có thể tách week-grid ra riêng
- `labbook-extensions.js` cũ, các logic trong này nên migrate dần
- Window globals nhiều — long-term nên thay bằng event bus
- Chưa có TypeScript

---

## 📚 Tham khảo / References

- [Firebase Realtime Database docs](https://firebase.google.com/docs/database)
- [Vite docs](https://vitejs.dev/)
- [Tailwind CSS docs](https://tailwindcss.com/docs)
