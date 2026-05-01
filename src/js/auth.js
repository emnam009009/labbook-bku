import {
  auth, db,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword,
  ref, onValue, update, push,
} from './firebase.js'
import { browserLocalPersistence, setPersistence, updateProfile } from 'firebase/auth'

export const currentAuth = {
  user: null, uid: null, email: null, displayName: null,
  role: 'viewer', isAdmin: false, isMember: false,
}

// ── Đăng nhập ─────────────────────────────────────────────────────────────
export async function login(email, password) {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) throw new Error('Email không hợp lệ')
  const ok = email.endsWith('@hcmut.edu.vn') || email.endsWith('@gmail.com')
  if (!ok) throw new Error('Chỉ chấp nhận email @hcmut.edu.vn hoặc @gmail.com')
  await setPersistence(auth, browserLocalPersistence)
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

// ── Đăng ký ───────────────────────────────────────────────────────────────
export async function register(email, password, fullName) {
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

// ── Đăng xuất ─────────────────────────────────────────────────────────────
export async function logout() {
  await signOut(auth)
  Object.assign(currentAuth, { user:null, uid:null, email:null, role:'viewer', isAdmin:false, isMember:false })
}

// ── Load role từ Firebase ─────────────────────────────────────────────────
export function loadUserRole(uid, callback) {
  onValue(ref(db, 'users/' + uid + '/role'), async snap => {
    const role = snap.val() || 'viewer'
    currentAuth.role     = role
    currentAuth.isAdmin  = role === 'admin'
    currentAuth.isMember = role === 'member' || role === 'admin'
    if (callback) callback(role)
  })
}

// ── Init Auth ─────────────────────────────────────────────────────────────
let _isRegistering = false
export function setRegistering(v) { _isRegistering = v }

export function initAuth(onLogin, onLogout) {
  onAuthStateChanged(auth, user => {
    if (_isRegistering) return
    if (user) {
      currentAuth.user        = user
      currentAuth.uid         = user.uid
      currentAuth.email       = user.email
      window.__currentUserEmail = user.email
      if (user.email === 'nvhn.7202@gmail.com') window.__superAdminUid = user.uid
      currentAuth.displayName = user.displayName || user.email.split('@')[0]
      let _firstCall = true
      loadUserRole(user.uid, role => {
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

// ── Apply UI theo role ────────────────────────────────────────────────────
export function applyRoleUI(role) {
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = role === 'admin' ? 'flex' : 'none'
  })
  document.querySelectorAll('.member-only').forEach(el => {
    el.style.display = (role === 'admin' || role === 'member') ? 'flex' : 'none'
  })
  // Viewer mode
  if (role === 'viewer') {
    document.body.classList.add('viewer-mode')
    // Round 13: nếu đang ở page-chat khi bị đổi xuống viewer → chuyển về dashboard + cleanup
    const chatPage = document.getElementById('page-chat')
    if (chatPage && chatPage.classList.contains('active')) {
      try { window.cleanupChat && window.cleanupChat() } catch(e) {}
      const dashItem = document.querySelector('.sidebar-item[onclick*="dashboard"]')
      if (typeof window.showPage === 'function') {
        window.showPage('dashboard', dashItem)
      }
    }
  } else {
    document.body.classList.remove('viewer-mode')
  }
  document.querySelectorAll('.chem-admin-btn, .eq-admin-btn').forEach(btn => {
    btn.style.display = role === 'admin' ? 'inline-flex' : 'none'
  })
  const badge = document.getElementById('admin-badge')
  if (badge) {
    const isSuper = currentAuth.email === 'nvhn.7202@gmail.com';
    // Reset display first - sẽ show lại nếu role có badge tương ứng
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
  // Hiện role badge cạnh tên

}

export async function updateDisplayName(newName) {
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
