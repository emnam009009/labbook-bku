/**
 * services/group-lock-mgmt.js
 * Lock/unlock items + Group management cho chemicals và equipment
 *
 * Phạm vi:
 *  - lockItem, unlockItem (admin lock/unlock generic — col + key)
 *  - lockInk, unlockInk (admin lock/unlock công thức mực)
 *  - Chem groups: startEditGroup, addGroup, deleteGroup, renderGroupList, addChemGroup, delChemGroup
 *  - Eq groups: renderEqGroupList, updateEqGroupSelects, addEqGroup, delEqGroup
 *
 * Phụ thuộc:
 *  - cache, isAdmin qua window
 *  - cacheEqGroups qua window (set ở Phần 5c)
 *  - showToast qua window
 *  - vals từ utils/format.js
 *  - logHistory từ services/history-log.js
 *  - db, ref, update, fbPush, fbSet, fbDel từ firebase.js
 *  - rebuildCustomSelect qua window (vẫn ở main.js)
 *  - renderEquipment qua window (đã tách ở Phần 5c)
 *  - devLog qua window
 *
 * Lưu ý:
 *  - 4 lock functions giống pattern (admin check + update DB + history log + toast)
 *  - chem groups vs eq groups: data khác nhau (cache.groups vs cacheEqGroups)
 *    nhưng UI tương tự — render list with del button
 */

import { vals } from '../utils/format.js'
import { logHistory } from './history-log.js'
import { db, ref, update, fbPush, fbSet, fbDel } from '../firebase.js'

// ═══════════════════════════════════════════════════════════
// LOCK / UNLOCK
// ═══════════════════════════════════════════════════════════

// Generic lock cho hydro/electrode/electrochem (HTML row toggle gọi qua col + key)
export async function lockItem(col, key) {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  try {
    await update(ref(db, `${col}/${key}`), { locked: true });
    logHistory(`Khóa ${col}: ${key}`, '');
    showToast('Đã khóa!');
  } catch (err) {
    console.error('[lockItem]', err);
    showToast('Lỗi khóa: ' + (err.message || err), 'danger');
  }
}

export async function unlockItem(col, key) {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  try {
    await update(ref(db, `${col}/${key}`), { locked: false });
    logHistory(`Mở khóa ${col}: ${key}`, '');
    showToast('Đã mở khóa!');
  } catch (err) {
    console.error('[unlockItem]', err);
    showToast('Lỗi mở khóa: ' + (err.message || err), 'danger');
  }
}

// Lock cho ink (separate vì có history label riêng)
export async function lockInk(key) {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  try {
    await update(ref(db, `ink/${key}`), { locked: true });
    logHistory(`Khóa công thức mực`, `Key: ${key}`);
    showToast('Đã khóa công thức!');
  } catch (err) {
    console.error('[lockInk]', err);
    showToast('Lỗi khóa: ' + (err.message || err), 'danger');
  }
}

export async function unlockInk(key) {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  try {
    await update(ref(db, `ink/${key}`), { locked: false });
    logHistory(`Mở khóa công thức mực`, `Key: ${key}`);
    showToast('Đã mở khóa!');
  } catch (err) {
    console.error('[unlockInk]', err);
    showToast('Lỗi mở khóa: ' + (err.message || err), 'danger');
  }
}

// ═══════════════════════════════════════════════════════════
// CHEM GROUPS (cache.groups)
// ═══════════════════════════════════════════════════════════

// Inline rename group: replace span với input (gọi từ chemicals page header)
export function startEditGroup(key, el) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  const r = cache.groups[key];
  if (!r) return;

  const input = document.createElement('input');
  input.value = r.name;
  input.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-2);border:none;border-bottom:1.5px solid var(--blue2);background:transparent;outline:none;width:160px;padding:0';
  el.replaceWith(input);
  input.focus();
  input.select();

  const save = async () => {
    const newName = input.value.trim();
    if (newName && newName !== r.name) {
      await update(ref(db, 'groups/' + key), { name: newName });
      showToast('Đã đổi tên nhóm!', 'success');
    }
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') input.blur();
  });
}

// Thêm nhóm mới (qua prompt)
export async function addGroup() {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  const name = prompt('Tên nhóm mới:');
  if (!name || !name.trim()) return;
  const order = vals(cache.groups).length + 1;
  try {
    await fbPush('groups', { name: name.trim(), order });
    showToast('Đã thêm nhóm!', 'success');
  } catch (err) {
    console.error('[addGroup]', err);
    showToast('Lỗi thêm nhóm: ' + (err.message || err), 'danger');
  }
}

// Xóa nhóm (có undo)
export async function deleteGroup(key) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  const group = cache.groups[key];
  if (!group) return;
  if (!confirm(`Xóa nhóm "${group.name}"?`)) return;
  try {
    await fbDel('groups/' + key);
    showToast('Đã xóa nhóm: ' + group.name, 'danger', async () => {
      try {
        await fbSet('groups/' + key, { name: group.name, order: group.order || 99 });
        showToast('Đã hoàn tác!', 'success');
      } catch (err) {
        console.error('[deleteGroup undo]', err);
        showToast('Lỗi hoàn tác', 'danger');
      }
    });
  } catch (err) {
    console.error('[deleteGroup]', err);
    showToast('Lỗi xóa nhóm: ' + (err.message || err), 'danger');
  }
}

// Render danh sách nhóm trong modal-groups (admin)
export function renderGroupList() {
  const cache = window.cache;
  const el = document.getElementById('group-list');
  if (!el) return;
  const groups = vals(cache.groups).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!groups.length) {
    el.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:12px 0">Chưa có nhóm nào</div>';
    return;
  }
  el.innerHTML = groups.map((g, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface)">
      <span style="width:22px;height:22px;border-radius:50%;background:var(--teal);color:white;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</span>
      <span style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${g.name}</span>
      <button class="btn btn-xs btn-danger" onclick="delChemGroup('${g._key}')">✕</button>
    </div>`).join('');
}

// Thêm nhóm từ input trong modal-groups
export async function addChemGroup() {
  const cache = window.cache;
  const showToast = window.showToast;

  const inp = document.getElementById('new-group-name');
  const name = inp.value.trim();
  if (!name) return;
  const order = vals(cache.groups).length + 1;
  inp.value = '';
  await fbPush('groups', { name, order });
  renderGroupList();
  showToast('Đã thêm nhóm: ' + name, 'success');
}

// Xóa nhóm từ modal-groups
export async function delChemGroup(key) {
  const cache = window.cache;
  const showToast = window.showToast;

  const group = cache.groups[key];
  if (!group) return;
  await fbDel('groups/' + key);
  renderGroupList();
  showToast('Đã xóa nhóm: ' + group.name, 'danger', async () => {
    await fbSet('groups/' + key, { name: group.name, order: group.order || 99 });
    renderGroupList();
    showToast('Đã hoàn tác!', 'success');
  });
}

// ═══════════════════════════════════════════════════════════
// EQ GROUPS (cacheEqGroups)
// ═══════════════════════════════════════════════════════════

// Render danh sách nhóm thiết bị trong modal-eq-groups
export function renderEqGroupList() {
  const cacheEqGroups = window.cacheEqGroups || {};
  const el = document.getElementById('eq-group-list');
  if (!el) return;
  const groups = vals(cacheEqGroups).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!groups.length) {
    el.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:12px 0">Chưa có nhóm nào</div>';
    return;
  }
  el.innerHTML = groups.map((g, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface)">
      <span style="width:22px;height:22px;border-radius:50%;background:var(--teal);color:white;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</span>
      <span style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${g.name}</span>
      <button class="btn btn-xs btn-danger" onclick="delEqGroup('${g._key}')">✕</button>
    </div>`).join('');
}

// Update <select id="eq-group"> options khi cacheEqGroups thay đổi
export function updateEqGroupSelects() {
  const cacheEqGroups = window.cacheEqGroups || {};
  const el = document.getElementById('eq-group');
  if (!el) return;
  const cur = el.dataset.pendingVal !== undefined ? el.dataset.pendingVal : el.value;
  const groups = vals(cacheEqGroups).sort((a, b) => (a.order || 0) - (b.order || 0));
  el.innerHTML = '<option value="">Chọn nhóm</option>' + groups.map(g =>
    `<option value="${g._key}">${g.name}</option>`
  ).join('');
  el.value = cur;
  // rebuildCustomSelect vẫn ở main.js (là helper UI custom)
  if (window.rebuildCustomSelect) window.rebuildCustomSelect('eq-group');
}

// Thêm eq group từ input trong modal-eq-groups
export async function addEqGroup() {
  const cacheEqGroups = window.cacheEqGroups || {};
  const showToast = window.showToast;
  const devLog = window.devLog || (() => {});

  const inp = document.getElementById('new-eq-group-name');
  const name = inp.value.trim();
  if (!name) return;
  const order = vals(cacheEqGroups).length + 1;
  inp.value = '';
  devLog('addEqGroup called:', name, order);
  const newRef = await fbPush('eq_groups', { name, order });
  devLog('fbPush result:', newRef, newRef && newRef.key);
  // Cập nhật cache local ngay (Firebase listener sẽ trigger đồng bộ sau)
  if (newRef && newRef.key) cacheEqGroups[newRef.key] = { name, order, _key: newRef.key };
  renderEqGroupList();
  updateEqGroupSelects();
  showToast('Đã thêm nhóm: ' + name, 'success');
}

// Xóa eq group (có undo + re-render Equipment)
export async function delEqGroup(key) {
  const cacheEqGroups = window.cacheEqGroups || {};
  const showToast = window.showToast;
  const renderEquipment = window.renderEquipment;

  const group = cacheEqGroups[key];
  if (!group) return;
  delete cacheEqGroups[key];
  await fbDel('eq_groups/' + key);
  renderEqGroupList();
  if (typeof renderEquipment === 'function') renderEquipment();
  showToast('Đã xóa nhóm: ' + group.name, 'danger', async () => {
    await fbSet('eq_groups/' + key, { name: group.name, order: group.order || 99 });
    cacheEqGroups[key] = { name: group.name, order: group.order || 99, _key: key };
    renderEqGroupList();
    if (typeof renderEquipment === 'function') renderEquipment();
    showToast('Đã hoàn tác!', 'success');
  });
}
