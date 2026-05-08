# AUDIT_LOG.md — Pre-Commercial Audit (Round 116-126)

> **Đây là tài liệu tham khảo cho future sessions debug regression.**
>
> Trong May 8 2026, chuẩn bị commercialize, owner Nam đã yêu cầu Claude audit toàn bộ codebase. 14 bugs + 3 features được phát hiện và fix trong 11 round (R116→R126). File này ghi lại từng bug với root cause + fix location để khi gặp regression sau, có thể tra cứu nhanh.

## Quick navigation

| Bug | Round | Type | Severity | Files |
|---|---|---|---|---|
| 1. Auth listener leak | R116 | Memory leak | High | `auth.ts` |
| 2. Presence stuck online | R116 | Logic | Medium | `auth.ts` |
| 3. Booking race condition | R119+R120 | Race | High | `booking.ts`, `database.rules.json` |
| 4. XSS in edit modal | R116 | Security | High | `edit-handlers.ts` |
| 5-6. (skipped numbering) | - | - | - | - |
| 7. Orphan storage | R117 | Resource leak | Medium | `attachments.ts` |
| 8. Chat message recall rule | R117 | Logic | Medium | `database.rules.json` |
| 9. escapeJs XSS | R117 | Security | High | `format.ts` |
| 10. Stock race | R118 | Race | High | `firebase.ts`, `save-handlers.ts` |
| 11. Stock leak (delItem) | R118 | Logic | Medium | `duplicate-delete.ts` |
| 12. Image upload size | R118 | Resource | Medium | `image-handlers.ts` |
| 13. Notification security | R121+R122 | Security | High | `notifications.ts`, `database.rules.json` |
| 14. Stale lock cleanup | R122 | Logic edge case | Low | `booking.ts` |
| A. Search box stuck | R121 | UX | Low | `global-search.ts`, `navigation.ts` |
| B. Bulk select missing | R121 | UX | Medium | `booking.ts`, `ink.ts` |
| C. Member card del-btn | R121 | UX | Low | `main.css` |
| D. Bell empty | R121→R122 | Logic | High | `database.rules.json`, `notifications.ts` |
| E. Import/export role | R124 | Security | Medium | `main.css`, `experiments.ts` |
| F. File picker not opening | R124 | UX | High | `attachments-panel.ts` |
| G. VN diacritics missing | R124 | UX cosmetic | Low | `qr-labels.ts` |

---

## Bug 1 — Auth role listener leak (R116)

**Symptom**: After logout/relogin, console errors về stale `currentAuth.role`. Có thể overwrite role giữa các users nếu users chia sẻ máy.

**Root cause**: `loadUserRole` trong `auth.ts` dùng `onValue(userRef, ...)` không lưu unsubscribe handle. Mỗi lần re-call (relogin) thì add thêm listener mới mà không clean cũ. Listeners cũ vẫn fire callback → có thể overwrite `currentAuth.role` của user mới.

**Fix**: Track `_roleUnsub: UnsubFn | null` module-level. Trước khi attach listener mới, gọi `_roleUnsub()` nếu có. Thêm hàm `stopRoleListener()` exported, gọi từ logout flow.

**Where**: `src/ts/auth.ts` lines ~115-145

**Regression check**: Test logout user A → login user B → mở DevTools, xem listener count cho `users/{uidA}` (phải = 0).

---

## Bug 2 — Presence stuck `online: true` (R116)

**Symptom**: User logout nhưng presence vẫn `online: true` trong RTDB → các user khác thấy họ online.

**Root cause**: Trong `logout()`, thứ tự gốc là `signOut(auth)` rồi mới `stopPresence()`. Nhưng `stopPresence` cố `set(ref(db, 'presence/{uid}'), { online: false })` — rule là `auth.uid === $uid` → sau `signOut` thì `auth.uid === null` → write deny silent → presence kẹt.

**Fix**: Move `stopPresence()` LÊN TRƯỚC `signOut(auth)` trong logout flow. Import `stopPresence` directly thay vì qua `window` (tránh circular deps).

**Where**: `src/ts/auth.ts`, function `logout`

**Regression check**: Logout user → check `presence/{uid}/online` trong Firebase Console = `false`.

---

## Bug 3 — Booking race condition (R119 + R120)

**Symptom**: 2 user cùng đặt 1 thiết bị cùng giờ → cả 2 đều thành công → silent duplicate booking.

**Root cause**: `saveBooking` (R119), `calOnDrop` drag/drop (R120), `dayOnResizeEnd` resize (R120) đều dùng cache local check + non-atomic `fbPush`. Window giữa check và push có thể có race.

**Fix architecture**: Path mới `booking_locks/{equipmentKey}_{date}` với `slots: [{start, end, bookingKey, status}]` array.

**Helpers** (in `booking.ts`):
- `tryReserveSlot(eqKey, date, start, end, tempId)` — atomic via `runTransaction`, check overlap với active slots (pending/approved/in-use)
- `tryReserveSlotForUpdate(eqKey, oldDate, newDate, ..., bookingKey)` — same-date case merges remove-old + add-new in single transaction; cross-date adds at new date (caller releases old separately)
- `updateSlotStatus(eqKey, date, bookingKey, newStatus, matchTempId?)` — patch tempId → real key, hoặc remove khi reject/cancel/complete

**Flow saveBooking**:
1. Pre-flight cache check (UX feedback)
2. `tryReserveSlot` với tempId → fail → toast + abort
3. `fbPush` booking → success → `updateSlotStatus(tempId → realKey, 'pending')`
4. Push fail → rollback slot

**Status handlers cleanup slot**: `confirmRejectBooking`, `cancelBooking`, `checkInBooking`, `checkOutBooking`, `deleteBooking` (superadmin), `autoCancelOverdueBookings`.

**Behavior change R120**: Admin không còn force-override conflict được. Server enforce no overlap.

**Where**: `src/ts/pages/booking.ts` lines 50-186 (helpers), saveBooking ~880, calOnDrop ~1500, dayOnResizeEnd ~1610. `database.rules.json` thêm `booking_locks` rule.

**Regression check**: 2 tab incognito, đăng 2 account khác, cùng pick 1 equipment + 1 slot → 1 thắng, 1 nhận toast "Trùng lịch (server)".

---

## Bug 4 — XSS in edit modal (R116)

**Symptom**: Nếu chemical/equipment name có `"` hoặc HTML, mở edit modal → break layout hoặc execute script.

**Root cause**: `editHydro` và `editInk` build rows interpolate `chem.name` / `s.name` / `l.name` / map keys vào `value="..."` HTML attribute không escape.

**Fix**: Wrap với `escapeHtml()` ở 3 sites. Test: tạo chemical với name `<img src=x onerror=alert(1)>` → mở edit → không alert.

**Where**: `src/ts/services/edit-handlers.ts`

---

## Bug 7 — Orphan Storage (R117)

**Symptom**: Storage Spark plan 5GB quota đầy nhanh hơn dự kiến. File trong Storage không reference gì trong RTDB.

**Root cause**: `uploadAttachment` trong `attachments.ts`: upload file → `getDownloadURL` → `fbSet(metadata)`. Nếu `getDownloadURL` hoặc `fbSet` fail → file kẹt trong Storage không có metadata → orphan.

**Fix**: Wrap post-upload steps trong try/catch. Nếu fail → `deleteObject(storageRef)` để rollback.

**Where**: `src/ts/services/attachments.ts`

**Regression check**: Mock `fbSet` throw error → upload file → check Storage Console không có file mới.

---

## Bug 8 — Chat message recall rule (R117)

**Symptom**: 
- User cố recall (xóa text) message → permission denied
- Superadmin cố moderate (xóa) message của user khác → denied

**Root cause**: Rule cũ:
```
".validate": "newData.hasChildren(['uid','ts','text']) && newData.child('uid').val() === auth.uid"
```
- `hasChildren(['text'])` fail khi `text: null` (recall)
- `uid === auth.uid` fail khi superadmin xóa của user khác

**Fix**: Relax validation:
```
".validate": "newData.hasChildren(['uid','ts']) && (newData.child('recalled').val() === true || newData.child('text').isString()) && (newData.child('uid').val() === auth.uid || data.exists())"
```

**Where**: `database.rules.json`, path `chat/{messageId}/.validate`

---

## Bug 9 — escapeJs XSS (R117)

**Symptom**: Member với name chứa `"` hoặc `'` → click "Xóa" → confirm dialog hiện sai hoặc execute script.

**Root cause**: `escapeJs()` trong `format.ts` chỉ escape `'` và `\\` nhưng không escape `"`. Sites dùng:
```js
data-name="${escapeJs(member.name)}"
```
Nếu name có `"` → break attribute boundary → XSS.

**Fix**: Add `.replace(/"/g, '&quot;')` vào `escapeJs`. Update test trong `format.test.ts`.

**Where**: `src/ts/utils/format.ts`, function `escapeJs`. 3 use sites: members/equipment/chemicals delete buttons.

---

## Bug 10-11 — Stock race + Stock leak (R118)

**Bug 10 — Race**:
- 2 user concurrent saveHydro/saveElectrode dùng cùng chemical → cả 2 read `stock=100`, compute `100-50=50` và `100-30=70` → 1 user write thắng → mất delta của user kia.
- Vd: 100g - 50g - 30g concurrent → result 70g thay vì 20g.

**Bug 11 — Leak**:
- `delItem` refund stock cho usedChems sequentially với `await update` per chemical.
- Nếu fail mid-loop + user retry → đã refund 1 phần + refund toàn bộ lần 2 = double refund.

**Fix cả 2**: Helper `incrementStock(chemKey, delta, precision)` trong `firebase.ts`:
```typescript
export async function incrementStock(chemKey: string, delta: number, precision = 2) {
  const stockRef = ref(db, `chemicals/${chemKey}/stock`);
  await runTransaction(stockRef, (current) => {
    const cur = typeof current === 'number' ? current : 0;
    return Math.round((cur + delta) * Math.pow(10, precision)) / Math.pow(10, precision);
  });
}
```

**Replace sites**:
- `save-handlers.ts`: 4 sites (saveHydro/saveElectrode × 2 — base + duplicate undo)
- `duplicate-delete.ts`: 2 sites (delItem + undo)

Pattern: thay vì `update(ref, { stock: newValue })`, dùng `incrementStock(chemKey, -consumed)`.

**Where**: `src/ts/firebase.ts`, `src/ts/services/save-handlers.ts`, `src/ts/services/duplicate-delete.ts`

---

## Bug 12 — Image upload size (R118)

**Symptom**: User upload ảnh 10MB+ → base64 encoded ~13MB → push thẳng vào RTDB → bloat.

**Root cause**: 7 image upload handlers không có size check.

**Fix**: Helper `validateImageFile(file: File)` trong `image-handlers.ts`:
- MAX_RAW_BYTES = 800 * 1024 (~800KB raw, ~1MB base64)
- Check `file.size > MAX_RAW_BYTES` → throw "Ảnh quá lớn..."
- Check MIME type `image/*`

**Wired into 7 sites**:
- ink, electrode, hydro drop-cell upload
- chemical drop-cell, chemical-upload
- equipment-preview, equipment-drop-cell

**Where**: `src/ts/services/image-handlers.ts`

---

## Bug 13 — Notification schema flat → nested (R121 → R122)

**Phase 1 (R121 quick fix)**:
- Code dùng `fbPush('notifications', notif)` → flat path `notifications/{notifId}`
- Rules cũ định nghĩa nested `notifications/$uid/{notifId}` với `.write: auth.uid === $uid`
- Mismatch: pushId !== auth.uid → rule deny silent → bell empty mãi
- **R121 quick fix**: relax rules cho flat path. Trade-off: mọi member đọc được notification của user khác (chỉ filter ở client UI).

**Phase 2 (R122 proper)**:
- Schema mới: `notifications/{uid}/{notifId}` (nested per-user) + `notifications/_admin/{notifId}` (broadcast fallback)
- `createNotification` fan-out:
  - `targetUid` cụ thể → 1 write `notifications/{targetUid}/{notifId}`
  - `targetUid=null` (broadcast admin) → fetch admin list từ `cache.users` → multi-write per admin
  - Fallback: nếu member không có quyền đọc users → push `notifications/_admin/{notifId}`
- `listeners.ts`: per-user listen `notifications/{myUid}` thay vì full. Admin/superadmin listen thêm `notifications/_admin`, merge vào bucket của uid hiện tại.
- `getMyNotifications`: đọc từ `cache.notifications[myUid]` only.
- mark-read / clear / delete: paths đổi sang nested.
- Rules:
  ```json
  "notifications": {
    "$uid": {
      ".read": "auth.uid === $uid || $uid === '_admin'",
      ".write": "member|admin|superadmin"
    }
  }
  ```
- Trade-off còn lại: `.write` cho phép member ghi mọi uid bucket (cần cho fan-out). Mức rủi ro: thấp với 50-user nội bộ. Khi commercialize cần Cloud Function gateway.

**Migration**: One-shot script `scripts/migrate-notifications-r122.mjs` dùng `firebase-admin` SDK:
- Backup tự động
- Dry-run plan + confirmation
- Idempotent (heuristic: notif object có field `createdAt`/`type` = flat; map = nested bucket)
- Atomic apply qua `ref().update(map)`

**Where**: `src/ts/services/notifications.ts`, `src/ts/services/listeners.ts`, `database.rules.json`, `scripts/migrate-notifications-r122.mjs`

---

## Bug 14 — Stale lock cleanup (R122)

**Symptom**: Slot `tmp_*` kẹt trong `booking_locks` mãi sau khi user close tab giữa chừng saveBooking.

**Root cause**: Edge case từ R119:
- `tryReserveSlot` thắng → fbPush bị interrupt (network drop, tab close)
- Slot `tmp_<ts>_<rand>` không được `updateSlotStatus(tempId → realKey)`
- Hoặc booking bị xóa cứng nhưng slot không cleanup

**Fix**: Helper `cleanupStaleLocks()` trong `booking.ts`:
- Throttle 5min, admin-only (giảm contention)
- Fire-and-forget từ `renderBooking` (không block render)
- Logic: scan `booking_locks/*`, mỗi slot kiểm tra:
  1. `tmp_*` + parse timestamp từ `tmp_<ts>_<rand>` + age > 60s → drop
  2. bookingKey không tồn tại trong `cache.bookings` → drop
  3. booking.status ∈ `[rejected, cancelled, completed]` → drop slot
  4. status mismatch với booking.status → sync

**Where**: `src/ts/pages/booking.ts`, function `cleanupStaleLocks`

---

## Bug A — Search box stuck expand sau navigate (R121)

**Symptom**: Gõ search → click result → navigate → quay lại dashboard → search box vẫn expanded (rectangle, không tròn).

**Root cause**:
1. `closeDropdown` dùng `removeProperty` xóa inline styles → element không có width inline → render kì lạ vì CSS không có rule cho `#header-search-box` set width
2. Logic mouseleave check `if (i.value)` skip nếu input còn value → stuck

**Fix**:
- `closeDropdown`: explicit set `width:40px; border-radius:50%` (không dùng removeProperty)
- `showPage`: reset header search box state mỗi khi navigate (clear value, blur, collapse)

**Where**: `src/ts/services/global-search.ts`, `src/ts/ui/navigation.ts`

---

## Bug B — Bulk select missing (R121)

**Symptom**: 
- Trang Booking với account member: không có checkbox bulk select
- Trang Ink (mọi role): không có checkbox

**Root cause**: `bulk-actions.ts` tìm row key bằng `tr.dataset.key` hoặc `tr.querySelector('[data-action][data-key]')`.
- **Booking**: `<tr>` không có `data-key`. Member viewing booking không phải của mình → action cell rỗng → không có `[data-action][data-key]` → bulk skip row.
- **Ink**: dùng `data-ink-action`/`data-ink-key` (custom attr names) không phải `data-action`/`data-key` → bulk không nhận diện.

**Fix**: Thêm `data-key="${r._key}"` (hoặc `escapeJs` version) vào `<tr>` cả 2 file.

**Where**: `src/ts/pages/booking.ts`, `src/ts/pages/ink.ts`

---

## Bug C — Member card del-btn position varied (R121)

**Symptom**: Member card với data ít (chỉ email) → nút Xóa ở giữa card. Member card với data đầy đủ → nút Xóa ở dưới. Không nhất quán.

**Root cause**: `.member-card` không có flex layout → del button cao theo content height tự nhiên.

**Fix**: 
```css
.member-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.member-card .member-del-btn {
  margin-top: auto;
  align-self: flex-end;
}
```

**Where**: `src/css/main.css`, vùng `.member-card`

---

## Bug D — Bell empty (R121 quick + R122 proper)

Đã giải thích chung với Bug 13. R121 fix tạm bằng relax rules, R122 refactor proper với migration script.

---

## Bug E — Import/export role gate (R124)

**Symptom**: Member thấy nút 3-line bar mở menu "Nhập/xuất dữ liệu" trên row thí nghiệm.

**Fix 2 lớp (defense-in-depth)**:
1. **CSS**: Hide trigger với `body.member-mode | viewer-mode | pending-mode | rejected-mode`
2. **JS**: Gate role trong action handler `experiments.ts` case `'exp-actions-menu'` — non-admin click → toast deny

**Where**: `src/css/main.css`, `src/ts/pages/experiments.ts`

---

## Bug F — File picker không trigger được (R124)

**Symptom**: Trong dialog tài liệu, click "Chọn file" → không mở file picker. Chỉ kéo thả file vào dropzone mới work.

**Root cause**: `<input type="file" hidden />` (HTML5 hidden attribute) — trên 1 số browser, label-input association không trigger picker khi input bị `hidden`.

**Fix**:
- Thay `hidden` bằng visually-hidden CSS:
  ```css
  position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0
  ```
- Thêm explicit click handler trên label làm fallback. Tránh double-fire bằng check `t.tagName === 'INPUT'`.

**Where**: `src/ts/ui/attachments-panel.ts`, file input markup + handler

---

## Bug G — VN diacritics missing (R124)

**Symptom**: Print window QR labels và confirm dialog show text không dấu (`Dong`, `nhan QR`, `Tai PDF`).

**Root cause**: Code source được lưu/edit qua tool không hỗ trợ Vietnamese đúng (có thể là Python script chỉnh patches?).

**Fix**: Thay tất cả thành text có dấu: `Đóng`, `nhãn QR`, `Tải PDF`, `Bạn muốn xử lý`, `In trực tiếp`, `Nhập 1 hoặc 2`.

**Where**: `src/ts/services/qr-labels.ts` lines 161-163, 290-294

---

## Workflow patterns established

### 1. Patch generation workflow

R116-R126 dùng git diff patches thay vì atomic Python scripts (như R104 và trước). Workflow:

```bash
# Trên máy Claude:
cd /home/claude/labbook-bku
# ... edit files ...
npm run typecheck && npm test && npm run build  # verify
git diff HEAD -- file1 file2 ... > /mnt/user-data/outputs/labbook-bku-bugfix-rXXX.patch

# Trên máy user:
cd ~/LAB-MANAGER/labbook-vite-tailwind/labbook
cp /mnt/d/labbook-patches/labbook-bku-bugfix-rXXX.patch ./
git apply --check labbook-bku-bugfix-rXXX.patch
git apply labbook-bku-bugfix-rXXX.patch
npm run typecheck && npm test
npm run dev   # manual UI test
git add <files>
git commit -m "fix(RXXX): ..."
npm run build && firebase deploy --only hosting[,database]
git push
rm labbook-bku-bugfix-rXXX.patch
```

### 2. Sync drift handling

Nếu patch fail "does not apply", có 2 nguyên nhân thường gặp:
- Local của Claude và user drift (vd Claude clone từ commit cũ, user đã commit thêm)
- Patch đã apply rồi (chạy `git apply` lần 2 trên cùng changes)

Diagnose:
```bash
git status
git log --oneline | head -5
git diff --stat
grep -n "<unique R-marker>" <file>   # check changes đã có chưa
```

Solutions:
- Pull user's branch về Claude clone (`git fetch origin <branch>`)
- Hoặc regen patch dựa trên user's exact state (yêu cầu user paste content file)
- Hoặc apply theo phần (`git apply --include='path/to/file'`)

### 3. Multi-commit-per-patch handling

Khi user merge nhiều round vào 1 commit (vd R120+R122 chung), Claude clone không có separate commits → cần regen patch dựa trên cumulative state. Workflow:
1. Pull merged commit về clone
2. Apply tiếp R(N+1) trên đó
3. Diff = R(N+1) only (không cần stash R(N))

### 4. Migration script pattern (R122)

Khi đổi schema RTDB cần migration:
- Dùng Node.js + `firebase-admin` SDK (bypass rules với service account key)
- Script trong `scripts/`, npm script alias trong `package.json`
- Service account key qua `GOOGLE_APPLICATION_CREDENTIALS` env hoặc default `./serviceAccountKey.json`
- **Phải gitignore key + backup files**
- Pattern: backup → dry-run plan → confirmation → atomic apply via `ref().update(map)`
- Idempotent: detect đã migrate qua heuristic, skip nếu đã ở schema mới

### 5. Database URL region

Project ở `asia-southeast1` (Singapore), URL phải là:
```
https://lab-manager-268a6-default-rtdb.asia-southeast1.firebasedatabase.app
```
Không phải default `lab-manager-268a6-default-rtdb.firebaseio.com` (US region).

Khi viết migration script hoặc cloud function reference DB qua admin SDK: dùng env `FIREBASE_DATABASE_URL` hoặc hardcode đúng region.

---

## Future regression checklist

Khi suspected regression, check theo thứ tự:

1. **Bell empty?** → Check `cache.notifications[myUid]` populate. Listener path đúng `notifications/{myUid}` chưa? Rules deploy mới chưa?
2. **Booking duplicate?** → Check `booking_locks/*` có entry không. `tryReserveSlot` được gọi không?
3. **Stock negative?** → Phải dùng `incrementStock` qua transaction. Tìm `update(ref, { stock: ... })` direct = bug.
4. **Image upload fail?** → Check `validateImageFile` ở 7 sites.
5. **Search box weird?** → Reset state ở `showPage`. Check `closeDropdown`.
6. **Bulk select missing?** → Check `<tr data-key="...">` ở row template.
7. **Member card layout broken?** → Check `.member-card` CSS flex column.
8. **VN diacritics missing somewhere new?** → Grep `Dong\|Tai\|Nhap\|nhan QR` trong source.
9. **File picker không mở?** → Check input không có `hidden` attr (visually-hidden CSS thay thế).
10. **Audit log dòng nào?** → `actionAudit/{ts}` cho AI write tools, `history/{ts}` cho user actions thường.

---

## R129 Phase A2 Add-on (2026-05-08)

> Sau khi commercialize audit done (R116-R126) + docs refresh (R127-R128), R129 thêm 4th action tool theo cùng pattern R115. Hai bug minor phát hiện trong process:

### R129 Bugs (in-development, not regression)

| Bug | Round | Type | Files | Root cause |
|---|---|---|---|---|
| H. confirmAction whitelist miss | R129a-fix | Logic | `confirm-action.ts` | R129a quên update validTypes array — handler reject draft type mới trước khi gọi commitDraft |
| I. Patch boundary blank line | R129b-fix | Patch script | `confirmation-card.ts` | Boundary string trong apply.py viết liền không có blank line, file thực tế có → match fail |

### Lessons R129 (cho future tool addition)

**1. Add action tool checklist** — phải update ĐỦ 5 files:
- `functions/src/tools/actions.ts` — function + interface + ActionDraft union + commitDraft case
- `functions/src/tools/registry.ts` — import + tool def trong ACTION_TOOLS_DEFS
- `functions/src/handlers/confirm-action.ts` — **validTypes whitelist** (DỄ QUÊN — bug H)
- `src/ts/ai/ui/confirmation-card.ts` — DraftPreview interface + ActionDraft union + title/icon switch + body renderer
- `src/css/ai-chat.css` — styles cho card layout mới
- `src/ts/ai/llm/system-prompt.ts` — tool description + examples

**2. Patch boundary methodology** — `cat -A` trước khi viết script:
```bash
sed -n '69,75p' src/ts/ai/ui/confirmation-card.ts | cat -A
```
Output `$` = newline, blank line giữa code blocks → boundary string phải copy exact bao gồm blank lines.

**3. Test pipeline isolation** — sub-rounds tách riêng:
- Backend (R129a): DevTools `fetch` direct call → verify response schema
- Frontend (R129b): Card render visual → verify diff table layout
- System prompt (R129c): Chat test full flow → verify AI tự gọi tool

Test bundle nhau khi pipeline có nhiều stages = khó localize bug (R115d 4 iterations).

### R129 Files map (cho future regression)

```
functions/src/tools/
├── actions.ts                    ← ExperimentResultDraft, recordExperimentResultDraft (R129a)
├── registry.ts                   ← tool def + ACTION_TOOL_NAMES (R129a)
└── ...

functions/src/handlers/
└── confirm-action.ts             ← validTypes whitelist (R129a-fix)

src/ts/ai/ui/
└── confirmation-card.ts          ← experiment-result-draft template (R129b/b-fix)

src/css/
└── ai-chat.css                   ← .ai-confirm-card__diff-{table,row,old,arrow,new} (R129b)

src/ts/ai/llm/
└── system-prompt.ts              ← Tool 4 description + 3 examples (R129c)
```

### Update regression checklist (extends section above)

11. **Action tool result-draft fail confirm?** → Check `confirm-action.ts` validTypes có type mới chưa. Symptom: card show "Invalid draft type: xxx-draft" sau click Xác nhận.
12. **Diff table render trống?** → Check 3 things:
    - Source: `src/ts/ai/ui/confirmation-card.ts` có if-chain cho type
    - Build: `dist/assets/index-*.js` có string "diff-table" và type literal
    - Live: `curl https://lab-manager-268a6.web.app/assets/index-*.js | grep type` — verify deploy synced
13. **AI không gọi action tool mới?** → Check `system-prompt.ts` có tool description + examples chưa. Symptom: AI generate text giả thay vì gọi tool.
