# Contributing to LabBook BKU

Cảm ơn bạn đã đóng góp! Tài liệu này mô tả quy trình làm việc chuẩn cho team.

*Thanks for contributing! This document describes the standard team workflow.*

---

## 🌳 Branch strategy

Dự án dùng **Trunk-based với feature branches** *(Trunk-based development with feature branches)*:

- `main` — branch chính, luôn deployable. **Không push trực tiếp.**
- `feat/<short-name>` — tính năng mới
- `fix/<short-name>` — sửa bug
- `docs/<short-name>` — chỉ sửa tài liệu
- `refactor/<short-name>` — refactor code
- `chore/<short-name>` — task lặt vặt (deps, config)

**Ví dụ tên branch:**

```
feat/booking-recurring        # Đặt lịch định kỳ
fix/presence-race-condition   # Sửa bug presence
docs/api-reference            # Viết doc API
refactor/split-booking-page   # Tách booking.js thành modules
chore/upgrade-firebase-13     # Update Firebase
```

**Quy tắc đặt tên:**

- Lowercase, dấu gạch ngang
- Không dùng tiếng Việt có dấu (gây lỗi trên nhiều hệ thống)
- Ngắn gọn, mô tả được mục đích
- Tối đa ~40 ký tự

---

## ✏️ Conventional Commits

**Bắt buộc** dùng format này cho commit message *(Mandatory for all commits)*:

```
<type>(<scope>): <description>

[optional body — chi tiết tại sao thay đổi]

[optional footer — BREAKING CHANGE / Closes #xxx]
```

### Các `type` cho phép

| Type | Khi nào dùng | Bump version |
|---|---|---|
| `feat` | Tính năng mới / New feature | minor |
| `fix` | Sửa bug / Bug fix | patch |
| `docs` | Sửa docs / Documentation only | none |
| `style` | Format, semicolons, ... (không đổi logic) | none |
| `refactor` | Đổi cấu trúc code, không đổi behavior | patch |
| `perf` | Tối ưu performance | patch |
| `test` | Thêm/sửa test | none |
| `chore` | Build, deps, config | none |
| `ci` | CI/CD config | none |

### `scope` (optional nhưng khuyến nghị)

Chỉ ra khu vực ảnh hưởng:

- `auth`, `presence`, `booking`, `dashboard`, `chemicals`, `equipment`, `notifications`, `chat`, ...
- `deps` cho update dependencies
- `ci` cho CI config

### Ví dụ tốt / Good examples

```
feat(booking): add recurring booking option

User có thể tạo booking lặp lại theo tuần/tháng. Lưu pattern vào
bookings/{id}/recurrence và auto-generate các record con khi đến hạn.

Closes #42
```

```
fix(presence): cancel onDisconnect handler on logout

Trước fix, server vẫn giữ onDisconnect cũ sau khi user logout, dẫn
đến ghi đè presence khi user khác login cùng tab.
```

```
docs(architecture): document data flow between listeners and renderers
```

```
chore(deps): update firebase to 12.13.0
```

### Ví dụ xấu / Bad examples

```
❌ update code
❌ Fixed bug
❌ wip
❌ asdf
❌ feat: stuff
```

### Breaking changes

Nếu thay đổi phá API, thêm `BREAKING CHANGE:` ở footer hoặc `!` sau type:

```
feat(api)!: rename fbListen to firebaseListen

BREAKING CHANGE: fbListen đã đổi tên thành firebaseListen.
Tất cả module dùng fbListen cần update.
```

---

## 🔄 Workflow chuẩn

### 1. Bắt đầu task mới

```bash
# Sync main mới nhất
git checkout main
git pull origin main

# Tạo branch
git checkout -b feat/your-feature-name
```

### 2. Làm việc

```bash
# Code...
# Test local: npm run dev

# Commit thường xuyên (không gom 1 commit khổng lồ)
git add <files>
git commit -m "feat(scope): description"
```

### 3. Push & tạo Pull Request

```bash
git push -u origin feat/your-feature-name
```

Vào GitHub → tạo Pull Request từ branch của bạn vào `main`.

### 4. PR review

- **Tối thiểu 1 reviewer** approve trước khi merge
- CI phải pass (build + test + lint)
- Resolve mọi conversation
- Update branch nếu `main` đã đi xa hơn (rebase hoặc merge)

### 5. Merge

- Dùng **Squash and merge** cho feature branch (gom commits thành 1)
- Hoặc **Rebase and merge** nếu commit history đã clean

---

## 📋 PR checklist

Trước khi tạo PR, đảm bảo:

- [ ] Code chạy được local (`npm run dev`)
- [ ] Build thành công (`npm run build`)
- [ ] Đã test các trường hợp chính
- [ ] Commit message theo Conventional Commits
- [ ] Không có `console.log` debug còn sót
- [ ] Không commit file `.env` hoặc credentials
- [ ] Không commit `node_modules`, `dist`, `_backups_*`
- [ ] Update docs nếu cần (README, ARCHITECTURE)
- [ ] Đã thêm test nếu là feature/fix logic (sau khi setup test framework)

---

## 🧪 Testing philosophy

*(Sẽ được update khi setup test framework)*

- Test các **utility thuần** trước (format, dom, async, auth-helpers)
- Test **business logic** trong services
- Không test UI rendering chi tiết — focus vào logic
- Manual test cho UX flows

---

## 🚫 Không nên làm / Things to avoid

- ❌ Push trực tiếp lên `main`
- ❌ Commit `.env`, API keys, credentials
- ❌ Commit `dist/`, `node_modules/`, `_backups_*/`
- ❌ Force push lên branch người khác đang dùng
- ❌ PR khổng lồ (>500 lines diff) — chia nhỏ ra
- ❌ Mix nhiều mục đích trong 1 PR (ví dụ: vừa add feature vừa fix bug + refactor)
- ❌ Bỏ qua review của teammate

---

## 🔧 Code style

- **Indent:** 2 spaces
- **Quotes:** Single quotes cho JS, double cho HTML attributes
- **Semicolons:** Có (consistent với codebase hiện tại)
- **Line length:** ~120 chars (mềm, không strict)
- **Naming:**
  - `camelCase` cho variables, functions
  - `PascalCase` cho class (hiếm dùng)
  - `UPPER_SNAKE` cho constants global
  - `kebab-case` cho CSS classes, file names
- **Comments:**
  - Tiếng Việt OK trong codebase này (team VN)
  - Function comment dùng JSDoc cho public API

---

## 📦 Quản lý dependencies

- Cài deps mới: `npm install <pkg>` rồi commit cả `package.json` + `package-lock.json`
- Update deps: `npm outdated` để xem, `npm update <pkg>` để update
- Cần dev dep? Dùng `npm install --save-dev <pkg>`
- Tránh add deps không thực sự cần — bundle size tăng → user load chậm

---

## 🔒 Security

- **Không bao giờ** commit:
  - File `.env` hoặc bất kỳ file chứa keys/secrets
  - Service account JSON từ Firebase
  - User data thật (đặc biệt PII)
- Khi cần share config, dùng `.env.example` với giá trị placeholder
- Báo ngay nếu phát hiện secret bị leak để rotate keys

---

## 🆘 Cần giúp đỡ?

- Đọc `README.md` cho quick start
- Đọc `ARCHITECTURE.md` để hiểu cấu trúc
- Hỏi trong group chat của team
- Tạo issue trên GitHub nếu là bug/feature request

---

## 📝 Cập nhật quy ước này

Quy ước này có thể thay đổi theo thời gian. Khi cần đổi, tạo PR sửa file này + thông báo team.

*This document evolves over time. To change conventions, create a PR editing this file + notify the team.*
