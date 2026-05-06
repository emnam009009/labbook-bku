/**
 * state.ts
 * Quản lý trạng thái toàn cục của ứng dụng
 *
 * LƯU Ý: file này hiện không được import từ module nào — codebase truy cập
 * cache/currentAuth qua window.cache / window.currentAuth (gắn trong main.js).
 * Giữ lại để backward-compat và làm nguồn type definition.
 */

// ── Auth state (legacy) ────────────────────────────────────────────────────
export const auth = {
  isAdmin:     false,
  currentUser: 'Sinh viên',
}

// ── Local cache (mirror of Firebase data) ────────────────────────────────
export interface AppCacheState {
  hydro:       Record<string, any>;
  electrode:   Record<string, any>;
  electrochem: Record<string, any>;
  chemicals:   Record<string, any>;
  members:     Record<string, any>;
  history:     Record<string, any>;
  ink:         Record<string, any>;
  equipment:   Record<string, any>;
  groups:      Record<string, any>;
}

export const cache: AppCacheState = {
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
] as const

export type CollectionName = typeof COLLECTIONS[number]

// ── Helper: convert Firebase object to array ──────────────────────────────
// Tuong tu vals() trong utils/format.ts - giu lai de backward-compat
export function vals<T extends Record<string, unknown> = Record<string, unknown>>(
  obj: Record<string, T> | null | undefined
): Array<T & { _key: string }> {
  if (!obj) return []
  return Object.entries(obj).map(([k, v]) => ({ ...(v as T), _key: k }))
}

// ── Helper: check duplicate code in collection ────────────────────────────
export function isCodeDuplicate(
  col: CollectionName,
  code: string,
  editKey: string | null = null
): boolean {
  return vals<{ code?: string }>(cache[col] as Record<string, { code?: string }>)
    .some(r => r.code === code && r._key !== editKey)
}
