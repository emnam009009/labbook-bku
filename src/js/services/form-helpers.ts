/**
 * services/form-helpers.ts
 * Form helpers + update <select> options tu cache data
 */

import { vals, escapeHtml } from '../utils/format.js'

// ═══════════════════════════════════════════════════════════
// SIMPLE HELPERS
// ═══════════════════════════════════════════════════════════

// Render status badge HTML
export function statusBadge(s: string): string {
  const map: Record<string, string> = {
    'Hoan thanh': 'success',
    'Dang thuc hien': 'warn',
    'That bai': 'danger',
    'Cho phan tich': 'info',
    'San sang do': 'success',
    'Dang activation': 'warn',
    'Dang xu ly': 'info',
  };
  return `<span class="badge badge-${map[s] || 'gray'}">${s}</span>`;
}

// Xoa row chem trong modal (goi tu HTML onclick)
export function removeChem(btn: HTMLElement): void {
  btn.closest('tr')?.remove();
}

// Tinh loading mass cho electrode = vol * drops * conc / 1000 / area
export function calcLoading(): void {
  const vol = parseFloat((document.getElementById('e-vol') as HTMLInputElement)?.value) || 0;
  const drops = parseFloat((document.getElementById('e-drops') as HTMLInputElement)?.value) || 1;
  const area = parseFloat((document.getElementById('e-area') as HTMLInputElement)?.value) || 0.07;
  const conc = parseFloat((document.getElementById('e-conc') as HTMLInputElement)?.value) || 0;
  if (conc && vol && area) {
    (document.getElementById('e-loading') as HTMLInputElement).value = (vol * drops * conc / 1000 / area).toFixed(3);
  }
}

// Lay material tu electrode code (cho hien thi trong renderElectrochem)
export function getElectrodeMaterial(electrodeCode: string): string {
  const cache = window.cache as any;
  if (!electrodeCode || !cache) return '—';
  const el = vals(cache.electrode).find((e: any) => e.code === electrodeCode) as any;
  return el ? el.material : '—';
}

// ═══════════════════════════════════════════════════════════
// ADD ROW HELPERS — them row hoa chat vao modal table
// ═══════════════════════════════════════════════════════════

// Them row hoa chat vao modal Hydro (h-chem-tbody)
export function addChem(): void {
  const tbody = document.getElementById('h-chem-tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `<td style="position:relative"><input type="text" class="chem-search" placeholder="Tim hoa chat..." data-form-action="search-chem" autocomplete="off"><div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div></td><td><input type="number" min="0" placeholder="M" class="chem-mw" readonly style="background:var(--surface-alt,var(--teal-light))"></td><td><input type="number" min="0" step="0.001" placeholder="g; mL" data-form-action="calc-mol"></td><td><input type="number" min="0" step="0.0001" readonly style="background:var(--surface-alt,var(--teal-light))"></td><td><button class="btn btn-xs btn-danger" data-form-action="remove-chem">x</button></td>`;
  tbody.appendChild(tr);
}

// Them row vao modal Ink — solid (mass mg) hoac liquid (vol uL)
export function addInkRow(tbodyId: string): void {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const isSolid = tbodyId === 'ink-solid-tbody';
  const tr = document.createElement('tr');
  if (isSolid) {
    tr.innerHTML = `<td style="position:relative"><input type="text" class="chem-search" placeholder="Tim hoa chat..." data-form-action="search-chem" autocomplete="off"><div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div></td><td><input type="number" class="chem-mw" placeholder="M" readonly style="background:var(--surface-alt,var(--teal-light))"></td><td><input type="number" min="0" step="0.01" placeholder="mg"></td><td><button class="btn btn-xs btn-danger" data-form-action="remove-chem">x</button></td>`;
  } else {
    tr.innerHTML = `<td style="position:relative"><input type="text" class="chem-search" placeholder="Tim dung moi..." data-form-action="search-chem" autocomplete="off"><div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div></td><td><input type="number" min="0" step="1" placeholder="uL"></td><td><button class="btn btn-xs btn-danger" data-form-action="remove-chem">x</button></td>`;
  }
  tbody.appendChild(tr);
}

// Fill MW khi user chon tu <select.chem-select> (legacy native select)
export function fillChem(sel: HTMLSelectElement): void {
  const opt = sel.options[sel.selectedIndex] as HTMLOptionElement;
  const tr = sel.closest('tr');
  const mwInput = tr?.querySelector('.chem-mw') as HTMLInputElement | null;
  if (mwInput) mwInput.value = opt.dataset.mw || '';
}

// Fill conc + concCat khi user chon ink formula trong Electrode form
export function fillInkFormula(): void {
  const cache = window.cache as any;
  const key = (document.getElementById('e-ink-formula') as HTMLInputElement)?.value;
  if (!key) return;
  const ink = cache.ink[key];
  if (!ink) return;

  const totalSolid = (ink.solids || []).reduce((s: number, c: any) => s + (c.mass || 0), 0);
  // Catalyst = solid tru carbon-based (Vulcan, carbon black)
  const catalystSolid = (ink.solids || [])
    .filter((c: any) => {
      const n = (c.name || '').toLowerCase();
      return !n.includes('carbon') && !n.includes('vulcan') && !n.includes('black');
    })
    .reduce((s: number, c: any) => s + (c.mass || 0), 0);
  const totalVol = ink.totalVol || 0;

  const conc = totalVol > 0 ? parseFloat((totalSolid / totalVol * 1000).toFixed(2)) : 0;
  const concCat = totalVol > 0 ? parseFloat((catalystSolid / totalVol * 1000).toFixed(2)) : 0;
  (document.getElementById('e-conc') as HTMLInputElement).value = String(conc);
  (document.getElementById('e-conc-cat') as HTMLInputElement).value = String(concCat);
  calcLoading();
}

// ═══════════════════════════════════════════════════════════
// CAS LOOKUP (PubChem API)
// ═══════════════════════════════════════════════════════════

// Tra ma CAS: cache local truoc, PubChem API sau
export async function lookupCAS(): Promise<void> {
  const cache = window.cache as any;
  const showToast = window.showToast as any;

  const rawCas = (document.getElementById('c-cas') as HTMLInputElement).value.trim();
  if (!rawCas) { showToast('Nhap ma CAS truoc!'); return; }

  // Chuan hoa CAS: them dau - neu chua co (vd: 67641 -> 67-64-1)
  function normalizeCAS(s: string): string {
    s = s.replace(/[^0-9]/g, '');
    if (s.length < 3) return rawCas;
    const check = s.slice(-1);
    const mid = s.slice(-3, -1);
    const front = s.slice(0, -3);
    return front + '-' + mid + '-' + check;
  }
  const cas = rawCas.includes('-') ? rawCas : normalizeCAS(rawCas);
  (document.getElementById('c-cas') as HTMLInputElement).value = cas;

  // Tra cache local truoc
  const chems = vals(cache.chemicals);
  const existing = chems.find((c: any) => c.cas === cas || c.cas === rawCas) as any;
  if (existing) {
    (document.getElementById('c-name') as HTMLInputElement).value = existing.name || '';
    (document.getElementById('c-formula') as HTMLInputElement).value = existing.formula || '';
    (document.getElementById('c-mw') as HTMLInputElement).value = existing.mw || '';
    (document.getElementById('c-vendor') as HTMLInputElement).value = existing.vendor || '';
    (document.getElementById('c-purity') as HTMLInputElement).value = existing.purity || '';
    showToast('Tim thay trong co so du lieu noi bo!');
    return;
  }

  // Tra PubChem (public API, ho tro CORS)
  showToast('Dang tra cuu...');
  try {
    const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cas)}/property/IUPACName,MolecularFormula,MolecularWeight/JSON`);
    if (!res.ok) { showToast('Khong tim thay ma CAS nay!'); return; }
    const data = await res.json();
    const prop = data?.PropertyTable?.Properties?.[0];
    if (!prop) { showToast('Khong tim thay ma CAS nay!'); return; }
    (document.getElementById('c-name') as HTMLInputElement).value = prop.IUPACName || '';
    (document.getElementById('c-formula') as HTMLInputElement).value = prop.MolecularFormula || '';
    (document.getElementById('c-mw') as HTMLInputElement).value = parseFloat(prop.MolecularWeight).toFixed(2);
    showToast('Tra cuu thanh cong!');
  } catch (e) {
    showToast('Loi ket noi — thu lai sau!');
  }
}

// ═══════════════════════════════════════════════════════════
// UPDATE <select> OPTIONS tu cache data
// ═══════════════════════════════════════════════════════════

// Update select#c-group khi cache.groups thay doi
export function updateGroupSelects(): void {
  const cache = window.cache as any;
  if (!cache) return;
  const groups = vals(cache.groups).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  const el = document.getElementById('c-group') as HTMLSelectElement | null;
  if (!el) return;
  const cur = el.value;
  el.innerHTML = groups.map((g: any) =>
    '<option value="' + g._key + '">' + g.name + '</option>'
  ).join('') + '<option value="">Khac</option>';
  el.value = cur;
  // Sync custom-select wrapper neu da init (qua makeCustomSelect o Phan 8a)
  if ((el as any)._csBuildOptions) {
    (el as any)._csBuildOptions();
    if ((el as any)._csLabel) (el as any)._csLabel.textContent = el.options[el.selectedIndex]?.text || 'Khac';
  }
}

// Update <select id="h-person/e-person/ec-person"> voi role short label
export function updatePersonSelects(): void {
  const cache = window.cache as any;
  if (!cache) return;
  const roleShort: Record<string, string> = {
    'Sinh vien dai hoc': 'SV',
    'Hoc vien cao hoc': 'CH',
    'NCS': 'NCS',
    'Nghien cuu vien': 'NCV',
    'Giang vien': 'GV',
  };
  const members = vals(cache.members).sort((a: any, b: any) => a.name.localeCompare(b.name));
  const opts = '<option value="">Chon nguoi thuc hien</option>' +
    members.map((m: any) => {
      const short = roleShort[m.role] || m.role;
      return `<option value="${m.name}">${m.name} - ${short}</option>`;
    }).join('');
  ['h-person', 'e-person', 'ec-person'].forEach(id => {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    if (!el) return;
    const cur = el.value;
    el.innerHTML = opts;
    el.value = cur;
  });
}

// Update <select id="e-ink-formula"> khi cache.ink thay doi
export function updateInkSelects(): void {
  const cache = window.cache as any;
  if (!cache) return;
  const inks = vals(cache.ink || {}).sort((a: any, b: any) => a.code.localeCompare(b.code));
  const opts = '<option value="">Chon cong thuc muc</option>' +
    inks.map((i: any) => `<option value="${escapeHtml(i._key)}">${escapeHtml(i.code)}${i.name ? ' - ' + escapeHtml(i.name) : ''}</option>`).join('');
  const el = document.getElementById('e-ink-formula') as HTMLSelectElement | null;
  if (!el) return;
  const cur = el.value;
  el.innerHTML = opts;
  el.value = cur;
  // Round 9 fix #33: rebuild custom-select UI neu da customized
  if (el.dataset.customized) {
    if (typeof (el as any)._csBuildOptions === 'function') (el as any)._csBuildOptions();
    if ((el as any)._csLabel) {
      const selectedOpt = el.options[el.selectedIndex];
      (el as any)._csLabel.textContent = selectedOpt ? selectedOpt.text : 'Chon cong thuc muc';
    }
  }
}

// Update tat ca <select.chem-select> khi cache.chemicals thay doi
export function updateChemSelects(): void {
  const cache = window.cache as any;
  if (!cache) return;
  const chems = vals(cache.chemicals);
  document.querySelectorAll<HTMLSelectElement>('.chem-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- Chon hoa chat --</option>' +
      chems.map((c: any) => `<option value="${c._key}" data-formula="${c.formula}" data-mw="${c.mw}">${c.name} (${c.formula})</option>`).join('');
    sel.value = cur;
  });
}

// ─── Round 70: GLOBAL form delegation (chem search/calc/remove) ────────────
// Used by form-helpers + edit-handlers. Single listener on body.
function attachFormDelegation(): void {
  const flag = '__formDelegationAttached';
  if ((document.body as any)[flag]) return;
  (document.body as any)[flag] = true;

  // Click for buttons (remove-chem)
  document.body.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-form-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.formAction;
    if (action === 'remove-chem') {
      if (typeof (window as any).removeChem === 'function') {
        (window as any).removeChem(target);
      }
    }
  });

  // Input for live-typing inputs (search-chem + calc-mol)
  document.body.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLElement;
    if (!target || !target.dataset.formAction) return;
    const action = target.dataset.formAction;
    if (action === 'search-chem') {
      if (typeof (window as any).searchChem === 'function') {
        (window as any).searchChem(target);
      }
    } else if (action === 'calc-mol') {
      if (typeof (window as any).calcMol === 'function') {
        (window as any).calcMol(target);
      }
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachFormDelegation);
  } else {
    attachFormDelegation();
  }
}
