import {
  auth, db,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword,
  ref, onValue, update, push,
} from './firebase.js'
import { browserLocalPersistence, setPersistence, updateProfile } from 'firebase/auth'
import type { User } from 'firebase/auth'

// ── Type for currentAuth ────────────────────────────────────────────────
export interface CurrentAuthState {
  user: User | null;
  uid: string | null;
  email: string | null;
  displayName: string | null;
  role: string;
  isAdmin: boolean;
  isMember: boolean;
  isSuperAdmin: boolean;
}

// ── State ───────────────────────────────────────────────────────────────
// isAdmin     = role thuộc nhóm có quyền quản trị (admin OR superadmin)
// isMember    = role thuộc nhóm có quyền ghi data (member OR admin OR superadmin)
// isSuperAdmin = role superadmin (quyền cao nhất, được phép gán/thu hồi role superadmin khác)
export const currentAuth: CurrentAuthState = {
  user: null, uid: null, email: null, displayName: null,
  role: 'viewer',
  isAdmin: false,
  isMember: false,
  isSuperAdmin: false,
}

// ── Role helpers (export để các module khác dùng nhất quán) ─────────────
export const isAdminRole       = (role: string | null | undefined): boolean => role === 'admin' || role === 'superadmin'
export const isMemberRole      = (role: string | null | undefined): boolean => role === 'member' || role === 'admin' || role === 'superadmin'
export const isSuperAdminRole  = (role: string | null | undefined): boolean => role === 'superadmin'
export const isActiveRole      = (role: string | null | undefined): boolean => !!role && role !== 'pending' && role !== 'rejected'

// ── Internal flags (khai báo trước register/initAuth để tránh TDZ) ──────
let _isRegistering = false
export function setRegistering(v: boolean): void { _isRegistering = v }

// ── Đăng nhập ───────────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<User> {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) throw new Error('Email không hợp lệ')
  const ok = email.endsWith('@hcmut.edu.vn') || email.endsWith('@gmail.com')
  if (!ok) throw new Error('Chỉ chấp nhận email @hcmut.edu.vn hoặc @gmail.com')
  await setPersistence(auth, browserLocalPersistence)
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

// ── Đăng ký ─────────────────────────────────────────────────────────────
export async function register(email: string, password: string, fullName: string): Promise<User> {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) throw new Error('Email không hợp lệ')
  const ok = email.endsWith('@hcmut.edu.vn') || email.endsWith('@gmail.com')
  if (!ok) throw new Error('Chỉ chấp nhận email @hcmut.edu.vn hoặc @gmail.com')
  if (!fullName || fullName.trim().length < 2) throw new Error('Vui lòng nhập họ tên đầy đủ')
  if (password.length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự')

  _isRegistering = true
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(cred.user, { displayName: fullName.trim() })

  await update(ref(db, 'users/' + cred.user.uid), {
    email,
    displayName: fullName.trim(),
    role: 'pending',
    createdAt: Date.now(),
  })

  // Đăng xuất ngay để tránh trigger onLogin
  _isRegistering = false
  await signOut(auth)
  return cred.user
}

// ── Đăng xuất ───────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  await signOut(auth)
  Object.assign(currentAuth, {
    user: null, uid: null, email: null, displayName: null, role: 'viewer',
    isAdmin: false, isMember: false, isSuperAdmin: false,
  })
  // Round 54 fix #5: stop role sidebar watcher (cleared by main.js IIFE)
  if (typeof window.stopRoleSidebarWatch === 'function') {
    window.stopRoleSidebarWatch()
  }
}

// ── Load role từ Firebase (realtime) ────────────────────────────────────
export type RoleCallback = (role: string) => void

export function loadUserRole(uid: string, callback?: RoleCallback): void {
  onValue(ref(db, 'users/' + uid + '/role'), async (snap: any) => {
    const role = snap.val() || 'viewer'
    currentAuth.role         = role
    currentAuth.isAdmin      = isAdminRole(role)
    currentAuth.isMember     = isMemberRole(role)
    currentAuth.isSuperAdmin = isSuperAdminRole(role)
    if (callback) callback(role)
  })
}

// ── Init Auth ───────────────────────────────────────────────────────────
export type LoginCallback = (user: User, role: string) => void
export type LogoutCallback = () => void

export function initAuth(onLogin?: LoginCallback, onLogout?: LogoutCallback): void {
  onAuthStateChanged(auth, (user: User | null) => {
    if (_isRegistering) return
    if (user) {
      currentAuth.user        = user
      currentAuth.uid         = user.uid
      currentAuth.email       = user.email
      window.__currentUserEmail = user.email
      currentAuth.displayName = user.displayName || (user.email ? user.email.split('@')[0] : null)
      // window.__superAdminUid sẽ được set trong loadUserRole/applyRoleUI
      // dựa trên role thay vì hardcode email
      let _firstCall = true
      loadUserRole(user.uid, role => {
        // Nếu role này là superadmin, cập nhật ref
        if (isSuperAdminRole(role)) {
          window.__superAdminUid = user.uid
        }
        if (_firstCall) {
          _firstCall = false
          if (onLogin) onLogin(user, role)
        } else {
          // Role thay đổi realtime - reload để áp dụng quyền mới
          if (onLogin) onLogin(user, role)
        }
      })
    } else {
      if (onLogout) onLogout()
    }
  })
}

// ── Apply UI theo role ──────────────────────────────────────────────────
export function applyRoleUI(role: string): void {
  const isAdmin  = isAdminRole(role)
  const isMember = isMemberRole(role)
  const isSuper  = isSuperAdminRole(role)

  document.querySelectorAll<HTMLElement>('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none'
  })
  document.querySelectorAll<HTMLElement>('.member-only').forEach(el => {
    el.style.display = isMember ? 'flex' : 'none'
  })
  // Viewer mode
  if (role === 'viewer') {
    document.body.classList.add('viewer-mode')
    // Round 13: nếu đang ở page-chat khi bị đổi xuống viewer → chuyển về dashboard + cleanup
    const chatPage = document.getElementById('page-chat')
    if (chatPage && chatPage.classList.contains('active')) {
      try { window.cleanupChat && window.cleanupChat() } catch(e) {}
      const dashItem = document.querySelector<HTMLElement>('.sidebar-item[onclick*="dashboard"]')
      if (typeof window.showPage === 'function') {
        window.showPage('dashboard', dashItem || undefined)
      }
    }
  } else {
    document.body.classList.remove('viewer-mode')
  }
  document.querySelectorAll<HTMLElement>('.chem-admin-btn, .eq-admin-btn').forEach(btn => {
    btn.style.display = isAdmin ? 'inline-flex' : 'none'
  })

  const badge = document.getElementById('admin-badge')
  if (badge) {
    badge.style.display = 'none'
    badge.classList.remove('show')

    if (isSuper) {
      // Superadmin: gradient cam đậm (#f59e0b → #d97706), chữ trắng, icon ngôi sao
      badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="margin-right:4px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>Superadmin'
      badge.style.cssText = 'display:inline-flex;align-items:center;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border:none;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-top:6px;cursor:pointer;gap:5px'
    } else if (role === 'admin') {
      // Admin: badge-info style (xanh nhạt, icon ngôi sao outline)
      badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>Admin'
      badge.style.cssText = 'display:inline-flex;align-items:center;background:rgba(59,130,246,0.12);color:#1e40af;border:1px solid rgba(59,130,246,0.25);font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;margin-top:6px;cursor:pointer;gap:4px'
    } else if (role === 'member') {
      // Member: badge-success style (teal nhạt, icon người)
      badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>Member'
      badge.style.cssText = 'display:inline-flex;align-items:center;background:rgba(var(--teal-rgb), 0.12);color:var(--teal);border:1px solid rgba(var(--teal-rgb), 0.25);font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;margin-top:6px;cursor:pointer;gap:4px'
    } else if (role === 'viewer') {
      // Viewer: badge-gray style (icon mắt)
      badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Viewer'
      badge.style.cssText = 'display:inline-flex;align-items:center;background:rgba(148,163,184,0.18);color:#475569;border:1px solid rgba(148,163,184,0.3);font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;margin-top:6px;cursor:default;gap:4px'
    }
    // role === 'pending' or 'rejected': giữ display:none (đã reset ở trên)
  }
  const ud = document.getElementById('user-display')
  if (ud) ud.textContent = currentAuth.displayName || currentAuth.email
}

export async function updateDisplayName(newName: string): Promise<string> {
  if (!auth.currentUser) throw new Error('Chưa đăng nhập')
  if (!newName || newName.trim().length < 2) throw new Error('Tên phải có ít nhất 2 ký tự')
  const name = newName.trim()
  await updateProfile(auth.currentUser, { displayName: name })
  currentAuth.displayName = name
  window.__currentUserEmail = auth.currentUser.email
  // Sync vào Realtime DB users/{uid}
  await update(ref(db, 'users/' + auth.currentUser.uid), { displayName: name })
  return name
}
