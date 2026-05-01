/**
 * services/history-log.js
 * Ghi lại lịch sử thao tác (audit log) vào Firebase Realtime DB tại path 'history'.
 *
 * Mỗi entry gồm: ts (ISO time), user (tên người), action (tên hành động), detail (chi tiết).
 */

import { db, ref, push } from '../firebase.js'

export function logHistory(action, detail) {
  // Đọc currentUser từ runtime (được syncAuthState gán trên window)
  const user = window.currentUser || 'Khách';
  push(ref(db, 'history'), {
    ts: new Date().toISOString(),
    user,
    action,
    detail,
  });
}
