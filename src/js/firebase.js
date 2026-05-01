/**
 * firebase.js
 * Khởi tạo Firebase, Database và Authentication
 */

import { initializeApp } from 'firebase/app'
import { getDatabase, ref, set, get, push, onValue, remove, update, onDisconnect, serverTimestamp } from 'firebase/database'
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

export {
  ref, set, push, onValue, remove, update, onDisconnect, serverTimestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  browserLocalPersistence, setPersistence,
  createUserWithEmailAndPassword,
}

export const fbSet    = (path, data) => set(ref(db, path), data)
export const fbPush   = (path, data) => push(ref(db, path), data)
export const fbDel    = (path)       => remove(ref(db, path))
export const fbListen = (path, cb)   => onValue(ref(db, path), snap => cb(snap.val()))  // returns unsubscribe fn
export const fbGet    = (path)       => get(ref(db, path)).then(snap => snap.val())

export function logHistory(action, detail, currentUser = 'Unknown') {
  push(ref(db, 'history'), {
    ts: Date.now(),
    user: currentUser,
    action,
    detail,
  })
}
