/**
 * services/history-log.js
 *
 * Phase 2A — Bugfix: re-export từ firebase.js để conform với rules mới.
 *
 * logHistory được centralize trong firebase.js (Phase 1) với:
 *  - ts: Date.now() (number)
 *  - uid: từ auth.currentUser
 *  - email: từ auth.currentUser
 *  - safeAction/safeDetail trim length
 *
 * Giữ file này (thay vì xóa) để 5 files import vẫn work
 * (duplicate-delete, group-lock-mgmt, save-handlers, main).
 */
export { logHistory } from '../firebase.js'
