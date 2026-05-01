/**
 * services/form-helpers.js
 * Form helpers + update <select> options từ cache data
 *
 * Phạm vi:
 *  - statusBadge: render status thành <span class="badge">
 *  - removeChem: xoá row chem trong modal Hydro/Ink
 *  - calcLoading: tính loading từ vol/conc/drops/area trong Electrode form
 *  - addChem: thêm row hoá chất vào modal Hydro
 *  - addInkRow: thêm row solid/liquid vào modal Ink
 *  - fillChem: fill MW khi chọn từ <select.chem-select>
 *  - fillInkFormula: fill conc/concCat khi chọn ink formula trong Electrode form
 *  - lookupCAS: tra mã CAS — đầu tiên cache local, sau đó PubChem API
 *  - getElectrodeMaterial: lấy material từ electrode code (cho renderElectrochem)
 *  - updateGroupSelects: update <select id="c-group"> khi cache.groups thay đổi
 *  - updatePersonSelects: update <select id="h-person/e-person/ec-person"> khi members thay đổi
 *  - updateInkSelects: update <select id="e-ink-formula"> khi ink thay đổi
 *  - updateChemSelects: update <select.chem-select> khi chemicals thay đổi
 *
 * Phụ thuộc:
 *  - cache qua window.cache
 *  - vals, escapeHtml từ utils/format.js
 *  - showToast qua window
 *
 * Lưu ý:
 *  - addChem TRƯỚC ĐÂY có 2 phiên bản declared trong main.js (line 452 + 553) — bug có sẵn
 *    Phiên bản 553 override 452 (hard-code "g; mL"). Sau khi tách, GIỮ phiên bản 553
 *    để giữ behavior hiện tại (production đang chạy cái này). Phiên bản 452 (smart unit) bị bỏ.
 *  - calcLoading được fillInkFormula gọi internal — export không cần expose lên window
 *    nhưng vẫn expose vì HTML có inline gọi
 *  - lookupCAS dùng PubChem API (public, hỗ trợ CORS) — fallback cache local trước
 */

import { vals, escapeHtml } from '../utils/format.js'

// ═══════════════════════════════════════════════════════════
// SIMPLE HELPERS
// ═══════════════════════════════════════════════════════════

// Render status badge HTML
export function statusBadge(s) {
  const map = {
    'Hoàn thành': 'success',
    'Đang thực hiện': 'warn',
    'Thất bại': 'danger',
    'Chờ phân tích': 'info',
    'Sẵn sàng đo': 'success',
    'Đang activation': 'warn',
    'Đang xử lý': 'info',
  };
  return `<span class="badge badge-${map[s] || 'gray'}">${s}</span>`;
}

// Xoá row chem trong modal (gọi từ HTML onclick)
export function removeChem(btn) {
  btn.closest('tr').remove();
}

// Tính loading mass cho electrode = vol * drops * conc / 1000 / area
export function calcLoading() {
  const vol = parseFloat(document.getElementById('e-vol').value) || 0;
  const drops = parseFloat(document.getElementById('e-drops').value) || 1;
  const area = parseFloat(document.getElementById('e-area').value) || 0.07;
  const conc = parseFloat(document.getElementById('e-conc').value) || 0;
  if (conc && vol && area) {
    document.getElementById('e-loading').value = (vol * drops * conc / 1000 / area).toFixed(3);
  }
}

// Lấy material từ electrode code (cho hiển thị trong renderElectrochem)
export function getElectrodeMaterial(electrodeCode) {
  const cache = window.cache;
  if (!electrodeCode || !cache) return '—';
  const el = vals(cache.electrode).find(e => e.code === electrodeCode);
  return el ? el.material : '—';
}

// ═══════════════════════════════════════════════════════════
// ADD ROW HELPERS — thêm row hoá chất vào modal table
// ═══════════════════════════════════════════════════════════

// Thêm row hoá chất vào modal Hydro (h-chem-tbody)
// Lưu ý: phiên bản này hard-code placeholder "g; mL" — giữ behavior hiện tại của production
export function addChem() {
  const tbody = document.getElementById('h-chem-tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `<td style="position:relative"><input type="text" class="chem-search" placeholder="Tìm hóa chất..." oninput="searchChem(this)" autocomplete="off"><div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div></td><td><input type="number" min="0" placeholder="M" class="chem-mw" readonly style="background:var(--surface-alt,var(--teal-light))"></td><td><input type="number" min="0" step="0.001" placeholder="g; mL" oninput="calcMol(this)"></td><td><input type="number" min="0" step="0.0001" readonly style="background:var(--surface-alt,var(--teal-light))"></td><td><button class="btn btn-xs btn-danger" onclick="removeChem(this)">✕</button></td>`;
  tbody.appendChild(tr);
}

// Thêm row vào modal Ink — solid (mass mg) hoặc liquid (vol μL)
export function addInkRow(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const isSolid = tbodyId === 'ink-solid-tbody';
  const tr = document.createElement('tr');
  if (isSolid) {
    tr.innerHTML = `<td style="position:relative"><input type="text" class="chem-search" placeholder="Tìm hóa chất..." oninput="searchChem(this)" autocomplete="off"><div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div></td><td><input type="number" class="chem-mw" placeholder="M" readonly style="background:var(--surface-alt,var(--teal-light))"></td><td><input type="number" min="0" step="0.01" placeholder="mg"></td><td><button class="btn btn-xs btn-danger" onclick="removeChem(this)">✕</button></td>`;
  } else {
    tr.innerHTML = `<td style="position:relative"><input type="text" class="chem-search" placeholder="Tìm dung môi..." oninput="searchChem(this)" autocomplete="off"><div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div></td><td><input type="number" min="0" step="1" placeholder="μL"></td><td><button class="btn btn-xs btn-danger" onclick="removeChem(this)">✕</button></td>`;
  }
  tbody.appendChild(tr);
}

// Fill MW khi user chọn từ <select.chem-select> (legacy native select)
export function fillChem(sel) {
  const opt = sel.options[sel.selectedIndex];
  const tr = sel.closest('tr');
  const mwInput = tr.querySelector('.chem-mw');
  if (mwInput) mwInput.value = opt.dataset.mw || '';
}

// Fill conc + concCat khi user chọn ink formula trong Electrode form
export function fillInkFormula() {
  const cache = window.cache;
  const key = document.getElementById('e-ink-formula').value;
  if (!key) return;
  const ink = cache.ink[key];
  if (!ink) return;

  const totalSolid = (ink.solids || []).reduce((s, c) => s + (c.mass || 0), 0);
  // Catalyst = solid trừ carbon-based (Vulcan, carbon black)
  const catalystSolid = (ink.solids || [])
    .filter(c => {
      const n = (c.name || '').toLowerCase();
      return !n.includes('carbon') && !n.includes('vulcan') && !n.includes('black');
    })
    .reduce((s, c) => s + (c.mass || 0), 0);
  const totalVol = ink.totalVol || 0;

  const conc = totalVol > 0 ? parseFloat((totalSolid / totalVol * 1000).toFixed(2)) : 0;
  const concCat = totalVol > 0 ? parseFloat((catalystSolid / totalVol * 1000).toFixed(2)) : 0;
  document.getElementById('e-conc').value = conc;
  document.getElementById('e-conc-cat').value = concCat;
  calcLoading();
}

// ═══════════════════════════════════════════════════════════
// CAS LOOKUP (PubChem API)
// ═══════════════════════════════════════════════════════════

// Tra mã CAS: cache local trước, PubChem API sau
export async function lookupCAS() {
  const cache = window.cache;
  const showToast = window.showToast;

  const rawCas = document.getElementById('c-cas').value.trim();
  if (!rawCas) { showToast('Nhập mã CAS trước!'); return; }

  // Chuẩn hoá CAS: thêm dấu - nếu chưa có (vd: 67641 → 67-64-1)
  function normalizeCAS(s) {
    s = s.replace(/[^0-9]/g, '');
    if (s.length < 3) return rawCas;
    const check = s.slice(-1);
    const mid = s.slice(-3, -1);
    const front = s.slice(0, -3);
    return front + '-' + mid + '-' + check;
  }
  const cas = rawCas.includes('-') ? rawCas : normalizeCAS(rawCas);
  document.getElementById('c-cas').value = cas;

  // Tra cache local trước
  const chems = vals(cache.chemicals);
  const existing = chems.find(c => c.cas === cas || c.cas === rawCas);
  if (existing) {
    document.getElementById('c-name').value = existing.name || '';
    document.getElementById('c-formula').value = existing.formula || '';
    document.getElementById('c-mw').value = existing.mw || '';
    document.getElementById('c-vendor').value = existing.vendor || '';
    document.getElementById('c-purity').value = existing.purity || '';
    showToast('Tìm thấy trong cơ sở dữ liệu nội bộ!');
    return;
  }

  // Tra PubChem (public API, hỗ trợ CORS)
  showToast('Đang tra cứu...');
  try {
    const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cas)}/property/IUPACName,MolecularFormula,MolecularWeight/JSON`);
    if (!res.ok) { showToast('Không tìm thấy mã CAS này!'); return; }
    const data = await res.json();
    const prop = data?.PropertyTable?.Properties?.[0];
    if (!prop) { showToast('Không tìm thấy mã CAS này!'); return; }
    document.getElementById('c-name').value = prop.IUPACName || '';
    document.getElementById('c-formula').value = prop.MolecularFormula || '';
    document.getElementById('c-mw').value = parseFloat(prop.MolecularWeight).toFixed(2);
    showToast('Tra cứu thành công!');
  } catch (e) {
    showToast('Lỗi kết nối — thử lại sau!');
  }
}

// ═══════════════════════════════════════════════════════════
// UPDATE <select> OPTIONS từ cache data
// ═══════════════════════════════════════════════════════════

// Update select#c-group khi cache.groups thay đổi
export function updateGroupSelects() {
  const cache = window.cache;
  if (!cache) return;
  const groups = vals(cache.groups).sort((a, b) => (a.order || 0) - (b.order || 0));
  const el = document.getElementById('c-group');
  if (!el) return;
  const cur = el.value;
  el.innerHTML = groups.map(g =>
    '<option value="' + g._key + '">' + g.name + '</option>'
  ).join('') + '<option value="">Khác</option>';
  el.value = cur;
  // Sync custom-select wrapper nếu đã init (qua makeCustomSelect ở Phần 8a)
  if (el._csBuildOptions) {
    el._csBuildOptions();
    if (el._csLabel) el._csLabel.textContent = el.options[el.selectedIndex]?.text || 'Khác';
  }
}

// Update <select id="h-person/e-person/ec-person"> với role short label
export function updatePersonSelects() {
  const cache = window.cache;
  if (!cache) return;
  const roleShort = {
    'Sinh viên đại học': 'SV',
    'Học viên cao học': 'CH',
    'NCS': 'NCS',
    'Nghiên cứu viên': 'NCV',
    'Giảng viên': 'GV',
  };
  const members = vals(cache.members).sort((a, b) => a.name.localeCompare(b.name));
  const opts = '<option value="">Chọn người thực hiện</option>' +
    members.map(m => {
      const short = roleShort[m.role] || m.role;
      return `<option value="${m.name}">${m.name} · ${short}</option>`;
    }).join('');
  ['h-person', 'e-person', 'ec-person'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = opts;
    el.value = cur;
  });
}

// Update <select id="e-ink-formula"> khi cache.ink thay đổi
export function updateInkSelects() {
  const cache = window.cache;
  if (!cache) return;
  const inks = vals(cache.ink || {}).sort((a, b) => a.code.localeCompare(b.code));
  const opts = '<option value="">Chọn công thức mực</option>' +
    inks.map(i => `<option value="${escapeHtml(i._key)}">${escapeHtml(i.code)}${i.name ? ' — ' + escapeHtml(i.name) : ''}</option>`).join('');
  const el = document.getElementById('e-ink-formula');
  if (!el) return;
  const cur = el.value;
  el.innerHTML = opts;
  el.value = cur;
  // Round 9 fix #33: rebuild custom-select UI nếu đã customized
  if (el.dataset.customized) {
    if (typeof el._csBuildOptions === 'function') el._csBuildOptions();
    if (el._csLabel) {
      const selectedOpt = el.options[el.selectedIndex];
      el._csLabel.textContent = selectedOpt ? selectedOpt.text : 'Chọn công thức mực';
    }
  }
}

// Update tất cả <select.chem-select> khi cache.chemicals thay đổi
export function updateChemSelects() {
  const cache = window.cache;
  if (!cache) return;
  const chems = vals(cache.chemicals);
  document.querySelectorAll('.chem-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- Chọn hóa chất --</option>' +
      chems.map(c => `<option value="${c._key}" data-formula="${c.formula}" data-mw="${c.mw}">${c.name} (${c.formula})</option>`).join('');
    sel.value = cur;
  });
}
