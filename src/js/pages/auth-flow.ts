/**
 * pages/auth-flow.ts
 * Auth UI flow handlers: login, logout, register, toggle password, switch tab
 */

import { login, logout, register } from '../auth.js'
import { stopListeners } from '../services/listeners.js'
import { stopPresence } from '../services/presence.js'

// ═══════════════════════════════════════════════════════════
// Login handler
// ═══════════════════════════════════════════════════════════
export async function doLogin(): Promise<void> {
  const email = (document.getElementById('login-email') as HTMLInputElement).value.trim();
  const password = (document.getElementById('login-password') as HTMLInputElement).value;
  const errEl = document.getElementById('login-error') as HTMLElement;
  const btn = document.getElementById('login-btn') as HTMLButtonElement;

  errEl.style.display = 'none';
  btn.textContent = 'Đang đăng nhập...';
  btn.disabled = true;

  try {
    await login(email, password);
    // onAuthStateChanged se tu xu ly tiep (qua initAuth callback o main.js)
  } catch (e: any) {
    let msg = 'Đăng nhập thất bại';
    if (e.message && e.message.includes('@hcmut.edu.vn')) msg = e.message;
    else if (e.code === 'auth/user-not-found')      msg = 'Email không tồn tại trong hệ thống';
    else if (e.code === 'auth/wrong-password')      msg = 'Mật khẩu không đúng';
    else if (e.code === 'auth/invalid-email')       msg = 'Email không hợp lệ';
    else if (e.code === 'auth/too-many-requests')   msg = 'Đăng nhập sai quá nhiều lần, thử lại sau';
    else if (e.code === 'auth/invalid-credential')  msg = 'Email hoặc mật khẩu không đúng';
    errEl.textContent = msg;
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Đăng nhập';
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// Logout handler
// ═══════════════════════════════════════════════════════════
export async function doLogout(): Promise<void> {
  if (!confirm('Bạn có chắc muốn đăng xuất?')) return;
  await stopPresence();
  stopListeners();
  // An FAB chat ngay khi logout
  const fab = document.getElementById('chat-fab');
  if (fab) fab.style.display = 'none';
  await logout();
  // onAuthStateChanged se tu xu ly phan cleanup UI tiep
}

// ═══════════════════════════════════════════════════════════
// Toggle password visibility (login form)
// ═══════════════════════════════════════════════════════════
export function togglePasswordVisibility(): void {
  const input = document.getElementById('login-password') as HTMLInputElement | null;
  const eye = document.getElementById('pw-eye');
  if (!input || !eye) return;
  if (input.type === 'password') {
    input.type = 'text';
    eye.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    input.type = 'password';
    eye.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}

// ═══════════════════════════════════════════════════════════
// Switch tab login <-> register
// ═══════════════════════════════════════════════════════════
export function switchAuthTab(tab: string): void {
  const loginForm = document.getElementById('auth-login-form') as HTMLElement;
  const regForm = document.getElementById('auth-register-form') as HTMLElement;
  const loginBtn = document.getElementById('tab-login-btn') as HTMLElement;
  const regBtn = document.getElementById('tab-register-btn') as HTMLElement;
  const base = "flex:1;padding:9px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif";

  if (tab === 'login') {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
    loginBtn.style.cssText = base + ';background:var(--teal);color:white';
    regBtn.style.cssText = base + ';background:transparent;color:#94a3b8';
  } else {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    loginBtn.style.cssText = base + ';background:transparent;color:#94a3b8';
    regBtn.style.cssText = base + ';background:var(--teal);color:white';
  }
}

// ═══════════════════════════════════════════════════════════
// Register handler
// ═══════════════════════════════════════════════════════════
export async function doRegister(): Promise<void> {
  const name = (document.getElementById('reg-name') as HTMLInputElement).value.trim();
  const email = (document.getElementById('reg-email') as HTMLInputElement).value.trim();
  const password = (document.getElementById('reg-password') as HTMLInputElement).value;
  const errEl = document.getElementById('reg-error') as HTMLElement;
  const sucEl = document.getElementById('reg-success') as HTMLElement;
  const btn = document.getElementById('reg-btn') as HTMLButtonElement;

  errEl.style.display = 'none';
  sucEl.style.display = 'none';
  btn.textContent = 'Đang đăng ký...';

  // Validate ten: it nhat 2 tu, moi tu viet hoa chu cai dau (vd: "Nguyen Van Linh")
  if (!name) {
    errEl.textContent = 'Vui lòng nhập họ tên!';
    errEl.style.display = 'block';
    btn.textContent = 'Đăng ký';
    btn.disabled = false;
    return;
  }
  const words = name.split(' ').filter(w => w.length > 0);
  const validName = words.length >= 2 && words.every(w => w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase());
  if (!validName) {
    errEl.textContent = 'Họ tên phải có ít nhất 2 từ, viết hoa chữ cái đầu mỗi từ (VD: Nguyễn Văn Linh)';
    errEl.style.display = 'block';
    btn.textContent = 'Đăng ký';
    btn.disabled = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Đang đăng ký...';

  register(email, password, name).then(() => {
    // Thanh cong - hien thong bao
    sucEl.textContent = 'Đăng ký thành công! Tài khoản đang chờ Admin duyệt.';
    sucEl.style.display = 'block';
    (document.getElementById('reg-name') as HTMLInputElement).value = '';
    (document.getElementById('reg-email') as HTMLInputElement).value = '';
    (document.getElementById('reg-password') as HTMLInputElement).value = '';
    btn.textContent = 'Đăng ký';
    btn.disabled = false;
  }).catch((e: any) => {
    let msg = 'Đăng ký thất bại. Vui lòng thử lại.';
    if (e.code === 'auth/email-already-in-use') msg = 'Email này đã được đăng ký';
    else if (e.code === 'auth/weak-password')   msg = 'Mật khẩu quá yếu, tối thiểu 6 ký tự';
    else if (e.code === 'auth/invalid-email')   msg = 'Email không hợp lệ';
    else if (e.message) msg = e.message;
    sucEl.style.display = 'none';
    errEl.textContent = msg;
    errEl.style.display = 'block';
    btn.textContent = 'Đăng ký';
    btn.disabled = false;
  });
}
