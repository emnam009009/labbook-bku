/**
 * services/group-lock-mgmt.ts
 * Lock/unlock items + Group management cho chemicals va equipment
 */

import { vals } from '../utils/format.js'
import { logHistory } from './history-log.js'
import { db, ref, update, fbPush, fbSet, fbDel } from '../firebase.js'

// ═══════════════════════════════════════════════════════════
// LOCK / UNLOCK
// ═══════════════════════════════════════════════════════════

// Generic lock cho hydro/electrode/electrochem (HTML row toggle goi qua col + key)
export async function lockItem(col: string, key: string): Promise<void> {
  const isAdmin = !!((window as any).isAdmin || (window.currentAuth as any)?.isAdmin);
  const showToast = window.showToast as any;

  if (!isAdmin) return;
  try {
    await update(ref(db, `${col}/${key}`), { locked: true });
    (logHistory as any)(`Khoa ${col}: ${key}`, '');
    showToast('Da khoa!');
  } catch (err: any) {
    console.error('[lockItem]', err);
    showToast('Loi khoa: ' + (err.message || err), 'danger');
  }
}

export async function unlockItem(col: string, key: string): Promise<void> {
  const isAdmin = !!((window as any).isAdmin || (window.currentAuth as any)?.isAdmin);
  const showToast = window.showToast as any;

  if (!isAdmin) return;
  try {
    await update(ref(db, `${col}/${key}`), { locked: false });
    (logHistory as any)(`Mo khoa ${col}: ${key}`, '');
    showToast('Da mo khoa!');
  } catch (err: any) {
    console.error('[unlockItem]', err);
    showToast('Loi mo khoa: ' + (err.message || err), 'danger');
  }
}

// Lock cho ink (separate vi co history label rieng)
export async function lockInk(key: string): Promise<void> {
  const isAdmin = !!((window as any).isAdmin || (window.currentAuth as any)?.isAdmin);
  const showToast = window.showToast as any;

  if (!isAdmin) return;
  try {
    await update(ref(db, `ink/${key}`), { locked: true });
    (logHistory as any)(`Khoa cong thuc muc`, `Key: ${key}`);
    showToast('Da khoa cong thuc!');
  } catch (err: any) {
    console.error('[lockInk]', err);
    showToast('Loi khoa: ' + (err.message || err), 'danger');
  }
}

export async function unlockInk(key: string): Promise<void> {
  const isAdmin = !!((window as any).isAdmin || (window.currentAuth as any)?.isAdmin);
  const showToast = window.showToast as any;

  if (!isAdmin) return;
  try {
    await update(ref(db, `ink/${key}`), { locked: false });
    (logHistory as any)(`Mo khoa cong thuc muc`, `Key: ${key}`);
    showToast('Da mo khoa!');
  } catch (err: any) {
    console.error('[unlockInk]', err);
    showToast('Loi mo khoa: ' + (err.message || err), 'danger');
  }
}

// ═══════════════════════════════════════════════════════════
// CHEM GROUPS (cache.groups)
// ═══════════════════════════════════════════════════════════

// Inline rename group: replace span voi input
export function startEditGroup(key: string, el: HTMLElement): void {
  const cache = window.cache as any;
  const isAdmin = !!((window as any).isAdmin || (window.currentAuth as any)?.isAdmin);
  const showToast = window.showToast as any;

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
      showToast('Da doi ten nhom!', 'success');
    }
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') input.blur();
  });
}

// Them nhom moi (qua prompt)
export async function addGroup(): Promise<void> {
  const cache = window.cache as any;
  const isAdmin = !!((window as any).isAdmin || (window.currentAuth as any)?.isAdmin);
  const showToast = window.showToast as any;

  if (!isAdmin) return;
  const name = prompt('Ten nhom moi:');
  if (!name || !name.trim()) return;
  const order = vals(cache.groups).length + 1;
  try {
    await fbPush('groups', { name: name.trim(), order });
    showToast('Da them nhom!', 'success');
  } catch (err: any) {
    console.error('[addGroup]', err);
    showToast('Loi them nhom: ' + (err.message || err), 'danger');
  }
}

// Xoa nhom (co undo)
export async function deleteGroup(key: string): Promise<void> {
  const cache = window.cache as any;
  const isAdmin = !!((window as any).isAdmin || (window.currentAuth as any)?.isAdmin);
  const showToast = window.showToast as any;

  if (!isAdmin) return;
  const group = cache.groups[key];
  if (!group) return;
  if (!confirm(`Xoa nhom "${group.name}"?`)) return;
  try {
    await fbDel('groups/' + key);
    showToast('Da xoa nhom: ' + group.name, 'danger', async () => {
      try {
        await fbSet('groups/' + key, { name: group.name, order: group.order || 99 });
        showToast('Da hoan tac!', 'success');
      } catch (err: any) {
        console.error('[deleteGroup undo]', err);
        showToast('Loi hoan tac', 'danger');
      }
    });
  } catch (err: any) {
    console.error('[deleteGroup]', err);
    showToast('Loi xoa nhom: ' + (err.message || err), 'danger');
  }
}

// Render danh sach nhom trong modal-groups (admin)
export function renderGroupList(): void {
  const cache = window.cache as any;
  const el = document.getElementById('group-list');
  if (!el) return;
  const groups = vals(cache.groups).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  if (!groups.length) {
    el.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:12px 0">Chua co nhom nao</div>';
    return;
  }
  el.innerHTML = groups.map((g: any, i: number) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface)">
      <span style="width:22px;height:22px;border-radius:50%;background:var(--teal);color:white;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</span>
      <span style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${g.name}</span>
      <button class="btn btn-xs btn-danger" onclick="delChemGroup('${g._key}')">x</button>
    </div>`).join('');
}

// Them nhom tu input trong modal-groups
export async function addChemGroup(): Promise<void> {
  const cache = window.cache as any;
  const showToast = window.showToast as any;

  const inp = document.getElementById('new-group-name') as HTMLInputElement | null;
  const name = inp?.value.trim();
  if (!name) return;
  const order = vals(cache.groups).length + 1;
  if (inp) inp.value = '';
  await fbPush('groups', { name, order });
  renderGroupList();
  showToast('Da them nhom: ' + name, 'success');
}

// Xoa nhom tu modal-groups
export async function delChemGroup(key: string): Promise<void> {
  const cache = window.cache as any;
  const showToast = window.showToast as any;

  const group = cache.groups[key];
  if (!group) return;
  await fbDel('groups/' + key);
  renderGroupList();
  showToast('Da xoa nhom: ' + group.name, 'danger', async () => {
    await fbSet('groups/' + key, { name: group.name, order: group.order || 99 });
    renderGroupList();
    showToast('Da hoan tac!', 'success');
  });
}

// ═══════════════════════════════════════════════════════════
// EQ GROUPS (cacheEqGroups)
// ═══════════════════════════════════════════════════════════

// Render danh sach nhom thiet bi trong modal-eq-groups
export function renderEqGroupList(): void {
  const cacheEqGroups = (window as any).cacheEqGroups || {};
  const el = document.getElementById('eq-group-list');
  if (!el) return;
  const groups = vals(cacheEqGroups).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  if (!groups.length) {
    el.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:12px 0">Chua co nhom nao</div>';
    return;
  }
  el.innerHTML = groups.map((g: any, i: number) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface)">
      <span style="width:22px;height:22px;border-radius:50%;background:var(--teal);color:white;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</span>
      <span style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${g.name}</span>
      <button class="btn btn-xs btn-danger" onclick="delEqGroup('${g._key}')">x</button>
    </div>`).join('');
}

// Update <select id="eq-group"> options khi cacheEqGroups thay doi
export function updateEqGroupSelects(): void {
  const cacheEqGroups = (window as any).cacheEqGroups || {};
  const el = document.getElementById('eq-group') as HTMLSelectElement | null;
  if (!el) return;
  const cur = el.dataset.pendingVal !== undefined ? el.dataset.pendingVal : el.value;
  const groups = vals(cacheEqGroups).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  el.innerHTML = '<option value="">Chon nhom</option>' + groups.map((g: any) =>
    `<option value="${g._key}">${g.name}</option>`
  ).join('');
  el.value = cur || '';
  // rebuildCustomSelect van o main.js (la helper UI custom)
  if ((window as any).rebuildCustomSelect) (window as any).rebuildCustomSelect('eq-group');
}

// Them eq group tu input trong modal-eq-groups
export async function addEqGroup(): Promise<void> {
  const cacheEqGroups = (window as any).cacheEqGroups || {};
  const showToast = window.showToast as any;
  const devLog = (window as any).devLog || (() => {});

  const inp = document.getElementById('new-eq-group-name') as HTMLInputElement | null;
  const name = inp?.value.trim();
  if (!name) return;
  const order = vals(cacheEqGroups).length + 1;
  if (inp) inp.value = '';
  devLog('addEqGroup called:', name, order);
  const newRef = await fbPush('eq_groups', { name, order });
  devLog('fbPush result:', newRef, newRef && (newRef as any).key);
  // Cap nhat cache local ngay (Firebase listener se trigger dong bo sau)
  if (newRef && (newRef as any).key) cacheEqGroups[(newRef as any).key] = { name, order, _key: (newRef as any).key };
  renderEqGroupList();
  updateEqGroupSelects();
  showToast('Da them nhom: ' + name, 'success');
}

// Xoa eq group (co undo + re-render Equipment)
export async function delEqGroup(key: string): Promise<void> {
  const cacheEqGroups = (window as any).cacheEqGroups || {};
  const showToast = window.showToast as any;
  const renderEquipment = window.renderEquipment;

  const group = cacheEqGroups[key];
  if (!group) return;
  delete cacheEqGroups[key];
  await fbDel('eq_groups/' + key);
  renderEqGroupList();
  if (typeof renderEquipment === 'function') renderEquipment();
  showToast('Da xoa nhom: ' + group.name, 'danger', async () => {
    await fbSet('eq_groups/' + key, { name: group.name, order: group.order || 99 });
    cacheEqGroups[key] = { name: group.name, order: group.order || 99, _key: key };
    renderEqGroupList();
    if (typeof renderEquipment === 'function') renderEquipment();
    showToast('Da hoan tac!', 'success');
  });
}
