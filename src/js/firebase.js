/**
 * firebase.js
 * Khởi tạo Firebase, Database và Authentication
 *
 * Phase 1 changes:
 * - logHistory: dùng serverTimestamp + auth.uid (không trust client)
 * - Thêm helpers: fbQuery (limitToLast + orderByChild) cho Phase 2
 * - Hỗ trợ emulator qua VITE_USE_EMULATOR
 */

import { initializeApp } from 'firebase/app'
import {
  getDatabase, ref, set, get, push, onValue, remove, update,
  onDisconnect, serverTimestamp,
  query, orderByChild, limitToLast, limitToFirst, startAt, endAt, equalTo,
  connectDatabaseEmulator,
} from 'firebase/database'
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  createUserWithEmailAndPassword,
  browserLocalPersistence,
  setPersistence,
  connectAuthEmulator,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app  = initializeApp(firebaseConfig)
export const db   = getDatabase(app)
export const auth = getAuth(app)

// ── Connect to emulator nếu chạy với VITE_USE_EMULATOR=true ──
// Chỉ dùng cho dev local, không ảnh hưởng production build
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  // eslint-disable-next-line no-console
  console.log('[firebase] Connecting to LOCAL EMULATORS')
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
}

export {
  ref, set, push, onValue, remove, update, onDisconnect, serverTimestamp,
  query, orderByChild, limitToLast, limitToFirst, startAt, endAt, equalTo,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  browserLocalPersistence, setPersistence,
  createUserWithEmailAndPassword,
}

// ── Basic CRUD helpers ─────────────────────────────────────────
export const fbSet    = (path, data) => set(ref(db, path), data)
export const fbPush   = (path, data) => push(ref(db, path), data)
export const fbDel    = (path)       => remove(ref(db, path))
export const fbListen = (path, cb)   => onValue(ref(db, path), snap => cb(snap.val()))
export const fbGet    = (path)       => get(ref(db, path)).then(snap => snap.val())

// ── Query helpers (Phase 2 sẽ dùng nhiều) ──────────────────────
// fbListenQuery(path, {orderBy, limitLast, equalTo}, cb)
//   ví dụ: fbListenQuery('hydro', {orderBy: 'createdAt', limitLast: 200}, cb)
export function fbListenQuery(path, opts, cb) {
  let q = ref(db, path)
  const constraints = []
  if (opts.orderBy)   constraints.push(orderByChild(opts.orderBy))
  if (opts.equalTo !== undefined) constraints.push(equalTo(opts.equalTo))
  if (opts.startAt !== undefined) constraints.push(startAt(opts.startAt))
  if (opts.endAt   !== undefined) constraints.push(endAt(opts.endAt))
  if (opts.limitLast)  constraints.push(limitToLast(opts.limitLast))
  if (opts.limitFirst) constraints.push(limitToFirst(opts.limitFirst))
  if (constraints.length) q = query(q, ...constraints)
  return onValue(q, snap => cb(snap.val()))
}

export async function fbGetQuery(path, opts) {
  let q = ref(db, path)
  const constraints = []
  if (opts.orderBy)   constraints.push(orderByChild(opts.orderBy))
  if (opts.equalTo !== undefined) constraints.push(equalTo(opts.equalTo))
  if (opts.startAt !== undefined) constraints.push(startAt(opts.startAt))
  if (opts.endAt   !== undefined) constraints.push(endAt(opts.endAt))
  if (opts.limitLast)  constraints.push(limitToLast(opts.limitLast))
  if (opts.limitFirst) constraints.push(limitToFirst(opts.limitFirst))
  if (constraints.length) q = query(q, ...constraints)
  const snap = await get(q)
  return snap.val()
}

// ── Audit log: SECURE version ──────────────────────────────────
// SECURITY: ts và uid được xác thực bởi rules (không trust client value).
// Client chỉ được truyền action + detail; uid/email lấy từ auth.currentUser
// còn ts dùng Date.now() và rules check ts <= now && ts >= now - 60s.
//
// Lưu ý: Ta vẫn truyền ts: Date.now() (không phải serverTimestamp) vì
// serverTimestamp() trả về object {.sv: 'timestamp'} sẽ bị rule
// `newData.child('ts').isNumber()` reject TẠI THỜI ĐIỂM client gửi.
// Workaround chuẩn của Firebase: gửi Date.now(), rule check khoảng ±60s.
export function logHistory(action, detail = '') {
  const u = auth.currentUser
  if (!u) {
    console.warn('[logHistory] no auth.currentUser, skip')
    return Promise.resolve(null)
  }

  const safeAction = String(action || '').slice(0, 200)
  const safeDetail = String(detail || '').slice(0, 2000)

  return push(ref(db, 'history'), {
    ts: Date.now(),
    uid: u.uid,
    email: u.email || '',
    action: safeAction,
    detail: safeDetail,
  }).catch(err => {
    console.error('[logHistory] write failed:', err)
    // Không throw lên trên — log thất bại không nên break flow chính
    return null
  })
}
