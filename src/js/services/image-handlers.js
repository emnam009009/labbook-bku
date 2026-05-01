/**
 * services/image-handlers.js
 * Image handlers cho 5 collection: ink, electrode, hydro, chemical, equipment
 *
 * Cấu trúc mỗi collection:
 *  - showXxxImage(key)            → mở modal preview, set current key
 *  - handleXxxPaste(e)            → xử lý Ctrl+V trong modal (chỉ ink/electrode/hydro)
 *  - dropXxxImage(e)              → drag-drop vào dropzone trong modal
 *  - uploadXxxImage(input)        → file picker
 *  - processXxxImage(file)        → internal: read base64 + update DB
 *  - deleteXxxImage()             → xoá ảnh (có confirm hoặc undo)
 *
 * Đặc biệt:
 *  - dropImageToCell + dropEquipmentImageToCell: drag-drop trực tiếp vào cell ở table (chemicals + equipment)
 *  - previewEquipmentImage: dùng cho modal-equipment trong lúc tạo/sửa (chưa save)
 *  - removeEquipmentImagePreview: xoá preview, có undo
 *
 * State module-level (3 biến):
 *  - currentInkImageKey, currentElectrodeImageKey, currentHydroImageKey
 *
 * State qua window (chia sẻ với save-handlers):
 *  - window.__eqImageBase64
 *
 * Phụ thuộc:
 *  - cache, isAdmin, showToast, openModal qua window
 *  - db, ref, update từ firebase.js
 *
 * 2 paste listeners (chemical, equipment) là document-level + filter theo modal đang mở.
 * 3 paste listeners còn lại (ink, electrode, hydro) là on-demand (gắn khi mở modal, gỡ khi đóng).
 */

import { db, ref, update } from '../firebase.js'

// ── Module-level state (3 cái — chỉ dùng trong module này) ──
let currentInkImageKey = null;
let currentElectrodeImageKey = null;
let currentHydroImageKey = null;

// ═══════════════════════════════════════════════════════════
// INK IMAGE
// ═══════════════════════════════════════════════════════════
export function showInkImage(key) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const openModal = window.openModal;

  currentInkImageKey = key;
  const r = cache.ink[key];
  const locked = r.locked && !isAdmin;
  document.getElementById('ink-image-title').textContent = `Quy trình: ${r.code} — ${r.name}`;

  const preview = document.getElementById('ink-image-preview');
  const dropZone = document.getElementById('ink-drop-zone');
  const delBtn = document.getElementById('ink-image-delete');
  if (r.imageData) {
    preview.src = r.imageData;
    preview.style.display = 'block';
    dropZone.style.display = 'none';
    delBtn.style.display = locked ? 'none' : 'inline-flex';
  } else {
    preview.style.display = 'none';
    dropZone.style.display = locked ? 'none' : 'block';
    delBtn.style.display = 'none';
  }
  // Re-attach paste handler — dùng window.handleInkPaste vì có nhiều ref qua HTML
  document.removeEventListener('paste', handleInkPaste);
  if (!locked) document.addEventListener('paste', handleInkPaste);
  openModal('modal-ink-image');
}

export function handleInkPaste(e) {
  if (!currentInkImageKey) return;
  const items = Array.from(e.clipboardData?.items || []);
  const imageItem = items.find(item => item.kind === 'file' && item.type.startsWith('image/'));
  if (!imageItem) return;
  const file = imageItem.getAsFile();
  if (!file) return;
  processInkImage(file);
}

export function dropInkImage(e) {
  e.preventDefault();
  document.getElementById('ink-drop-zone').style.borderColor = 'var(--border)';
  document.getElementById('ink-drop-zone').style.background = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) processInkImage(file);
}

export function uploadInkImage(input) {
  if (input.files[0]) processInkImage(input.files[0]);
}

function processInkImage(file) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  const r = cache.ink[currentInkImageKey];
  if (r?.locked && !isAdmin) { showToast('Công thức đã khóa!'); return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const imageData = e.target.result;
    await update(ref(db, `ink/${currentInkImageKey}`), { imageData });
    document.getElementById('ink-image-preview').src = imageData;
    document.getElementById('ink-image-preview').style.display = 'block';
    document.getElementById('ink-drop-zone').style.display = 'none';
    document.getElementById('ink-image-delete').style.display = 'inline-flex';
    showToast('Đã lưu ảnh quy trình!');
  };
  reader.readAsDataURL(file);
}

export async function deleteInkImage() {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  const r = cache.ink[currentInkImageKey];
  if (r?.locked && !isAdmin) { showToast('Công thức đã khóa!'); return; }
  if (!confirm('Xóa ảnh quy trình?')) return;
  try {
    await update(ref(db, `ink/${currentInkImageKey}`), { imageData: null });
    const preview = document.getElementById('ink-image-preview');
    const dropZone = document.getElementById('ink-drop-zone');
    const delBtn = document.getElementById('ink-image-delete');
    if (preview) preview.style.display = 'none';
    if (dropZone) dropZone.style.display = 'block';
    if (delBtn) delBtn.style.display = 'none';
    showToast('Đã xóa ảnh!');
  } catch (err) {
    console.error('[deleteInkImage]', err);
    showToast('Lỗi xóa ảnh: ' + (err.message || err), 'danger');
  }
}

// ═══════════════════════════════════════════════════════════
// ELECTRODE IMAGE
// ═══════════════════════════════════════════════════════════
export function showElectrodeImage(key) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const openModal = window.openModal;

  currentElectrodeImageKey = key;
  const r = cache.electrode[key];
  document.getElementById('electrode-image-title').textContent = `Ảnh điện cực: ${r.code} — ${r.material}`;
  const preview = document.getElementById('electrode-image-preview');
  const dropZone = document.getElementById('electrode-drop-zone');
  const delBtn = document.getElementById('electrode-image-delete');
  const locked = r.locked && !isAdmin;
  if (r.imageData) {
    preview.src = r.imageData;
    preview.style.display = 'block';
    dropZone.style.display = 'none';
    delBtn.style.display = locked ? 'none' : 'inline-flex';
  } else {
    preview.style.display = 'none';
    dropZone.style.display = locked ? 'none' : 'block';
    delBtn.style.display = 'none';
  }
  document.removeEventListener('paste', handleElectrodePaste);
  if (!locked) document.addEventListener('paste', handleElectrodePaste);
  openModal('modal-electrode-image');
}

export function handleElectrodePaste(e) {
  if (!currentElectrodeImageKey) return;
  const items = Array.from(e.clipboardData?.items || []);
  const imageItem = items.find(item => item.kind === 'file' && item.type.startsWith('image/'));
  if (!imageItem) return;
  processElectrodeImage(imageItem.getAsFile());
}

export function dropElectrodeImage(e) {
  e.preventDefault();
  document.getElementById('electrode-drop-zone').style.borderColor = 'var(--border)';
  document.getElementById('electrode-drop-zone').style.background = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) processElectrodeImage(file);
}

export function uploadElectrodeImage(input) {
  if (input.files[0]) processElectrodeImage(input.files[0]);
}

function processElectrodeImage(file) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  const r = cache.electrode[currentElectrodeImageKey];
  if (r?.locked && !isAdmin) { showToast('Điện cực đã khóa!'); return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const imageData = e.target.result;
    await update(ref(db, `electrode/${currentElectrodeImageKey}`), { imageData });
    document.getElementById('electrode-image-preview').src = imageData;
    document.getElementById('electrode-image-preview').style.display = 'block';
    document.getElementById('electrode-drop-zone').style.display = 'none';
    document.getElementById('electrode-image-delete').style.display = 'inline-flex';
    showToast('Đã lưu ảnh điện cực!');
  };
  reader.readAsDataURL(file);
}

export async function deleteElectrodeImage() {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  const r = cache.electrode[currentElectrodeImageKey];
  if (r?.locked && !isAdmin) { showToast('Điện cực đã khóa!'); return; }
  if (!confirm('Xóa ảnh điện cực?')) return;
  try {
    await update(ref(db, `electrode/${currentElectrodeImageKey}`), { imageData: null });
    const preview = document.getElementById('electrode-image-preview');
    const dropZone = document.getElementById('electrode-drop-zone');
    const delBtn = document.getElementById('electrode-image-delete');
    if (preview) preview.style.display = 'none';
    if (dropZone) dropZone.style.display = 'block';
    if (delBtn) delBtn.style.display = 'none';
    showToast('Đã xóa ảnh!');
  } catch (err) {
    console.error('[deleteElectrodeImage]', err);
    showToast('Lỗi xóa ảnh: ' + (err.message || err), 'danger');
  }
}

// ═══════════════════════════════════════════════════════════
// HYDRO IMAGE
// ═══════════════════════════════════════════════════════════
export function showHydroImage(key) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const openModal = window.openModal;

  currentHydroImageKey = key;
  const r = cache.hydro[key];
  document.getElementById('hydro-image-title').textContent = `Ảnh TN: ${r.code} — ${r.material}`;
  const preview = document.getElementById('hydro-image-preview');
  const dropZone = document.getElementById('hydro-drop-zone');
  const delBtn = document.getElementById('hydro-image-delete');
  const locked = r.locked && !isAdmin;
  if (r.imageData) {
    preview.src = r.imageData;
    preview.style.display = 'block';
    dropZone.style.display = 'none';
    delBtn.style.display = locked ? 'none' : 'inline-flex';
  } else {
    preview.style.display = 'none';
    dropZone.style.display = locked ? 'none' : 'block';
    delBtn.style.display = 'none';
  }
  document.removeEventListener('paste', handleHydroPaste);
  if (!locked) document.addEventListener('paste', handleHydroPaste);
  openModal('modal-hydro-image');
}

export function handleHydroPaste(e) {
  if (!currentHydroImageKey) return;
  const items = Array.from(e.clipboardData?.items || []);
  const imageItem = items.find(item => item.kind === 'file' && item.type.startsWith('image/'));
  if (!imageItem) return;
  processHydroImage(imageItem.getAsFile());
}

export function dropHydroImage(e) {
  e.preventDefault();
  document.getElementById('hydro-drop-zone').style.borderColor = 'var(--border)';
  document.getElementById('hydro-drop-zone').style.background = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) processHydroImage(file);
}

export function uploadHydroImage(input) {
  if (input.files[0]) processHydroImage(input.files[0]);
}

function processHydroImage(file) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  const r = cache.hydro[currentHydroImageKey];
  if (r?.locked && !isAdmin) { showToast('Thí nghiệm đã khóa!'); return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const imageData = e.target.result;
    await update(ref(db, `hydro/${currentHydroImageKey}`), { imageData });
    document.getElementById('hydro-image-preview').src = imageData;
    document.getElementById('hydro-image-preview').style.display = 'block';
    document.getElementById('hydro-drop-zone').style.display = 'none';
    document.getElementById('hydro-image-delete').style.display = 'inline-flex';
    showToast('Đã lưu ảnh thí nghiệm!');
  };
  reader.readAsDataURL(file);
}

export async function deleteHydroImage() {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  const r = cache.hydro[currentHydroImageKey];
  if (r?.locked && !isAdmin) { showToast('Thí nghiệm đã khóa!'); return; }
  if (!confirm('Xóa ảnh thí nghiệm?')) return;
  try {
    await update(ref(db, `hydro/${currentHydroImageKey}`), { imageData: null });
    const preview = document.getElementById('hydro-image-preview');
    const dropZone = document.getElementById('hydro-drop-zone');
    const delBtn = document.getElementById('hydro-image-delete');
    if (preview) preview.style.display = 'none';
    if (dropZone) dropZone.style.display = 'block';
    if (delBtn) delBtn.style.display = 'none';
    showToast('Đã xóa ảnh!');
  } catch (err) {
    console.error('[deleteHydroImage]', err);
    showToast('Lỗi xóa ảnh: ' + (err.message || err), 'danger');
  }
}

// ═══════════════════════════════════════════════════════════
// CHEMICAL IMAGE
// ═══════════════════════════════════════════════════════════
// Lưu ý: chemical dùng modal.dataset.key thay vì biến module-level
//        vì show và upload có thể chồng chéo.

export function showChemicalImage(key) {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;
  const openModal = window.openModal;

  const r = cache.chemicals[key];
  if (!r) return;
  if (!r.image) {
    if (!isAdmin) { showToast('Chưa có ảnh!', 'info'); return; }
  }
  document.getElementById('chemical-image-title').textContent = 'Ảnh — ' + r.name;
  const preview = document.getElementById('chemical-image-preview');
  const dropZone = document.getElementById('chemical-drop-zone');
  const deleteBtn = document.getElementById('chemical-image-delete');
  if (r.image) {
    preview.src = r.image;
    preview.style.display = 'block';
    dropZone.style.display = 'none';
    deleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  } else {
    preview.style.display = 'none';
    dropZone.style.display = 'block';
    deleteBtn.style.display = 'none';
  }
  document.getElementById('modal-chemical-image').dataset.key = key;
  openModal('modal-chemical-image');
}

// Drag-drop trực tiếp vào cell ảnh trong table chemicals (không qua modal)
export async function dropImageToCell(col, key, file) {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    await update(ref(db, col + '/' + key), { image: e.target.result });
    showToast('Đã lưu ảnh!', 'success');
  };
  reader.readAsDataURL(file);
}

export async function uploadChemicalImage(input) {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    const key = document.getElementById('modal-chemical-image').dataset.key;
    await update(ref(db, `chemicals/${key}`), { image: base64 });
    showToast('Đã lưu ảnh!', 'success');
    const preview = document.getElementById('chemical-image-preview');
    preview.src = base64;
    preview.style.display = 'block';
    document.getElementById('chemical-drop-zone').style.display = 'none';
    document.getElementById('chemical-image-delete').style.display = isAdmin ? 'inline-flex' : 'none';
  };
  reader.readAsDataURL(file);
}

export function dropChemicalImage(e) {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  e.preventDefault();
  if (!isAdmin) return;
  document.getElementById('chemical-drop-zone').style.borderColor = 'var(--border)';
  document.getElementById('chemical-drop-zone').style.background = '';
  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  uploadChemicalImage({ files: [file] });
}

export async function deleteChemicalImage() {
  const cache = window.cache;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  const key = document.getElementById('modal-chemical-image').dataset.key;
  const backup = cache.chemicals[key]?.image;
  await update(ref(db, `chemicals/${key}`), { image: null });
  document.getElementById('chemical-image-preview').src = '';
  document.getElementById('chemical-image-preview').style.display = 'none';
  document.getElementById('chemical-drop-zone').style.display = 'block';
  document.getElementById('chemical-image-delete').style.display = 'none';
  showToast('Đã xóa ảnh!', 'danger', async () => {
    await update(ref(db, `chemicals/${key}`), { image: backup });
    document.getElementById('chemical-image-preview').src = backup;
    document.getElementById('chemical-image-preview').style.display = 'block';
    document.getElementById('chemical-drop-zone').style.display = 'none';
    document.getElementById('chemical-image-delete').style.display = isAdmin ? 'inline-flex' : 'none';
    showToast('Đã hoàn tác!', 'success');
  });
}

// ═══════════════════════════════════════════════════════════
// EQUIPMENT IMAGE
// ═══════════════════════════════════════════════════════════
// Lưu ý: equipment dùng window.__eqImageBase64 (set ở Phần 7a) để chia sẻ
// state giữa preview (chưa save) và saveEquipment (đã tách).

export function previewEquipmentImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    window.__eqImageBase64 = e.target.result;
    document.getElementById('eq-image-preview').src = window.__eqImageBase64;
    document.getElementById('eq-image-preview').style.display = 'block';
    document.getElementById('eq-drop-zone').style.display = 'none';
    document.getElementById('eq-image-remove').style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
}

// Drag-drop trực tiếp vào cell ảnh trong table equipment (không qua modal)
export async function dropEquipmentImageToCell(col, key, file) {
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
  const showToast = window.showToast;

  if (!isAdmin) return;
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    await update(ref(db, col + '/' + key), { image: e.target.result });
    showToast('Đã lưu ảnh!', 'success');
  };
  reader.readAsDataURL(file);
}

export function dropEquipmentImage(e) {
  e.preventDefault();
  document.getElementById('eq-drop-zone').style.borderColor = 'var(--border)';
  document.getElementById('eq-drop-zone').style.background = '';
  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  previewEquipmentImage({ files: [file] });
}

export async function removeEquipmentImagePreview() {
  const cache = window.cache;
  const showToast = window.showToast;

  const editKey = document.getElementById('modal-equipment').dataset.editKey;
  const backup = editKey && cache.equipment[editKey]?.image;
  window.__eqImageBase64 = null;
  document.getElementById('eq-image-preview').src = '';
  document.getElementById('eq-image-preview').style.display = 'none';
  document.getElementById('eq-drop-zone').style.display = 'block';
  document.getElementById('eq-image-remove').style.display = 'none';
  document.getElementById('eq-image-input').value = '';
  if (editKey) {
    await update(ref(db, 'equipment/' + editKey), { image: null });
    showToast('Đã xóa ảnh!', 'danger', async () => {
      await update(ref(db, 'equipment/' + editKey), { image: backup });
      window.__eqImageBase64 = backup;
      document.getElementById('eq-image-preview').src = backup;
      document.getElementById('eq-image-preview').style.display = 'block';
      document.getElementById('eq-drop-zone').style.display = 'none';
      document.getElementById('eq-image-remove').style.display = 'inline-flex';
      showToast('Đã hoàn tác!', 'success');
    });
  }
}

export function showEquipmentImage(key) {
  const cache = window.cache;
  const showToast = window.showToast;

  const r = cache.equipment && cache.equipment[key];
  if (!r) return;
  if (!r.image) { showToast('Chưa có ảnh!', 'info'); return; }
  // editEquipment vẫn ở main.js, gọi qua window
  if (window.editEquipment) window.editEquipment(key);
}

// ═══════════════════════════════════════════════════════════
// 2 paste listeners document-level (chemical + equipment)
// Gắn 1 lần khi module được import
// ═══════════════════════════════════════════════════════════
let _pasteListenersAttached = false;
function attachPasteListeners() {
  if (_pasteListenersAttached) return;
  _pasteListenersAttached = true;

  // Ctrl+V paste vào modal chemical-image
  document.addEventListener('paste', (e) => {
    if (!document.getElementById('modal-chemical-image')?.classList.contains('open')) return;
    const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);
    if (!isAdmin) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        uploadChemicalImage({ files: [file] });
        break;
      }
    }
  });

  // Ctrl+V paste vào modal-equipment (đang tạo/sửa thiết bị)
  document.addEventListener('paste', function(e) {
    if (!document.getElementById('modal-equipment')?.classList.contains('open')) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        previewEquipmentImage({ files: [items[i].getAsFile()] });
        break;
      }
    }
  });
}
attachPasteListeners();
