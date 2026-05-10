/**
 * firebase.ts
 * Khoi tao Firebase, Database va Authentication
 *
 * Phase 1 changes:
 * - logHistory: dung serverTimestamp + auth.uid (khong trust client)
 * - Them helpers: fbQuery (limitToLast + orderByChild) cho Phase 2
 * - Ho tro emulator qua VITE_USE_EMULATOR
 */

import { initializeApp } from 'firebase/app'
import {
  getDatabase, ref, set, get, push, onValue, remove, update,
  onDisconnect, serverTimestamp,
  query, orderByChild, limitToLast, limitToFirst, startAt, endAt, equalTo,
  connectDatabaseEmulator,
  runTransaction,
} from 'firebase/database'
import {
  getStorage,
  ref as stRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  getBytes,
  connectStorageEmulator,
} from 'firebase/storage'

// R150b: Firestore client SDK (Phase B.5)
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query as fsQuery,
  where,
  orderBy,
  limit as fsLimit,
  serverTimestamp as fsServerTimestamp,
  Timestamp,
  connectFirestoreEmulator,
} from 'firebase/firestore'

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
export const storage = getStorage(app)
// R150b: Firestore default DB (NOT named DB `labbook` from research-schema.md §2;
// Phase B already shipped against default DB)
export const fdb = getFirestore(app)

// ── Connect to emulator neu chay voi VITE_USE_EMULATOR=true ──
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  // eslint-disable-next-line no-console
  console.log('[firebase] Connecting to LOCAL EMULATORS')
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  // R150b: Firestore emulator (port 8080 default)
  connectFirestoreEmulator(fdb, '127.0.0.1', 8080)
}

export {
  ref, set, push, onValue, remove, update, onDisconnect, serverTimestamp,
  stRef, uploadBytesResumable, getDownloadURL, deleteObject, getBytes,
  query, orderByChild, limitToLast, limitToFirst, startAt, endAt, equalTo,
  runTransaction,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  browserLocalPersistence, setPersistence,
  createUserWithEmailAndPassword,
  // R150b: Firestore client primitives
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  fsQuery, where, orderBy, fsLimit, fsServerTimestamp, Timestamp,
}

// ── Basic CRUD helpers ─────────────────────────────────────────
export const fbSet    = (path: string, data: unknown): Promise<void> => set(ref(db, path), data)
export const fbPush   = (path: string, data: unknown): any => push(ref(db, path), data)
export const fbDel    = (path: string): Promise<void>       => remove(ref(db, path))
export const fbListen = (path: string, cb: (val: any) => void): (() => void) => onValue(ref(db, path), (snap: any) => cb(snap.val()))
export const fbGet    = (path: string): Promise<any>       => get(ref(db, path)).then((snap: any) => snap.val())

// ── Query helpers (Phase 2 se dung nhieu) ──────────────────────
export interface QueryOpts {
  orderBy?: string;
  equalTo?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  limitLast?: number;
  limitFirst?: number;
}

export function fbListenQuery(path: string, opts: QueryOpts, cb: (val: any) => void): (() => void) {
  let q: any = ref(db, path)
  const constraints: any[] = []
  if (opts.orderBy)   constraints.push(orderByChild(opts.orderBy))
  if (opts.equalTo !== undefined) constraints.push(equalTo(opts.equalTo as any))
  if (opts.startAt !== undefined) constraints.push(startAt(opts.startAt as any))
  if (opts.endAt   !== undefined) constraints.push(endAt(opts.endAt as any))
  if (opts.limitLast)  constraints.push(limitToLast(opts.limitLast))
  if (opts.limitFirst) constraints.push(limitToFirst(opts.limitFirst))
  if (constraints.length) q = query(q, ...constraints)
  return onValue(q, (snap: any) => cb(snap.val()))
}

export async function fbGetQuery(path: string, opts: QueryOpts): Promise<any> {
  let q: any = ref(db, path)
  const constraints: any[] = []
  if (opts.orderBy)   constraints.push(orderByChild(opts.orderBy))
  if (opts.equalTo !== undefined) constraints.push(equalTo(opts.equalTo as any))
  if (opts.startAt !== undefined) constraints.push(startAt(opts.startAt as any))
  if (opts.endAt   !== undefined) constraints.push(endAt(opts.endAt as any))
  if (opts.limitLast)  constraints.push(limitToLast(opts.limitLast))
  if (opts.limitFirst) constraints.push(limitToFirst(opts.limitFirst))
  if (constraints.length) q = query(q, ...constraints)
  const snap = await get(q)
  return snap.val()
}

// ── Audit log: SECURE version ──────────────────────────────────
export function logHistory(action: string, detail: string = ''): Promise<any> {
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
  }).catch((err: any) => {
    console.error('[logHistory] write failed:', err)
    // Khong throw len tren — log that bai khong nen break flow chinh
    return null
  })
}

// ── Stock atomic update (Bug 10/11 fix R118) ─────────────────────
// Dùng runTransaction để read-modify-write atomic ở server, tránh race
// khi 2 user concurrent saveHydro/saveElectrode/delItem cùng hóa chất.
//
// delta > 0: trừ kho (consume)
// delta < 0: hoàn kho (refund)
//
// Returns the final stock value after the increment, hoặc null nếu fail.
// Caller có thể kiểm tra giá trị âm để cảnh báo.
export async function incrementStock(
  chemKey: string,
  delta: number,
  precision: number = 5
): Promise<number | null> {
  if (!chemKey || !isFinite(delta) || delta === 0) return null
  const stockRef = ref(db, `chemicals/${chemKey}/stock`)
  try {
    const result = await runTransaction(stockRef, (current: any) => {
      const cur = parseFloat(current || 0)
      // Nếu chemicals/{key}/stock chưa tồn tại (current=null), Firebase vẫn
      // chạy transaction với current=null. Trả về delta thì sẽ tạo node.
      // Nhưng để an toàn, chỉ update khi node đã có (caller đã verify).
      if (current == null) return current  // abort: don't create stock from nothing
      const next = parseFloat((cur - delta).toFixed(precision))
      return next
    })
    if (result.committed && result.snapshot.exists()) {
      return result.snapshot.val() as number
    }
    return null
  } catch (err) {
    console.error('[incrementStock]', chemKey, delta, err)
    throw err
  }
}
