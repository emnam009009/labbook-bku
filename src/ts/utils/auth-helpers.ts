/**
 * utils/auth-helpers.ts
 * Helpers liên quan đến currentAuth + cache (membership, permissions)
 *
 * Lưu ý:
 *  - Đọc currentAuth qua window.currentAuth (được auth.js gắn trong runtime)
 *  - Đọc cache qua window.cache (được main.js gắn trong runtime)
 *  → Tránh circular import vì auth.js / state.js / main.js đều có thể import file này.
 */

// Record có thể có owner — dùng cho canDelete/canEdit
interface OwnedRecord {
  uid?: string;
  person?: string;
  createdBy?: string;
  createdByName?: string;
  [key: string]: unknown;
}

// ── Tên hiển thị của user hiện tại ──────────────────────
// Ưu tiên: member.name (nếu có map uid trong cache.members) → displayName → email
export function getPersonName(): string {
  const auth = window.currentAuth;
  const cache = window.cache;
  if (!auth || !auth.uid) {
    return (auth && ((auth as any).displayName || auth.email)) || '';
  }
  if (cache && cache.members) {
    const member = Object.values(cache.members).find(
      (m: any) => m && m.uid === auth.uid
    );
    if (member && (member as any).name) return (member as any).name;
  }
  return (auth as any).displayName || auth.email || '';
}

// ── Phân quyền xóa ──────────────────────────────────────
// Admin được xóa hết. Member chỉ xóa được record của chính mình.
export function canDelete(r: OwnedRecord | null | undefined): boolean {
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
export function canEdit(record: OwnedRecord | null | undefined): boolean {
  const auth = window.currentAuth;
  if (!record) return true;
  if (!auth) return false;
  if (auth.isAdmin) return true;
  if (!auth.uid) return false;
  if (record.uid && record.uid === auth.uid) return true;
  const me = (auth as any).displayName || auth.email || '';
  return record.createdBy === me
      || record.person === me
      || record.createdByName === me;
}

// ── Sync biến global cũ (backward-compat) ───────────────
// Một số chỗ trong codebase legacy đọc window.isAdmin / window.currentUser.
// Hàm này được gọi sau mỗi lần auth state thay đổi.
export function syncAuthState(): void {
  const auth = window.currentAuth;
  if (!auth) return;
  (window as any).isAdmin = !!auth.isAdmin;
  (window as any).__currentUserUid = auth.uid || '';
  (window as any).currentUser = (auth as any).displayName || auth.email || 'Khách';
}
