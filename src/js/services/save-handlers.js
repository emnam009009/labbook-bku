/**
 * services/save-handlers.js
 * 7 save handlers cho các collection: hydro, electrode, electrochem, member, ink, chemical, equipment
 *
 * Phụ thuộc:
 *  - cache qua window.cache
 *  - currentAuth, currentUser qua window.*
 *  - showToast, closeModal qua window.*
 *  - logHistory từ services/history-log.js (hoặc window.logHistory)
 *  - getPersonName từ utils/auth-helpers.js
 *  - vals từ utils/format.js
 *  - db, ref, update, fbPush từ firebase.js
 *  - updateDisplayName từ auth.js
 *  - devWarn qua window.devWarn
 *  - isAdmin qua window.isAdmin (cho saveInk lock check)
 *  - __eqImageBase64 qua window (cho saveEquipment, share với image-handlers ở 7b)
 *
 * Helper internal: isCodeDuplicate (kiểm tra mã trùng trong collection, bỏ qua editKey)
 */

import { db, ref, update, fbPush } from '../firebase.js'
import { vals } from '../utils/format.js'
import { getPersonName } from '../utils/auth-helpers.js'
import { logHistory } from './history-log.js'
import { updateDisplayName } from '../auth.js'

// ── Helper: kiểm tra mã trùng trong collection ───────────
function isCodeDuplicate(col, code, editKey = null) {
  const cache = window.cache;
  if (!cache) return false;
  return vals(cache[col]).some(r => r.code === code && r._key !== editKey);
}
// Expose để main.js (và saveChemical) gọi qua window
window.isCodeDuplicate = isCodeDuplicate;

// ───────────────────────────────────────────────────────────
// Save Hydro: với stock delta tracking (refund cũ + deduct mới)
// ───────────────────────────────────────────────────────────
export async function saveHydro() {
  const cache = window.cache;
  const currentAuth = window.currentAuth || {};
  const currentUser = window.currentUser || 'Khách';
  const showToast = window.showToast;
  const closeModal = window.closeModal;

  const modal = document.getElementById('modal-hydrothermal');
  const saveBtn = modal?.querySelector('.modal-footer .btn-primary');
  const oldLabel = saveBtn?.textContent;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }
  try {
    const editKey = modal.dataset.editKey;
    const r = {
      code: document.getElementById('h-code').value || `HT-${Date.now()}`,
      date: document.getElementById('h-date').value,
      person: getPersonName(),
      material: document.getElementById('h-material').value,
      temp: parseFloat(document.getElementById('h-temp').value) || 180,
      time: parseFloat(document.getElementById('h-time').value) || 24,
      ph: parseFloat(document.getElementById('h-ph').value) || 7,
      vol: parseFloat(document.getElementById('h-vol').value) || 50,
      rate: parseFloat(document.getElementById('h-rate').value) || 2,
      status: document.getElementById('h-status').value,
      note: document.getElementById('h-note').value,
      isSample: document.getElementById('h-is-sample').checked,
      createdAt: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      createdBy: currentUser,
      uid: currentAuth ? currentAuth.uid : null,
    };

    if (isCodeDuplicate('hydro', r.code, editKey)) {
      showToast('Mã thí nghiệm đã tồn tại!', 'danger');
      document.getElementById('h-code').style.borderColor = 'var(--danger)';
      return;
    }
    document.getElementById('h-code').style.borderColor = '';

    // Collect chemicals user entered
    const chemRows = document.querySelectorAll('#h-chem-tbody tr');
    const usedChems = [];
    for (const row of chemRows) {
      const inp = row.querySelector('.chem-search');
      const chemKey = inp?.dataset.chemKey;
      const mass = parseFloat(row.querySelectorAll('input')[2]?.value) || 0;
      if (chemKey && mass > 0) usedChems.push({ key: chemKey, mass });
    }
    r.usedChems = usedChems;

    // Compute net stock delta (refund old + deduct new)
    const oldRecord = editKey ? cache.hydro[editKey] : null;
    const oldUsed = (oldRecord && !oldRecord.isSample && Array.isArray(oldRecord.usedChems)) ? oldRecord.usedChems : [];
    const newUsed = !r.isSample ? usedChems : [];

    const delta = {};
    for (const oc of oldUsed) {
      if (!oc.key) continue;
      delta[oc.key] = (delta[oc.key] || 0) - parseFloat(oc.mass || 0);
    }
    for (const nc of newUsed) {
      if (!nc.key) continue;
      delta[nc.key] = (delta[nc.key] || 0) + parseFloat(nc.mass || 0);
    }

    const negativeWarnings = [];
    const stockUpdates = [];
    for (const [key, d] of Object.entries(delta)) {
      if (d === 0) continue;
      const cur = cache.chemicals[key];
      if (!cur) continue;
      const curStock = parseFloat(cur.stock || 0);
      const newStock = parseFloat((curStock - d).toFixed(3));
      if (newStock < 0) {
        negativeWarnings.push(`${cur.name}: tồn ${curStock}${cur.unit || 'g'}, cần ${d}${cur.unit || 'g'}`);
      }
      stockUpdates.push({ key, name: cur.name, unit: cur.unit || 'g', delta: d, newStock });
    }

    if (negativeWarnings.length > 0) {
      const msg = '⚠️ Không đủ tồn kho:\n' + negativeWarnings.join('\n') + '\n\nVẫn tiếp tục?';
      if (!confirm(msg)) return;
    }

    if (editKey) {
      await update(ref(db, `hydro/${editKey}`), r);
      await Promise.all(stockUpdates.map(u =>
        update(ref(db, `chemicals/${u.key}`), { stock: u.newStock })
      ));
      stockUpdates.forEach(u => {
        const sign = u.delta >= 0 ? '-' : '+';
        logHistory(`${u.delta >= 0 ? 'Trừ' : 'Hoàn'} tồn kho: ${u.name}`, `${sign}${Math.abs(u.delta)}${u.unit} (TN: ${r.code})`);
      });
      logHistory(`Sửa thí nghiệm: ${r.code}`, `${r.material}, ${r.temp} °C/${r.time}h`);
      delete modal.dataset.editKey;
      const titleEl = modal.querySelector('.modal-title');
      const btn = modal.querySelector('.btn-primary');
      if (titleEl) titleEl.textContent = 'Thêm thí nghiệm thủy nhiệt';
      if (btn) btn.textContent = 'Lưu thí nghiệm';
      closeModal('modal-hydrothermal');
      showToast('Đã cập nhật thí nghiệm!');
      return;
    }

    // New record path
    await fbPush('hydro', r);
    await Promise.all(stockUpdates.map(u =>
      update(ref(db, `chemicals/${u.key}`), { stock: u.newStock })
    ));
    stockUpdates.forEach(u => {
      logHistory(`Trừ tồn kho: ${u.name}`, `-${u.delta}${u.unit} (TN: ${r.code})`);
    });
    logHistory(`Thêm thí nghiệm: ${r.code}`, `Vật liệu: ${r.material}, ${r.temp} °C/${r.time}h`);
    closeModal('modal-hydrothermal');
    showToast('Đã lưu thí nghiệm!');
  } catch (err) {
    console.error('[saveHydro]', err);
    showToast('Lỗi lưu dữ liệu: ' + (err.message || err), 'danger');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = oldLabel || 'Lưu thí nghiệm'; }
  }
}

// ───────────────────────────────────────────────────────────
// Save Electrode: tính loading từ vol/conc/drops/area, deduct stock theo ink formula
// ───────────────────────────────────────────────────────────
export async function saveElectrode() {
  const cache = window.cache;
  const currentUser = window.currentUser || 'Khách';
  const showToast = window.showToast;
  const closeModal = window.closeModal;

  const modal = document.getElementById('modal-electrode');
  const saveBtn = modal?.querySelector('.modal-footer .btn-primary');
  const oldLabel = saveBtn?.textContent;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }
  try {
    const vol = parseFloat(document.getElementById('e-vol').value) || 10;
    const conc = parseFloat(document.getElementById('e-conc').value) || 0;
    const drops = parseFloat(document.getElementById('e-drops').value) || 1;
    const area = parseFloat(document.getElementById('e-area').value) || 0.07;
    const editKeyE = modal.dataset.editKey;

    const r = {
      concCat: parseFloat(document.getElementById('e-conc-cat').value) || 0,
      code: document.getElementById('e-code').value || `E-${Date.now()}`,
      date: document.getElementById('e-date').value,
      person: getPersonName(),
      material: document.getElementById('e-material').value,
      substrate: document.getElementById('e-substrate').value,
      inkFormula: document.getElementById('e-ink-formula').value,
      vol, conc, drops, area,
      loading: parseFloat((vol * drops * conc / 1000 / area).toFixed(3)),
      annealT: parseFloat(document.getElementById('e-anneal-t').value) || 60,
      annealH: parseFloat(document.getElementById('e-anneal-h').value) || 0.5,
      atm: document.getElementById('e-atm').value,
      activation: document.getElementById('e-activation').value,
      isSample: document.getElementById('e-is-sample').checked,
      status: 'Sẵn sàng đo',
      createdAt: new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      createdBy: currentUser,
    };

    if (isCodeDuplicate('electrode', r.code, editKeyE)) {
      showToast('Mã điện cực đã tồn tại!', 'danger');
      document.getElementById('e-code').style.borderColor = 'var(--danger)';
      return;
    }
    document.getElementById('e-code').style.borderColor = '';

    // Build usedInkChems từ ink formula đã chọn
    const inkKey = document.getElementById('e-ink-formula').value;
    const inkData = inkKey ? cache.ink[inkKey] : null;
    const usedInkChems = [];
    if (inkData && !r.isSample) {
      for (const s of (inkData.solids || [])) {
        usedInkChems.push({ key: s.key, mass: parseFloat((s.mass / 1000).toFixed(5)) });
      }
      for (const l of (inkData.liquids || [])) {
        usedInkChems.push({ key: l.key, mass: parseFloat((l.vol / 1000).toFixed(5)), unit: 'mL' });
      }
    }
    r.usedInkChems = usedInkChems;

    // Stock delta tính như saveHydro
    const oldRecord = editKeyE ? cache.electrode[editKeyE] : null;
    const oldUsed = (oldRecord && !oldRecord.isSample && Array.isArray(oldRecord.usedInkChems)) ? oldRecord.usedInkChems : [];
    const newUsed = !r.isSample ? usedInkChems : [];

    const delta = {};
    for (const oc of oldUsed) {
      if (!oc.key) continue;
      delta[oc.key] = (delta[oc.key] || 0) - parseFloat(oc.mass || 0);
    }
    for (const nc of newUsed) {
      if (!nc.key) continue;
      delta[nc.key] = (delta[nc.key] || 0) + parseFloat(nc.mass || 0);
    }

    const negativeWarnings = [];
    const stockUpdates = [];
    for (const [key, d] of Object.entries(delta)) {
      if (d === 0) continue;
      const cur = cache.chemicals[key];
      if (!cur) continue;
      const curStock = parseFloat(cur.stock || 0);
      const newStock = parseFloat((curStock - d).toFixed(5));
      if (newStock < 0) {
        negativeWarnings.push(`${cur.name}: tồn ${curStock}${cur.unit || 'g'}, cần ${d}${cur.unit || 'g'}`);
      }
      stockUpdates.push({ key, name: cur.name, unit: cur.unit || 'g', delta: d, newStock });
    }

    if (negativeWarnings.length > 0) {
      const msg = '⚠️ Không đủ tồn kho:\n' + negativeWarnings.join('\n') + '\n\nVẫn tiếp tục?';
      if (!confirm(msg)) return;
    }

    if (editKeyE) {
      await update(ref(db, `electrode/${editKeyE}`), r);
      await Promise.all(stockUpdates.map(u =>
        update(ref(db, `chemicals/${u.key}`), { stock: u.newStock })
      ));
      stockUpdates.forEach(u => {
        const sign = u.delta >= 0 ? '-' : '+';
        logHistory(`${u.delta >= 0 ? 'Trừ' : 'Hoàn'} tồn kho: ${u.name}`, `${sign}${Math.abs(u.delta)}${u.unit} (ĐC: ${r.code})`);
      });
      logHistory(`Sửa điện cực: ${r.code}`, `${r.material} / ${r.substrate}`);
      closeModal('modal-electrode');
      showToast('Đã cập nhật điện cực!');
      return;
    }

    await fbPush('electrode', r);
    await Promise.all(stockUpdates.map(u =>
      update(ref(db, `chemicals/${u.key}`), { stock: u.newStock })
    ));
    stockUpdates.forEach(u => {
      logHistory(`Trừ tồn kho: ${u.name}`, `-${u.delta}${u.unit} (ĐC: ${r.code})`);
    });
    logHistory(`Thêm điện cực: ${r.code}`, `${r.material} / ${r.substrate}, tải lượng: ${r.loading} mg/cm²`);
    closeModal('modal-electrode');
    showToast('Đã lưu điện cực!');
  } catch (err) {
    console.error('[saveElectrode]', err);
    showToast('Lỗi lưu dữ liệu: ' + (err.message || err), 'danger');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = oldLabel || 'Lưu điện cực'; }
  }
}

// ───────────────────────────────────────────────────────────
// Save Electrochem: validate electrode code phải tồn tại
// ───────────────────────────────────────────────────────────
export async function saveElectrochem() {
  const cache = window.cache;
  const currentUser = window.currentUser || 'Khách';
  const showToast = window.showToast;
  const closeModal = window.closeModal;

  try {
    const ecCode = document.getElementById('ec-electrode').value;
    const validCodes = vals(cache.electrode).map(e => e.code);
    if (!validCodes.includes(ecCode)) {
      showToast('Mã điện cực không hợp lệ! Vui lòng chọn từ danh sách.');
      document.getElementById('ec-electrode').style.borderColor = 'var(--danger)';
      return;
    }
    document.getElementById('ec-electrode').style.borderColor = '';

    const r = {
      code: document.getElementById('ec-code').value || `EC-${Date.now()}`,
      date: document.getElementById('ec-date').value,
      person: getPersonName(),
      electrode: document.getElementById('ec-electrode').value,
      type: document.getElementById('ec-type').value,
      reaction: document.getElementById('ec-reaction').value,
      electrolyte: document.getElementById('ec-electrolyte').value,
      re: document.getElementById('ec-re').value,
      ce: document.getElementById('ec-ce').value,
      inst: document.getElementById('ec-inst').value,
      estart: document.getElementById('ec-estart').value,
      eend: document.getElementById('ec-eend').value,
      rate: document.getElementById('ec-rate').value,
      ir: document.getElementById('ec-ir').value,
      eta10: document.getElementById('ec-eta10').value || null,
      tafel: document.getElementById('ec-tafel').value || null,
      j0: document.getElementById('ec-j0').value || null,
      rs: document.getElementById('ec-rs').value || null,
      rct: document.getElementById('ec-rct').value || null,
      ecsa: document.getElementById('ec-ecsa').value || null,
      status: 'Đang xử lý',
      createdAt: new Date().toLocaleDateString('vi-VN'),
      createdBy: currentUser,
    };

    const editKeyEC = document.getElementById('modal-electrochem').dataset.editKey;
    if (isCodeDuplicate('electrochem', r.code, editKeyEC)) {
      showToast('Mã phép đo đã tồn tại!');
      document.getElementById('ec-code').style.borderColor = 'var(--danger)';
      return;
    }
    document.getElementById('ec-code').style.borderColor = '';

    if (editKeyEC) {
      await update(ref(db, `electrochem/${editKeyEC}`), r);
      logHistory(`Sửa phép đo: ${r.code}`, `${r.type} / ${r.reaction}`);
      closeModal('modal-electrochem');
      showToast('Đã cập nhật phép đo!');
      return;
    }
    await fbPush('electrochem', r);
    logHistory(`Thêm phép đo: ${r.code}`, `${r.type} / ${r.reaction}, η@10=${r.eta10 || '—'} mV`);
    closeModal('modal-electrochem');
    showToast('Đã lưu phép đo!');
  } catch (err) {
    console.error('[saveElectrochem]', err);
    showToast('Lỗi lưu dữ liệu: ' + (err.message || err), 'danger');
  }
}

// ───────────────────────────────────────────────────────────
// Save Member: nếu sửa chính mình thì sync displayName lên Firebase Auth
// ───────────────────────────────────────────────────────────
export async function saveMember() {
  const cache = window.cache;
  const currentAuth = window.currentAuth || {};
  const showToast = window.showToast;
  const closeModal = window.closeModal;
  const devWarn = window.devWarn || (() => {});

  const r = {
    name: document.getElementById('m-name').value,
    role: document.getElementById('m-role').value,
    year: document.getElementById('m-year').value,
    studentId: document.getElementById('m-id').value,
    email: document.getElementById('m-email').value,
    phone: document.getElementById('m-phone').value,
    topic: document.getElementById('m-topic').value,
    program: document.getElementById('m-program')?.value || '',
    updatedAt: new Date().toLocaleDateString('vi-VN'),
  };

  const editKey = document.getElementById('modal-member').dataset.editKey;
  if (editKey) {
    await update(ref(db, `members/${editKey}`), r);

    // Sync tên lên Firebase Auth + users DB
    const memberData = cache.members[editKey];
    if (memberData && memberData.uid) {
      try {
        await update(ref(db, 'users/' + memberData.uid), { displayName: r.name });
      } catch (e) { devWarn('sync users DB:', e); }

      // Nếu đang sửa chính mình → sync Firebase Auth + UI
      if (memberData.uid === currentAuth.uid && r.name !== currentAuth.displayName) {
        try {
          await updateDisplayName(r.name);
          window.currentUser = r.name;
          currentAuth.displayName = r.name;
          const ud = document.getElementById('user-display');
          if (ud) ud.textContent = r.name;
          const mn = document.getElementById('menu-name');
          if (mn && mn.childNodes[0]) mn.childNodes[0].textContent = r.name;
        } catch (e) { devWarn('updateDisplayName:', e); }
      }
    }

    logHistory(`Sửa thành viên: ${r.name}`, r.role);
    delete document.getElementById('modal-member').dataset.editKey;
    document.querySelector('#modal-member .modal-title').textContent = 'Thêm thành viên';
    document.querySelector('#modal-member .btn-primary').textContent = 'Lưu';
    closeModal('modal-member');
    showToast('Đã cập nhật thành viên!');
    return;
  }
  r.createdAt = new Date().toISOString();
  r.createdBy = window.currentUser || 'Khách';
  await fbPush('members', r);
  logHistory(`Thêm thành viên: ${r.name}`, r.role);
  closeModal('modal-member');
  showToast('Đã thêm thành viên!');
}

// ───────────────────────────────────────────────────────────
// Save Ink: validate stock + lock check
// ───────────────────────────────────────────────────────────
export async function saveInk() {
  const cache = window.cache;
  const currentUser = window.currentUser || 'Khách';
  const showToast = window.showToast;
  const closeModal = window.closeModal;
  const isAdmin = !!(window.isAdmin || window.currentAuth?.isAdmin);

  try {
    const inkEditKey = document.getElementById('modal-ink').dataset.editKey;
    if (inkEditKey && cache.ink && cache.ink[inkEditKey] && cache.ink[inkEditKey].locked && !isAdmin) {
      showToast('Công thức đã bị khóa — chỉ admin mới sửa được!');
      return;
    }

    const code = document.getElementById('ink-code').value || `INK-${Date.now()}`;
    const solids = [];
    document.querySelectorAll('#ink-solid-tbody tr').forEach(row => {
      const inp = row.querySelector('.chem-search');
      const chemKey = inp?.dataset.chemKey;
      const mass = parseFloat(row.querySelectorAll('input')[2]?.value) || 0;
      if (chemKey && mass > 0) solids.push({ key: chemKey, name: inp.value, mass });
    });
    const liquids = [];
    document.querySelectorAll('#ink-liquid-tbody tr').forEach(row => {
      const inp = row.querySelector('.chem-search');
      const chemKey = inp?.dataset.chemKey;
      const vol = parseFloat(row.querySelectorAll('input')[1]?.value) || 0;
      if (chemKey && vol > 0) liquids.push({ key: chemKey, name: inp.value, vol });
    });
    const totalVol = liquids.reduce((s, l) => s + l.vol, 0);

    const r = {
      code,
      name: document.getElementById('ink-name').value,
      material: document.getElementById('ink-material').value,
      doi: document.getElementById('ink-doi').value,
      solids, liquids, totalVol,
      note: document.getElementById('ink-note').value,
      createdAt: new Date().toLocaleDateString('vi-VN'),
      createdBy: currentUser,
    };

    // Validate stock — cảnh báo nếu thiếu (ink formula KHÔNG trừ kho thật, chỉ warn)
    {
      const lowStock = [];
      for (const s of solids) {
        const cur = cache.chemicals[s.key];
        if (!cur) continue;
        const needGram = parseFloat((s.mass / 1000).toFixed(5));
        const stockGram = parseFloat(cur.stock || 0);
        if (needGram > stockGram) {
          lowStock.push(`${cur.name}: cần ${needGram}g, tồn ${stockGram}${cur.unit || 'g'}`);
        }
      }
      for (const l of liquids) {
        const cur = cache.chemicals[l.key];
        if (!cur) continue;
        const needMl = parseFloat((l.vol / 1000).toFixed(5));
        const stockVal = parseFloat(cur.stock || 0);
        if (needMl > stockVal) {
          lowStock.push(`${cur.name}: cần ${needMl}mL, tồn ${stockVal}${cur.unit || 'mL'}`);
        }
      }
      if (lowStock.length > 0) {
        const msg = '⚠️ Tồn kho không đủ cho công thức này:\n' + lowStock.join('\n') +
                    '\n\nLưu ý: tồn kho chỉ bị trừ khi tạo điện cực thật.\nVẫn lưu công thức?';
        if (!confirm(msg)) return;
      }
    }

    if (inkEditKey) {
      if (isCodeDuplicate('ink', code, inkEditKey)) {
        showToast('Mã công thức mực đã tồn tại!');
        document.getElementById('ink-code').style.borderColor = 'var(--danger)';
        return;
      }
      document.getElementById('ink-code').style.borderColor = '';
      await update(ref(db, `ink/${inkEditKey}`), r);
      logHistory(`Sửa công thức mực: ${code}`, r.material);
      delete document.getElementById('modal-ink').dataset.editKey;
      document.querySelector('#modal-ink .modal-title').textContent = 'Thiết lập công thức mực';
      document.querySelector('#modal-ink .btn-primary').textContent = 'Lưu công thức';
      closeModal('modal-ink');
      showToast('Đã cập nhật công thức mực!');
      return;
    }
    await fbPush('ink', r);
    logHistory(`Thêm công thức mực: ${code}`, `${r.material}`);
    closeModal('modal-ink');
    showToast('Đã lưu công thức mực!');
  } catch (err) {
    console.error('[saveInk]', err);
    showToast('Lỗi lưu dữ liệu: ' + (err.message || err), 'danger');
  }
}

// ───────────────────────────────────────────────────────────
// Save Chemical: validate CAS không trùng
// ───────────────────────────────────────────────────────────
export async function saveChemical() {
  const cache = window.cache;
  const currentUser = window.currentUser || 'Khách';
  const showToast = window.showToast;
  const closeModal = window.closeModal;

  try {
    const editKey = document.getElementById('modal-chemical').dataset.editKey;
    if (!document.getElementById('c-name').value.trim()) {
      showToast('Vui lòng nhập tên hoá chất!', 'danger');
      return;
    }

    const r = {
      name: document.getElementById('c-name').value,
      formula: document.getElementById('c-formula').value,
      mw: parseFloat(document.getElementById('c-mw').value),
      vendor: document.getElementById('c-vendor').value,
      purity: parseFloat(document.getElementById('c-purity').value),
      stock: parseFloat(document.getElementById('c-stock').value),
      alert: parseFloat(document.getElementById('c-alert').value) || 10,
      unit: document.getElementById('c-unit').value,
      cas: document.getElementById('c-cas').value,
      location: document.getElementById('c-location').value,
      group: document.getElementById('c-group') ? document.getElementById('c-group').value : '',
      qty: parseFloat(document.getElementById('c-qty') ? document.getElementById('c-qty').value : 1) || 1,
      updatedAt: new Date().toLocaleDateString('vi-VN'),
      updatedBy: currentUser,
    };

    if (r.cas) {
      const duplicate = vals(cache.chemicals).find(c =>
        c.cas === r.cas && c._key !== editKey
      );
      if (duplicate) {
        showToast('Mã CAS ' + r.cas + ' đã tồn tại (' + duplicate.name + ')!', 'danger');
        return;
      }
    }

    if (editKey) {
      await update(ref(db, `chemicals/${editKey}`), r);
      logHistory(`Sửa hóa chất: ${r.formula}`, `Tồn kho: ${r.stock}g`);
      delete document.getElementById('modal-chemical').dataset.editKey;
      document.querySelector('#modal-chemical .modal-title').textContent = 'Thêm hóa chất';
      document.querySelector('#modal-chemical .btn-primary').textContent = 'Tra cứu';
      showToast('Đã cập nhật hóa chất!');
    } else {
      r.createdAt = new Date().toISOString();
      r.createdBy = currentUser;
      await fbPush('chemicals', r);
      logHistory(`Thêm hóa chất: ${r.formula}`, `Tồn kho: ${r.stock}g`);
      showToast('Đã lưu hóa chất!');
    }
    closeModal('modal-chemical');
  } catch (err) {
    console.error('saveChemical error:', err);
    showToast('Lỗi: ' + err.message, 'danger');
  }
}

// ───────────────────────────────────────────────────────────
// Save Equipment: dùng __eqImageBase64 share với image-handlers
// ───────────────────────────────────────────────────────────
export async function saveEquipment() {
  const currentUser = window.currentUser || 'Khách';
  const showToast = window.showToast;
  const closeModal = window.closeModal;

  try {
    const editKey = document.getElementById('modal-equipment').dataset.editKey;
    const r = {
      name: document.getElementById('eq-name').value.trim(),
      model: document.getElementById('eq-model').value.trim(),
      serial: document.getElementById('eq-serial').value.trim(),
      vendor: document.getElementById('eq-vendor').value.trim(),
      group: document.getElementById('eq-group') ? document.getElementById('eq-group').value : '',
      location: document.getElementById('eq-location').value,
      date: new Date().toISOString(),
      qty: parseFloat(document.getElementById('eq-qty') ? document.getElementById('eq-qty').value : 1) || 1,
      status: document.getElementById('eq-status').value,
      updatedAt: new Date().toLocaleDateString('vi-VN'),
      updatedBy: currentUser,
    };
    if (!r.name) { showToast('Vui lòng nhập tên thiết bị!'); return; }

    // __eqImageBase64 được set bởi previewEquipmentImage (vẫn ở main.js đến Phần 7b)
    if (window.__eqImageBase64) r.image = window.__eqImageBase64;

    if (editKey) {
      await update(ref(db, 'equipment/' + editKey), r);
      logHistory('Sửa thiết bị: ' + r.name, r.status);
      delete document.getElementById('modal-equipment').dataset.editKey;
      document.querySelector('#modal-equipment .modal-title').textContent = 'Thêm thiết bị';
      document.querySelector('#modal-equipment .btn-primary').textContent = 'Lưu';
      showToast('Đã cập nhật thiết bị!');
    } else {
      r.createdAt = new Date().toISOString();
      r.createdBy = currentUser;
      await fbPush('equipment', r);
      logHistory('Thêm thiết bị: ' + r.name, r.status);
      showToast('Đã lưu thiết bị!');
    }
    closeModal('modal-equipment');
    window.__eqImageBase64 = null;
  } catch (err) {
    console.error('[saveEquipment]', err);
    showToast('Lỗi lưu dữ liệu: ' + (err.message || err), 'danger');
  }
}
