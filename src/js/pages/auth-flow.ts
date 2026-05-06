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
  btn.textContent = 'Dang dang nhap...';
  btn.disabled = true;

  try {
    await login(email, password);
    // onAuthStateChanged se tu xu ly tiep (qua initAuth callback o main.js)
  } catch (e: any) {
    let msg = 'Dang nhap that bai';
    if (e.message && e.message.includes('@hcmut.edu.vn')) msg = e.message;
    else if (e.code === 'auth/user-not-found')      msg = 'Email khong ton tai trong he thong';
    else if (e.code === 'auth/wrong-password')      msg = 'Mat khau khong dung';
    else if (e.code === 'auth/invalid-email')       msg = 'Email khong hop le';
    else if (e.code === 'auth/too-many-requests')   msg = 'Dang nhap sai qua nhieu lan, thu lai sau';
    else if (e.code === 'auth/invalid-credential')  msg = 'Email hoac mat khau khong dung';
    errEl.textContent = msg;
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Dang nhap';
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// Logout handler
// ═══════════════════════════════════════════════════════════
export async function doLogout(): Promise<void> {
  if (!confirm('Ban co chac muon dang xuat?')) return;
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
  btn.textContent = 'Dang dang ky...';

  // Validate ten: it nhat 2 tu, moi tu viet hoa chu cai dau (vd: "Nguyen Van Linh")
  if (!name) {
    errEl.textContent = 'Vui long nhap ho ten!';
    errEl.style.display = 'block';
    btn.textContent = 'Dang ky';
    btn.disabled = false;
    return;
  }
  const words = name.split(' ').filter(w => w.length > 0);
  const validName = words.length >= 2 && words.every(w => w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase());
  if (!validName) {
    errEl.textContent = 'Ho ten phai co it nhat 2 tu, viet hoa chu cai dau moi tu (VD: Nguyen Van Linh)';
    errEl.style.display = 'block';
    btn.textContent = 'Dang ky';
    btn.disabled = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Dang dang ky...';

  register(email, password, name).then(() => {
    // Thanh cong - hien thong bao
    sucEl.textContent = 'Dang ky thanh cong! Tai khoan dang cho Admin duyet.';
    sucEl.style.display = 'block';
    (document.getElementById('reg-name') as HTMLInputElement).value = '';
    (document.getElementById('reg-email') as HTMLInputElement).value = '';
    (document.getElementById('reg-password') as HTMLInputElement).value = '';
    btn.textContent = 'Dang ky';
    btn.disabled = false;
  }).catch((e: any) => {
    let msg = 'Dang ky that bai. Vui long thu lai.';
    if (e.code === 'auth/email-already-in-use') msg = 'Email nay da duoc dang ky';
    else if (e.code === 'auth/weak-password')   msg = 'Mat khau qua yeu, toi thieu 6 ky tu';
    else if (e.code === 'auth/invalid-email')   msg = 'Email khong hop le';
    else if (e.message) msg = e.message;
    sucEl.style.display = 'none';
    errEl.textContent = msg;
    errEl.style.display = 'block';
    btn.textContent = 'Dang ky';
    btn.disabled = false;
  });
}
