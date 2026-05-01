/**
 * services/edit-handlers.js
 * 9 edit handlers — mở modal edit cho từng collection và populate form từ cached data
 *
 * Phạm vi:
 *  - editHydro, editElectrode, editElectrochem, editChemical, editEquipment
 *  - editInk, editMember
 *  - editSubtitle, editLabTitle (inline editor cho lab metadata)
 *
 * Phụ thuộc:
 *  - cache, isAdmin, currentAuth qua window
 *  - openModal, showToast qua window
 *  - canEdit từ utils/auth-helpers.js
 *  - db, ref, update từ firebase.js
 *  - removeEquipmentImagePreview từ services/image-handlers.js (cho editEquipment)
 *  - addChem, addInkRow, syncUnit, calcMol qua window (HTML inline functions vẫn ở main.js)
 *
 * Lưu ý:
 *  - editHydro/editInk có dynamic row generation (chemicals + solids/liquids)
 *  - editSubtitle/editLabTitle dùng inline contenteditable pattern (no modal)
 *  - editChemical gọi syncUnit() để đồng bộ unit dropdown ↔ unit input
 */

import { canEdit } from '../utils/auth-helpers.js'
import { db, ref, update } from '../firebase.js'
import { removeEquipmentImagePreview } from './image-handlers.js'

// ───────────────────────────────────────────────────────────
// Edit Electrode
// ───────────────────────────────────────────────────────────
export function editElectrode(key) {
  const cache = window.cache;
  const showToast = window.showToast;
  const openModal = window.openModal;

  const r = cache.electrode[key];
  if (!r) return;
  if (!canEdit(r)) { showToast('Bạn không có quyền sửa mục này', 'info'); return; }

  document.getElementById('e-code').value = r.code || '';
  document.getElementById('e-date').value = r.date || '';
  document.getElementById('e-material').value = r.material || '';
  document.getElementById('e-substrate').value = r.substrate || '';
  document.getElementById('e-area').value = r.area || '';
  document.getElementById('e-ink-formula').value = r.inkFormula || '';
  document.getElementById('e-conc').value = r.conc || '';
  document.getElementById('e-conc-cat').value = r.concCat || '';
  document.getElementById('e-vol').value = r.vol || '';
  document.getElementById('e-drops').value = r.drops || '';
  document.getElementById('e-anneal-t').value = r.annealT || '';
  document.getElementById('e-anneal-h').value = r.annealH || '';
  document.getElementById('e-atm').value = r.atm || '';
  document.getElementById('e-activation').value = r.activation || '';
  document.getElementById('e-loading').value = r.loading || '';
  document.getElementById('e-is-sample').checked = r.isSample || false;
  document.getElementById('modal-electrode').dataset.editKey = key;
  document.querySelector('#modal-electrode .modal-title').textContent = 'Chỉnh sửa điện cực';
  document.querySelector('#modal-electrode .btn-primary').textContent = 'Cập nhật';
  openModal('modal-electrode');
}

// ───────────────────────────────────────────────────────────
// Edit Electrochem
// ───────────────────────────────────────────────────────────
export function editElectrochem(key) {
  const cache = window.cache;
  const showToast = window.showToast;
  const openModal = window.openModal;

  const r = cache.electrochem[key];
  if (!r) return;
  if (!canEdit(r)) { showToast('Bạn không có quyền sửa mục này', 'info'); return; }

  document.getElementById('ec-code').value = r.code || '';
  document.getElementById('ec-date').value = r.date || '';
  document.getElementById('ec-electrode').value = r.electrode || '';
  document.getElementById('ec-type').value = r.type || '';
  document.getElementById('ec-reaction').value = r.reaction || '';
  document.getElementById('ec-electrolyte').value = r.electrolyte || '';
  document.getElementById('ec-re').value = r.re || '';
  document.getElementById('ec-ce').value = r.ce || '';
  document.getElementById('ec-inst').value = r.inst || '';
  document.getElementById('ec-estart').value = r.estart || '';
  document.getElementById('ec-eend').value = r.eend || '';
  document.getElementById('ec-rate').value = r.rate || '';
  document.getElementById('ec-ir').value = r.ir || '';
  document.getElementById('ec-eta10').value = r.eta10 || '';
  document.getElementById('ec-tafel').value = r.tafel || '';
  document.getElementById('ec-j0').value = r.j0 || '';
  document.getElementById('ec-rs').value = r.rs || '';
  document.getElementById('ec-rct').value = r.rct || '';
  document.getElementById('ec-ecsa').value = r.ecsa || '';
  document.getElementById('modal-electrochem').dataset.editKey = key;
  document.querySelector('#modal-electrochem .modal-title').textContent = 'Chỉnh sửa phép đo';
  document.querySelector('#modal-electrochem .btn-primary').textContent = 'Cập nhật';
  openModal('modal-electrochem');
}

// ───────────────────────────────────────────────────────────
// Edit Member
// ───────────────────────────────────────────────────────────
export function editMember(key) {
  const cache = window.cache;
  const openModal = window.openModal;

  const m = cache.members[key];
  if (!m) return;
  // Chỉ admin hoặc chủ card mới được sửa (đã check ở renderMembers click)

  document.getElementById('m-name').value = m.name || '';
  document.getElementById('m-role').value = m.role || '';
  document.getElementById('m-year').value = m.year || '';
  document.getElementById('m-id').value = m.studentId || '';
  document.getElementById('m-email').value = m.email || '';
  document.getElementById('m-phone').value = m.phone || '';
  document.getElementById('m-topic').value = m.topic || '';
  const mProg = document.getElementById('m-program');
  if (mProg) mProg.value = m.program || '';
  document.getElementById('modal-member').dataset.editKey = key;
  document.querySelector('#modal-member .modal-title').textContent = 'Chỉnh sửa thành viên';
  document.querySelector('#modal-member .btn-primary').textContent = 'Cập nhật';
  openModal('modal-member');
}

// ───────────────────────────────────────────────────────────
// Edit Hydro: load lại usedChems thành rows trong tbody
// ───────────────────────────────────────────────────────────
export function editHydro(key) {
  const cache = window.cache;
  const showToast = window.showToast;
  const openModal = window.openModal;

  const r = cache.hydro[key];
  if (!r) return;
  if (!canEdit(r)) { showToast('Bạn không có quyền sửa mục này', 'info'); return; }

  document.getElementById('h-code').value = r.code || '';
  document.getElementById('h-date').value = r.date || '';
  document.getElementById('h-material').value = r.material || '';
  document.getElementById('h-temp').value = r.temp || '';
  document.getElementById('h-time').value = r.time || '';
  document.getElementById('h-ph').value = r.ph || '';
  document.getElementById('h-vol').value = r.vol || '';
  document.getElementById('h-rate').value = r.rate || '';
  document.getElementById('h-status').value = r.status || '';
  document.getElementById('h-note').value = r.note || '';
  document.getElementById('h-is-sample').checked = r.isSample || false;

  // Load lại hóa chất đã dùng
  const tbody = document.getElementById('h-chem-tbody');
  tbody.innerHTML = '';
  if (r.usedChems && r.usedChems.length > 0) {
    r.usedChems.forEach(uc => {
      const chem = cache.chemicals[uc.key];
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="position:relative"><input type="text" class="chem-search" value="${chem?.name || ''}" data-chem-key="${uc.key}" autocomplete="off"><div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div></td><td><input type="number" class="chem-mw" value="${chem?.mw || ''}" readonly style="background:var(--surface-alt,var(--teal-light))"></td><td><input type="number" step="0.001" value="${uc.mass || ''}" oninput="calcMol(this)"></td><td><input type="number" step="0.0001" readonly style="background:var(--surface-alt,var(--teal-light))"></td><td><button class="btn btn-xs btn-danger" onclick="removeChem(this)">✕</button></td>`;
      tbody.appendChild(tr);
    });
  } else {
    if (window.addChem) window.addChem();
  }

  document.getElementById('modal-hydrothermal').dataset.editKey = key;
  document.querySelector('#modal-hydrothermal .modal-title').textContent = 'Chỉnh sửa thí nghiệm';
  document.querySelector('#modal-hydrothermal .btn-primary').textContent = 'Cập nhật';
  openModal('modal-hydrothermal');
}

// ───────────────────────────────────────────────────────────
// Edit Ink: load lại solids + liquids thành rows
// ───────────────────────────────────────────────────────────
export function editInk(key) {
  const cache = window.cache;
  const showToast = window.showToast;
  const openModal = window.openModal;

  const r = cache.ink[key];
  if (!r) return;
  if (!canEdit(r)) { showToast('Bạn không có quyền sửa mục này', 'info'); return; }

  document.getElementById('ink-code').value = r.code || '';
  document.getElementById('ink-name').value = r.name || '';
  document.getElementById('ink-material').value = r.material || '';
  document.getElementById('ink-doi').value = r.doi || '';
  document.getElementById('ink-note').value = r.note || '';
  document.getElementById('modal-ink').dataset.editKey = key;
  document.querySelector('#modal-ink .modal-title').textContent = 'Chỉnh sửa công thức mực';
  document.querySelector('#modal-ink .btn-primary').textContent = 'Cập nhật';

  // Load lại thành phần rắn (solids)
  const solidTbody = document.getElementById('ink-solid-tbody');
  solidTbody.innerHTML = '';
  if (r.solids && r.solids.length > 0) {
    r.solids.forEach(s => {
      const chem = cache.chemicals[s.key];
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="position:relative"><input type="text" class="chem-search" value="${s.name || ''}" data-chem-key="${s.key}" autocomplete="off"><div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div></td><td><input type="number" class="chem-mw" value="${chem?.mw || ''}" readonly style="background:var(--surface-alt,var(--teal-light))"></td><td><input type="number" min="0" step="0.01" value="${s.mass || ''}"></td><td><button class="btn btn-xs btn-danger" onclick="removeChem(this)">✕</button></td>`;
      solidTbody.appendChild(tr);
    });
  } else {
    if (window.addInkRow) window.addInkRow('ink-solid-tbody');
  }

  // Load lại dung môi (liquids)
  const liquidTbody = document.getElementById('ink-liquid-tbody');
  liquidTbody.innerHTML = '';
  if (r.liquids && r.liquids.length > 0) {
    r.liquids.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="position:relative"><input type="text" class="chem-search" value="${l.name || ''}" data-chem-key="${l.key}" autocomplete="off"><div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div></td><td><input type="number" min="0" step="1" value="${l.vol || ''}"></td><td><button class="btn btn-xs btn-danger" onclick="removeChem(this)">✕</button></td>`;
      liquidTbody.appendChild(tr);
    });
  } else {
    if (window.addInkRow) window.addInkRow('ink-liquid-tbody');
  }
  openModal('modal-ink');
}

// ───────────────────────────────────────────────────────────
// Edit Chemical (admin only)
// ───────────────────────────────────────────────────────────
export function editChemical(key) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const openModal = window.openModal;

  if (!isAdmin) return;
  const r = cache.chemicals[key];
  if (!r) return;

  document.getElementById('c-name').value = r.name || '';
  document.getElementById('c-formula').value = r.formula || '';
  if (document.getElementById('c-group')) {
    document.getElementById('c-group').value = r.group || '';
    document.getElementById('c-group').dataset.pendingVal = r.group || '';
  }
  document.getElementById('c-mw').value = r.mw || '';
  document.getElementById('c-vendor').value = r.vendor || '';
  document.getElementById('c-purity').value = r.purity || '';
  document.getElementById('c-cas').value = r.cas || '';
  document.getElementById('c-location').value = r.location || '';
  document.getElementById('c-stock').value = r.stock || '';
  document.getElementById('c-alert').value = r.alert || '';
  document.getElementById('c-unit').value = r.unit || 'g';
  document.getElementById('c-qty') && (document.getElementById('c-qty').value = r.qty || 1);

  // Sync unit dropdown ↔ unit input field (vẫn ở main.js)
  if (window.syncUnit) window.syncUnit();

  document.getElementById('modal-chemical').dataset.editKey = key;
  document.querySelector('#modal-chemical .modal-title').textContent = 'Chỉnh sửa hóa chất';
  document.querySelector('#modal-chemical .btn-primary').textContent = 'Tra cứu';
  openModal('modal-chemical');
}

// ───────────────────────────────────────────────────────────
// Edit Equipment (admin only) — dùng __eqImageBase64 + removeEquipmentImagePreview
// ───────────────────────────────────────────────────────────
export function editEquipment(key) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const openModal = window.openModal;

  if (!isAdmin) return;
  const r = cache.equipment && cache.equipment[key];
  if (!r) return;

  document.getElementById('eq-name').value = r.name || '';
  document.getElementById('eq-model').value = r.model || '';
  document.getElementById('eq-serial').value = r.serial || '';
  document.getElementById('eq-vendor').value = r.vendor || '';
  document.getElementById('eq-location').value = r.location || 'Cơ sở 1';
  if (document.getElementById('eq-date')) document.getElementById('eq-date').value = r.date || '';
  if (document.getElementById('eq-group')) {
    document.getElementById('eq-group').value = r.group || '';
    document.getElementById('eq-group').dataset.pendingVal = r.group || '';
  }
  document.getElementById('eq-qty') && (document.getElementById('eq-qty').value = r.qty || 1);
  document.getElementById('eq-status').value = r.status || 'Đang sử dụng';

  window.__eqImageBase64 = r.image || null;
  if (r.image) {
    document.getElementById('eq-image-preview').src = r.image;
    document.getElementById('eq-image-preview').style.display = 'block';
    document.getElementById('eq-drop-zone').style.display = 'none';
    document.getElementById('eq-image-remove').style.display = 'inline-flex';
  } else {
    removeEquipmentImagePreview();
  }
  document.getElementById('modal-equipment').dataset.editKey = key;
  document.querySelector('#modal-equipment .modal-title').textContent = 'Chỉnh sửa thiết bị';
  document.querySelector('#modal-equipment .btn-primary').textContent = 'Cập nhật';
  openModal('modal-equipment');
}

// ───────────────────────────────────────────────────────────
// Edit Subtitle: inline editor cho lab subtitle (admin only)
// ───────────────────────────────────────────────────────────
export function editSubtitle() {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  const el = document.getElementById('lab-subtitle');
  if (el.querySelector('input')) return;
  const cur = el.textContent;
  el.style.transition = 'opacity 0.15s';
  el.style.opacity = '0';
  setTimeout(() => {
    const input = document.createElement('input');
    input.value = cur;
    input.style.cssText = 'background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.4);color:rgba(255,255,255,0.5);font-size:10.5px;letter-spacing:0.05em;width:280px;outline:none;padding:2px 0;font-family:inherit';
    el.innerHTML = '';
    el.appendChild(input);
    el.style.opacity = '1';
    input.focus();
    input.select();

    const save = async () => {
      const newText = input.value.trim();
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent = newText || cur;
        el.style.opacity = '1';
      }, 150);
      if (newText && newText !== cur) {
        await update(ref(db, 'settings/subtitle'), { value: newText });
        showToast('Đã cập nhật tên lab!');
      }
    };

    input.onblur = save;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        el.style.opacity = '0';
        setTimeout(() => { el.textContent = cur; el.style.opacity = '1'; }, 150);
      }
    };
  }, 150);
}

// ───────────────────────────────────────────────────────────
// Edit Lab Title: inline editor cho lab title (admin only)
// ───────────────────────────────────────────────────────────
export function editLabTitle() {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  const el = document.getElementById('lab-title');
  if (!el || el.querySelector('input')) return;

  const cur = el.textContent;
  const input = document.createElement('input');
  input.value = cur;
  input.style.cssText = 'background:transparent;border:none;border-bottom:1.5px solid var(--teal);color:var(--text);font-size:15px;font-weight:600;letter-spacing:-0.3px;width:120px;outline:none;padding:2px 0;font-family:inherit';
  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  input.select();

  const save = async () => {
    const newText = input.value.trim();
    el.textContent = newText || cur;
    if (newText && newText !== cur) {
      await update(ref(db, 'settings/title'), { value: newText });
      showToast('Đã cập nhật tên!');
    }
  };
  input.onblur = save;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { el.textContent = cur; }
  };
}
