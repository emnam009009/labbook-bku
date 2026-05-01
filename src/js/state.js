/**
 * state.js
 * Quản lý trạng thái toàn cục của ứng dụng
 */

// ── Auth state ────────────────────────────────────────────────────────────
export const auth = {
  isAdmin:     false,
  currentUser: 'Sinh viên',
}

// ── Local cache (mirror of Firebase data) ────────────────────────────────
export const cache = {
  hydro:       {},
  electrode:   {},
  electrochem: {},
  chemicals:   {},
  members:     {},
  history:     {},
  ink:         {},
  equipment:   {},
  groups:      {},
}

// ── Collections to listen ─────────────────────────────────────────────────
export const COLLECTIONS = [
  'hydro', 'electrode', 'electrochem', 'chemicals',
  'members', 'history', 'ink', 'equipment', 'groups',
]

// ── Helper: convert Firebase object to array ──────────────────────────────
export function vals(obj) {
  if (!obj) return []
  return Object.entries(obj).map(([k, v]) => ({ ...v, _key: k }))
}

// ── Helper: check duplicate code in collection ────────────────────────────
export function isCodeDuplicate(col, code, editKey = null) {
  return vals(cache[col]).some(r => r.code === code && r._key !== editKey)
}
