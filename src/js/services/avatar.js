/**
 * services/avatar.js
 * Avatar UI: toggle menu, change avatar (upload + resize), reset, update UI from currentAuth
 *
 * Phụ thuộc:
 *  - db, ref, update, onValue từ firebase.js (đã được import vào main.js — re-import ở đây)
 *  - currentAuth qua window.currentAuth
 *  - showToast qua window.showToast
 *
 * Đặc trưng:
 *  - changeAvatar: resize ảnh về 100×100 JPEG quality 60 → ~5-10KB → lưu base64 vào users/<uid>/avatar
 *  - updateAvatarUI: lấy initial = chữ cái đầu của TỪ CUỐI tên (ưu tiên Việt Nam: "Nguyễn Văn Linh" → "L")
 *  - DOM event listener "click outside" để đóng menu — gắn 1 lần ở module init
 *  - onValue chỉ load 1 lần ({onlyOnce:true}) tránh listener leak
 */

import { db, ref, update, onValue } from '../firebase.js'

// ── Toggle hiển thị menu avatar ───────────────────────────
export function toggleAvatarMenu() {
  const menu = document.getElementById('avatar-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// ── Click outside menu → đóng menu (gắn 1 lần ở init) ─────
let _outsideHandlerAttached = false;
function attachOutsideHandler() {
  if (_outsideHandlerAttached) return;
  _outsideHandlerAttached = true;
  document.addEventListener('click', function(e) {
    const wrapper = document.getElementById('avatar-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      const menu = document.getElementById('avatar-menu');
      if (menu) menu.style.display = 'none';
    }
  });
}
attachOutsideHandler();

// ── Change avatar: resize 100×100 + lưu base64 vào DB ─────
export async function changeAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  const currentAuth = window.currentAuth || {};
  const showToast = window.showToast || ((msg) => console.log(msg));

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      canvas.getContext('2d').drawImage(img, 0, 0, 100, 100);
      const base64 = canvas.toDataURL('image/jpeg', 0.6);
      if (window.devLog) window.devLog('Avatar size:', Math.round(base64.length / 1024), 'KB');

      const avatarImg = document.getElementById('avatar-img');
      const initials = document.getElementById('avatar-initials');
      if (avatarImg) {
        avatarImg.src = base64;
        avatarImg.style.display = 'block';
      }
      if (initials) initials.style.display = 'none';

      if (currentAuth.uid) {
        try {
          await update(ref(db, 'users/' + currentAuth.uid), { avatar: base64 });
          showToast('Đã cập nhật ảnh đại diện!', 'success');
        } catch (err) {
          showToast('Lỗi lưu ảnh: ' + err.message, 'danger');
          console.error(err);
        }
      } else {
        showToast('Chưa đăng nhập!', 'danger');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Reset avatar về initials ─────────────────────────────
export async function resetAvatar() {
  const currentAuth = window.currentAuth || {};
  const showToast = window.showToast || ((msg) => console.log(msg));

  if (currentAuth.uid) {
    await update(ref(db, 'users/' + currentAuth.uid), { avatar: null });
    const img = document.getElementById('avatar-img');
    const initials = document.getElementById('avatar-initials');
    if (img) {
      img.src = '';
      img.style.display = 'none';
    }
    if (initials) initials.style.display = 'flex';
    const menu = document.getElementById('avatar-menu');
    if (menu) menu.style.display = 'none';
    showToast('Đã đặt lại ảnh mặc định!', 'success');
  }
}

// ── Sync avatar UI từ currentAuth (gọi sau initAuth onLogin) ─
export function updateAvatarUI() {
  const currentAuth = window.currentAuth || {};
  const initials = document.getElementById('avatar-initials');
  const img = document.getElementById('avatar-img');
  const menuName = document.getElementById('menu-name');
  const menuEmail = document.getElementById('menu-email');

  const name = currentAuth.displayName || currentAuth.email?.split('@')[0] || 'U';

  // Lấy ký tự đầu của TỪ CUỐI trong tên (ưu tiên VN: "Nguyễn Văn Linh" → "L")
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const lastToken = tokens.length > 0 ? tokens[tokens.length - 1] : 'U';
  if (initials) initials.textContent = lastToken.charAt(0).toUpperCase();

  if (menuName) {
    // Chỉ update text, không xóa badge con
    const badge = document.getElementById('menu-role-badge');
    menuName.textContent = name;
    if (badge) menuName.appendChild(badge);
  }
  if (menuEmail) menuEmail.textContent = currentAuth.email || '';

  // Load avatar từ Firebase 1 lần (không listen liên tục để tránh leak)
  if (currentAuth.uid) {
    onValue(ref(db, 'users/' + currentAuth.uid + '/avatar'), snap => {
      const avatar = snap.val();
      if (avatar && img) {
        img.src = avatar;
        img.style.display = 'block';
        if (initials) initials.style.display = 'none';
      }
    }, { onlyOnce: true });
  }
}
