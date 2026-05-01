/**
 * services/duplicate-delete.js
 * Duplicate item + Delete item + User account management
 *
 * Phạm vi:
 *  - delItem: xoá generic với undo + reverse stock changes (hydro/electrode usedChems)
 *  - duplicateItem: nhân bản item, tự tạo mã -COPY/-COPY1/..., trừ kho cho hydro/electrode
 *  - approveUser: admin duyệt account pending → set role + tạo member card
 *  - changeUserRole: admin đổi role tài khoản
 *  - deleteUserAccount: super admin xoá tài khoản (soft delete)
 *  - deleteMemberSafe: confirm trước khi xoá member nếu user còn role active
 *
 * Phụ thuộc:
 *  - cache, currentAuth, currentUser qua window
 *  - showToast qua window
 *  - canEdit từ utils/auth-helpers.js
 *  - getPersonName từ utils/auth-helpers.js
 *  - vals từ utils/format.js
 *  - logHistory từ services/history-log.js
 *  - db, ref, update, onValue, fbDel, fbPush, fbGet từ firebase.js
 *  - SUPER_ADMIN_EMAIL constant (hard-code)
 *
 * Lưu ý:
 *  - delItem có undo: khôi phục data + reverse stock changes ngược lại
 *  - duplicateItem yêu cầu admin/member, có quy tắc trừ kho cho hydro/electrode (chỉ admin mới trừ)
 *  - deleteMemberSafe đọc role qua onValue {onlyOnce:true} để không leak
 */

import { canEdit, getPersonName } from '../utils/auth-helpers.js'
import { vals } from '../utils/format.js'
import { logHistory } from './history-log.js'
import { db, ref, update, onValue, fbDel, fbPush, fbGet } from '../firebase.js'

const SUPER_ADMIN_EMAIL = 'nvhn.7202@gmail.com';

// ═══════════════════════════════════════════════════════════
// DEL ITEM — generic delete với undo + reverse stock
// ═══════════════════════════════════════════════════════════
export async function delItem(col, key, name) {
  const cache = window.cache;
  const showToast = window.showToast;

  const _rec = cache[col] && cache[col][key];
  if (!canEdit(_rec)) { showToast('Bạn không có quyền xóa mục này', 'danger'); return; }

  // Round 9 fix #35: chặn xoá ink đang được điện cực dùng
  if (col === 'ink') {
    const usedBy = vals(cache.electrode || {}).filter(e => e.inkFormula === key);
    if (usedBy.length > 0) {
      const codes = usedBy.map(e => e.code).slice(0, 5).join(', ');
      const more = usedBy.length > 5 ? ` và ${usedBy.length - 5} điện cực khác` : '';
      showToast(`Không thể xóa "${name}": đang được dùng bởi ${usedBy.length} điện cực (${codes}${more}). Xóa các điện cực này trước.`, 'danger', null, 6000);
      return;
    }
  }

  if (!confirm(`Xóa "${name}"?\n\nHành động này có thể hoàn tác trong vài giây qua nút "Hoàn tác".`)) return;

  const backup = { ...cache[col][key] };
  // Track stock changes so undo can reverse them (Round 7 fix #24)
  const stockChanges = []; // { chemKey, delta }  delta = amount we ADDED back during delete

  try {
    // Hoàn lại tồn kho nếu là thủy nhiệt
    if (col === 'hydro') {
      const item = cache.hydro[key];
      if (item?.usedChems && !item.isSample) {
        for (const uc of item.usedChems) {
          const cur = cache.chemicals[uc.key];
          if (cur && uc.mass) {
            const newStock = parseFloat((parseFloat(cur.stock || 0) + parseFloat(uc.mass)).toFixed(3));
            await update(ref(db, `chemicals/${uc.key}`), { stock: newStock });
            stockChanges.push({ chemKey: uc.key, delta: parseFloat(uc.mass) });
            logHistory(`Hoàn tồn kho: ${cur.name}`, `+${uc.mass}${cur.unit || 'g'} (Xóa TN: ${name})`);
          }
        }
      }
    }

    // Hoàn lại tồn kho nếu là điện cực
    if (col === 'electrode') {
      const item = cache.electrode[key];
      if (item?.usedInkChems && !item.isSample) {
        for (const uc of item.usedInkChems) {
          const cur = cache.chemicals[uc.key];
          if (cur && uc.mass) {
            const newStock = parseFloat((parseFloat(cur.stock || 0) + parseFloat(uc.mass)).toFixed(5));
            await update(ref(db, `chemicals/${uc.key}`), { stock: newStock });
            stockChanges.push({ chemKey: uc.key, delta: parseFloat(uc.mass) });
            logHistory(`Hoàn tồn kho: ${cur.name}`, `+${uc.mass}${uc.unit || 'g'} (Xóa ĐC: ${name})`);
          }
        }
      }
    }

    await fbDel(`${col}/${key}`);
    logHistory(`Xóa ${col}: ${name}`, '');

    // Undo: restore record AND reverse stock changes
    showToast(`Đã xóa "${name}"`, 'danger', async () => {
      try {
        delete backup._key;
        await update(ref(db, `${col}/${key}`), backup);
        // Reverse stock changes - re-deduct what we added back
        for (const sc of stockChanges) {
          const cur = cache.chemicals[sc.chemKey];
          if (cur) {
            const restoredStock = parseFloat((parseFloat(cur.stock || 0) - sc.delta).toFixed(5));
            await update(ref(db, `chemicals/${sc.chemKey}`), { stock: restoredStock });
          }
        }
        logHistory(`Hoàn tác xóa ${col}: ${name}`, '');
      } catch (err) {
        console.error('[delItem undo]', err);
        showToast('Lỗi hoàn tác: ' + (err.message || err), 'danger');
      }
    });
  } catch (err) {
    console.error('[delItem]', err);
    showToast('Lỗi xóa: ' + (err.message || err), 'danger');
  }
}

// ═══════════════════════════════════════════════════════════
// DUPLICATE ITEM — nhân bản với mã -COPY tự tăng + trừ kho
// ═══════════════════════════════════════════════════════════
export async function duplicateItem(col, key) {
  const cache = window.cache;
  const currentAuth = window.currentAuth || {};
  const currentUser = window.currentUser || 'Khách';
  const showToast = window.showToast;

  const r = cache[col][key];
  if (!r) return;
  // Chỉ admin và member mới được nhân bản
  if (!currentAuth.isAdmin && !currentAuth.isMember) {
    showToast('Bạn không có quyền nhân bản!', 'danger');
    return;
  }
  const newR = { ...r };
  delete newR._key;
  delete newR.locked;
  delete newR.usedInkChems;
  newR.isSample = false;
  newR.createdAt = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  newR.createdBy = currentUser;
  // Gán người thực hiện là người đang dùng
  if (col !== 'chemicals' && col !== 'equipment') {
    newR.person = getPersonName();
  }

  // Tạo mã code -COPY tự tăng (qua window.isCodeDuplicate từ save-handlers)
  const base = (r.code || '').replace(/-COPY\d*$/, '');
  let newCode = `${base}-COPY`;
  let count = 1;
  while (window.isCodeDuplicate(col, newCode)) {
    newCode = `${base}-COPY${count}`;
    count++;
  }
  newR.code = newCode;

  // Trừ tồn kho nếu là điện cực và không phải mẫu thử (chỉ admin)
  if (col === 'electrode' && !newR.isSample) {
    const inkKey = newR.inkFormula;
    const inkData = inkKey ? cache.ink[inkKey] : null;
    const usedInkChems = [];
    if (inkData) {
      for (const s of (inkData.solids || [])) {
        usedInkChems.push({ key: s.key, mass: parseFloat((s.mass / 1000).toFixed(5)) });
      }
      for (const l of (inkData.liquids || [])) {
        usedInkChems.push({ key: l.key, mass: parseFloat((l.vol / 1000).toFixed(5)), unit: 'mL' });
      }
    }
    newR.usedInkChems = usedInkChems;
    if (usedInkChems.length > 0) {
      if (!currentAuth.isAdmin) {
        showToast('Đã tạo bản sao nhưng không trừ tồn kho mực (cần quyền Admin)', 'info');
      } else {
        try {
          for (const uc of usedInkChems) {
            const cur = cache.chemicals[uc.key];
            if (cur) {
              const newStock = parseFloat((cur.stock - uc.mass).toFixed(5));
              await update(ref(db, `chemicals/${uc.key}`), { stock: newStock });
            }
          }
        } catch (err) {
          console.error('[duplicateItem electrode stock]', err);
          showToast('Bản sao đã tạo nhưng lỗi trừ tồn kho mực: ' + err.message, 'danger');
        }
      }
    }
  }

  // Trừ tồn kho nếu là thủy nhiệt (chỉ admin mới được phép)
  if (col === 'hydro') {
    const usedChems = [];
    if (r.usedChems && r.usedChems.length > 0) {
      if (!currentAuth.isAdmin) {
        showToast('Đã tạo bản sao nhưng không trừ tồn kho (cần quyền Admin)', 'info');
      } else {
        try {
          for (const uc of r.usedChems) {
            usedChems.push({ key: uc.key, mass: uc.mass });
            const cur = cache.chemicals[uc.key];
            if (cur) {
              const newStock = parseFloat((cur.stock - uc.mass).toFixed(3));
              await update(ref(db, `chemicals/${uc.key}`), { stock: newStock });
              logHistory(`Trừ tồn kho: ${cur.name}`, `-${uc.mass}${cur.unit || 'g'} (TN: ${newCode})`);
            }
          }
        } catch (err) {
          console.error('[duplicateItem hydro stock]', err);
          showToast('Bản sao đã tạo nhưng lỗi trừ tồn kho: ' + err.message, 'danger');
        }
      }
    }
    newR.usedChems = usedChems;
  }

  try {
    await fbPush(col, newR);
    logHistory(`Nhân bản ${col}: ${r.code} → ${newCode}`, '');
    showToast(`Đã sao chép thành ${newCode}!`);
  } catch (err) {
    console.error('[duplicateItem push]', err);
    showToast('Lỗi tạo bản sao: ' + (err.message || err), 'danger');
  }
}

// ═══════════════════════════════════════════════════════════
// USER ACCOUNT MANAGEMENT
// ═══════════════════════════════════════════════════════════

// Approve user pending → set role + tạo member card nếu là member/viewer
export async function approveUser(uid, role) {
  const cache = window.cache;
  const showToast = window.showToast;

  await update(ref(db, 'users/' + uid), { role });
  logHistory('Phân quyền user: ' + uid, role);

  // Nếu duyệt thành member/viewer thì tạo grid thành viên nếu chưa có
  if (role === 'member' || role === 'viewer') {
    const userData = await fbGet('users/' + uid);
    if (userData) {
      const existing = vals(cache.members || {}).find(m => m.uid === uid);
      if (!existing) {
        await fbPush('members', {
          name: userData.displayName || '',
          email: userData.email || '',
          uid: uid,
          role: '',
          phone: '',
          studentId: '',
          topic: '',
          program: '',
          year: '',
          createdAt: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
      }
    }
  }
  showToast(role === 'rejected' ? 'Đã từ chối tài khoản' : 'Đã duyệt tài khoản — Role: ' + role, role === 'rejected' ? 'danger' : 'success');
}

// Soft-delete user account (chỉ super admin)
export async function deleteUserAccount(uid, name) {
  const currentAuth = window.currentAuth || {};
  const currentUser = window.currentUser || 'Khách';
  const showToast = window.showToast;

  if (currentAuth.email !== SUPER_ADMIN_EMAIL) {
    showToast('Không có quyền!', 'danger');
    return;
  }
  if (!confirm('Xóa vĩnh viễn account: ' + name + '?')) return;

  await update(ref(db, 'users/' + uid), {
    deleted: true,
    role: 'rejected',
    deletedAt: new Date().toISOString(),
    deletedBy: currentUser,
  });
  logHistory('Xóa account: ' + name, uid);
  showToast('Đã xóa account: ' + name, 'danger');
}

// Đổi role user
export async function changeUserRole(uid, role) {
  const showToast = window.showToast;

  await update(ref(db, 'users/' + uid), { role });
  logHistory('Đổi quyền user: ' + uid, role);
  showToast('Đã cập nhật quyền: ' + role, 'success');
}

// Xoá member card với confirm nếu user còn role active
export function deleteMemberSafe(key, name, uid) {
  if (uid) {
    onValue(ref(db, 'users/' + uid + '/role'), snap => {
      const role = snap.val();
      if (role && !['rejected'].includes(role)) {
        const roleLabel = { admin: 'Admin', member: 'Member', viewer: 'Viewer', pending: 'Chờ duyệt' };
        const ok = confirm('⚠️ Thành viên "' + name + '" vẫn còn tài khoản đang hoạt động (vai trò: ' + (roleLabel[role] || role) + ').\nBạn có chắc muốn xóa thẻ thành viên này không?');
        if (ok) delItem('members', key, name);
      } else {
        delItem('members', key, name);
      }
    }, { onlyOnce: true });
  } else {
    delItem('members', key, name);
  }
}
