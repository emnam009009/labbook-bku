/**
 * utils/auth-helpers.js
 * Helpers liên quan đến currentAuth + cache (membership, permissions)
 *
 * Lưu ý:
 *  - Đọc currentAuth qua window.currentAuth (được auth.js gắn trong runtime)
 *  - Đọc cache qua window.cache (được main.js gắn trong runtime)
 *  → Tránh circular import vì auth.js / state.js / main.js đều có thể import file này.
 */

// ── Tên hiển thị của user hiện tại ──────────────────────
// Ưu tiên: member.name (nếu có map uid trong cache.members) → displayName → email
export function getPersonName() {
  const auth = window.currentAuth;
  const cache = window.cache;
  if (!auth || !auth.uid) {
    return (auth && (auth.displayName || auth.email)) || '';
  }
  if (cache && cache.members) {
    const member = Object.values(cache.members).find(m => m && m.uid === auth.uid);
    if (member && member.name) return member.name;
  }
  return auth.displayName || auth.email || '';
}

// ── Phân quyền xóa ──────────────────────────────────────
// Admin được xóa hết. Member chỉ xóa được record của chính mình.
export function canDelete(r) {
  const auth = window.currentAuth;
  if (!r || !auth) return false;
  if (auth.isAdmin) return true;
  if (!auth.isMember) return false;
  const myName = getPersonName();
  return r.person === myName
      || r.createdBy === auth.uid
      || r.createdBy === auth.email;
}

// ── Phân quyền sửa ──────────────────────────────────────
// Logic legacy: kiểm tra nhiều field (uid, createdBy, person, createdByName)
// vì dữ liệu cũ lưu owner theo nhiều dạng khác nhau.
export function canEdit(record) {
  const auth = window.currentAuth;
  if (!record) return true;
  if (!auth) return false;
  if (auth.isAdmin) return true;
  if (!auth.uid) return false;
  if (record.uid && record.uid === auth.uid) return true;
  const me = auth.displayName || auth.email || '';
  return record.createdBy === me
      || record.person === me
      || record.createdByName === me;
}

// ── Sync biến global cũ (backward-compat) ───────────────
// Một số chỗ trong codebase legacy đọc window.isAdmin / window.currentUser.
// Hàm này được gọi sau mỗi lần auth state thay đổi.
export function syncAuthState() {
  const auth = window.currentAuth;
  if (!auth) return;
  window.isAdmin = !!auth.isAdmin;
  window.__currentUserUid = auth.uid || '';
  window.currentUser = auth.displayName || auth.email || 'Khách';
}
