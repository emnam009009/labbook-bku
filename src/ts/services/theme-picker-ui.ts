// services/theme-picker-ui.ts — Custom theme picker UI
// Modal popup voi 4 HSL spectrum pickers + live preview + Apply/Reset

import {
  applyCustomTheme,
  applyTheme,
  getCustomTheme,
  getCurrentTheme,
  generateShades,
  hexToHsl,
  hslToHex,
  resetTheme
} from './theme.js';

let modalEl: HTMLElement | null = null;
let originalVars: Record<string, string> | null = null;  // backup de cancel

interface VarLabel {
  label: string;
  desc: string;
}

const VAR_LABELS: Record<string, VarLabel> = {
  '--teal':       { label: 'Mau chinh',     desc: 'Buttons, sidebar active, accent' },
  '--teal-2':     { label: 'Mau hover',     desc: 'Hover states, gradient 2nd' },
  '--teal-3':     { label: 'Mau sang',      desc: 'Borders, gradient endpoint' },
  '--teal-light': { label: 'Nen nhat',      desc: 'Hover row, badge background' },
};

const VAR_KEYS = ['--teal', '--teal-2', '--teal-3', '--teal-light'];

/**
 * Mo modal custom theme picker
 */
export function openCustomThemePicker(): void {
  // Backup current vars
  originalVars = {};
  VAR_KEYS.forEach(k => {
    originalVars![k] = getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  });

  // Init values: neu dang custom dung saved, ko thi lay current computed
  const saved = getCustomTheme();
  const initVars: Record<string, string> = saved || { ...originalVars };

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'tp-modal-overlay open';
  modalEl.innerHTML = renderModal(initVars);
  document.body.appendChild(modalEl);

  // Bind events
  bindEvents(initVars);
}

function renderModal(initVars: Record<string, string>): string {
  const pickers = VAR_KEYS.map(key => renderPicker(key, initVars[key])).join('');
  return `
    <div class="tp-modal" data-tp-action="stop">
      <div class="tp-modal-header">
        <div class="tp-modal-title">Tuy chinh mau giao dien</div>
        <button class="tp-modal-close" data-tp-action="close">x</button>
      </div>

      <div class="tp-pickers">
        ${pickers}
      </div>

      <div class="tp-actions-row">
        <button class="tp-btn-auto" data-tp-action="auto-gen">
          Tu sinh tu mau chinh
        </button>
        <span class="tp-hint">Doi mau chinh -> tu sinh 3 mau phu hai hoa</span>
      </div>

      <div class="tp-preview">
        <div class="tp-preview-title">Xem truoc</div>
        <div class="tp-preview-content">
          <button class="btn btn-primary" style="background: var(--teal); border-color: var(--teal); color:white;">Nut chinh</button>
          <button class="btn" style="background: var(--teal-light); color: var(--teal); border:1px solid var(--teal-3);">Badge</button>
          <div style="background: linear-gradient(135deg, var(--teal), var(--teal-2)); width:48px; height:24px; border-radius:6px;"></div>
          <div style="background: var(--teal-light); padding:6px 12px; border-radius:6px; font-size:12px; color: var(--teal);">Hover row</div>
        </div>
      </div>

      <div class="tp-modal-footer">
        <button class="btn" data-tp-action="reset">Reset ve teal</button>
        <button class="btn" data-tp-action="cancel">Huy</button>
        <button class="btn btn-primary" data-tp-action="apply">Ap dung</button>
      </div>
    </div>
  `;
}

function renderPicker(varKey: string, currentHex: string): string {
  const meta = VAR_LABELS[varKey];
  const hsl = hexToHsl(currentHex);
  return `
    <div class="tp-picker" data-var="${varKey}">
      <div class="tp-picker-head">
        <div class="tp-swatch" data-swatch style="background:${currentHex}"></div>
        <div class="tp-picker-info">
          <div class="tp-picker-label">${meta.label}</div>
          <div class="tp-picker-desc">${meta.desc}</div>
        </div>
        <input type="text" class="tp-hex-input" data-hex value="${currentHex}" maxlength="7" />
      </div>

      <div class="tp-spectrum-wrap">
        <div class="tp-hue-bar" data-hue-bar>
          <div class="tp-hue-thumb" data-hue-thumb style="left:${(hsl.h / 360) * 100}%"></div>
        </div>
        <div class="tp-sl-area" data-sl-area data-hue="${hsl.h}">
          <div class="tp-sl-thumb" data-sl-thumb style="left:${hsl.s}%; top:${100 - hsl.l}%"></div>
        </div>
      </div>
    </div>
  `;
}

function bindEvents(_initVars: Record<string, string>): void {
  const w = window as any;

  // Close handlers
  w.__tpClose = () => {
    // Restore original vars
    applyCustomTheme(originalVars!, false);
    // Restore preset state if any
    const cur = getCurrentTheme();
    if (cur !== 'custom') applyTheme(cur);
    modalEl?.remove();
    modalEl = null;
  };
  w.__tpCancel = w.__tpClose;

  w.__tpReset = () => {
    resetTheme();
    modalEl?.remove();
    modalEl = null;
  };

  w.__tpApply = () => {
    // Lay hex hien tai cua 4 var va persist
    const vars: Record<string, string> = {};
    VAR_KEYS.forEach(k => {
      const swatch = modalEl!.querySelector(`[data-var="${k}"] [data-swatch]`) as HTMLElement;
      vars[k] = swatch.style.background || swatch.style.backgroundColor;
      // Convert rgb() to hex if needed
      vars[k] = rgbToHex(vars[k]);
    });
    applyCustomTheme(vars, true);
    modalEl?.remove();
    modalEl = null;
  };

  // Esc key + click overlay to close
  modalEl!.addEventListener('click', (e: Event) => {
    if (e.target === modalEl) w.__tpClose();
  });
  document.addEventListener('keydown', escHandler);
  function escHandler(e: KeyboardEvent): void {
    if (e.key === 'Escape' && modalEl) {
      w.__tpClose();
      document.removeEventListener('keydown', escHandler);
    }
  }

  // Auto-gen tu mau chinh
  w.__tpAutoGen = () => {
    const tealSwatch = modalEl!.querySelector('[data-var="--teal"] [data-swatch]') as HTMLElement;
    const baseHex = rgbToHex(tealSwatch.style.background || tealSwatch.style.backgroundColor);
    const shades = generateShades(baseHex);
    Object.entries(shades).forEach(([k, hex]) => updatePickerColor(k, hex, true));
  };

  // Bind tung picker
  VAR_KEYS.forEach(key => {
    const picker = modalEl!.querySelector(`[data-var="${key}"]`) as HTMLElement;
    bindPicker(picker, key);
  });

  // Live apply ngay khi mo
  liveApply();
}

function bindPicker(picker: HTMLElement, varKey: string): void {
  const hueBar = picker.querySelector('[data-hue-bar]') as HTMLElement;
  const hueThumb = picker.querySelector('[data-hue-thumb]') as HTMLElement;
  const slArea = picker.querySelector('[data-sl-area]') as HTMLElement;
  const slThumb = picker.querySelector('[data-sl-thumb]') as HTMLElement;
  const hexInput = picker.querySelector('[data-hex]') as HTMLInputElement;

  // Hue drag
  let draggingHue = false;
  hueBar.addEventListener('mousedown', (e: MouseEvent) => { draggingHue = true; updateHue(e); });
  hueBar.addEventListener('touchstart', (e: TouchEvent) => { draggingHue = true; updateHue(e.touches[0] as any); });
  document.addEventListener('mousemove', (e: MouseEvent) => { if (draggingHue) updateHue(e); });
  document.addEventListener('touchmove', (e: TouchEvent) => { if (draggingHue) updateHue(e.touches[0] as any); });
  document.addEventListener('mouseup', () => draggingHue = false);
  document.addEventListener('touchend', () => draggingHue = false);

  function updateHue(e: { clientX: number }): void {
    const rect = hueBar.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const h = Math.round((x / rect.width) * 360);
    hueThumb.style.left = `${(h / 360) * 100}%`;
    slArea.dataset.hue = String(h);
    updateSLArea(slArea, h);
    syncFromUI(picker, varKey);
  }

  // S/L drag
  let draggingSL = false;
  slArea.addEventListener('mousedown', (e: MouseEvent) => { draggingSL = true; updateSL(e); });
  slArea.addEventListener('touchstart', (e: TouchEvent) => { draggingSL = true; updateSL(e.touches[0] as any); });
  document.addEventListener('mousemove', (e: MouseEvent) => { if (draggingSL) updateSL(e); });
  document.addEventListener('touchmove', (e: TouchEvent) => { if (draggingSL) updateSL(e.touches[0] as any); });
  document.addEventListener('mouseup', () => draggingSL = false);
  document.addEventListener('touchend', () => draggingSL = false);

  function updateSL(e: { clientX: number; clientY: number }): void {
    const rect = slArea.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const s = Math.round((x / rect.width) * 100);
    const l = Math.round(100 - (y / rect.height) * 100);
    slThumb.style.left = `${s}%`;
    slThumb.style.top = `${100 - l}%`;
    syncFromUI(picker, varKey);
  }

  // Set initial S/L gradient
  updateSLArea(slArea, parseInt(slArea.dataset.hue!));

  // Hex input
  hexInput.addEventListener('input', () => {
    let v = hexInput.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      updatePickerColor(varKey, v, false);
      liveApply();
    }
  });
  hexInput.addEventListener('blur', () => {
    // Reformat
    const swatch = picker.querySelector('[data-swatch]') as HTMLElement;
    hexInput.value = rgbToHex(swatch.style.background || swatch.style.backgroundColor);
  });
}

function updateSLArea(slArea: HTMLElement, hue: number): void {
  // Background = white-to-color gradient horizontal x black overlay vertical
  slArea.style.background = `
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))
  `;
}

function syncFromUI(picker: HTMLElement, _varKey: string): void {
  const slArea = picker.querySelector('[data-sl-area]') as HTMLElement;
  const slThumb = picker.querySelector('[data-sl-thumb]') as HTMLElement;
  const swatch = picker.querySelector('[data-swatch]') as HTMLElement;
  const hexInput = picker.querySelector('[data-hex]') as HTMLInputElement;

  const h = parseInt(slArea.dataset.hue!);
  const s = parseFloat(slThumb.style.left);
  const l = 100 - parseFloat(slThumb.style.top);
  const hex = hslToHex(h, s, l);

  swatch.style.background = hex;
  hexInput.value = hex;

  liveApply();
}

function updatePickerColor(varKey: string, hex: string, _animate: boolean): void {
  const picker = modalEl!.querySelector(`[data-var="${varKey}"]`) as HTMLElement | null;
  if (!picker) return;
  const swatch = picker.querySelector('[data-swatch]') as HTMLElement;
  const hexInput = picker.querySelector('[data-hex]') as HTMLInputElement;
  const hueThumb = picker.querySelector('[data-hue-thumb]') as HTMLElement;
  const slThumb = picker.querySelector('[data-sl-thumb]') as HTMLElement;
  const slArea = picker.querySelector('[data-sl-area]') as HTMLElement;

  const hsl = hexToHsl(hex);
  swatch.style.background = hex;
  hexInput.value = hex;
  hueThumb.style.left = `${(hsl.h / 360) * 100}%`;
  slArea.dataset.hue = String(hsl.h);
  updateSLArea(slArea, hsl.h);
  slThumb.style.left = `${hsl.s}%`;
  slThumb.style.top = `${100 - hsl.l}%`;

  liveApply();
}

function liveApply(): void {
  // Doc 4 mau hien tai tu UI va apply (khong persist)
  const vars: Record<string, string> = {};
  VAR_KEYS.forEach(k => {
    const swatch = modalEl!.querySelector(`[data-var="${k}"] [data-swatch]`) as HTMLElement;
    vars[k] = rgbToHex(swatch.style.background || swatch.style.backgroundColor);
  });
  applyCustomTheme(vars, false);
}

/**
 * Convert "rgb(14, 165, 233)" or "#xxx" -> "#xxxxxx"
 */
function rgbToHex(input: string): string {
  if (!input) return '#000000';
  if (input.startsWith('#')) return input.length === 7 ? input : input;
  const m = input.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) {
    return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }
  return input;
}

// Expose
window.openCustomThemePicker = openCustomThemePicker;

// ─── Round 70: Event delegation for theme picker modal ────────────────
function attachThemePickerDelegation(): void {
  const flag = '__tpDelegationAttached';
  if ((document.body as any)[flag]) return;
  (document.body as any)[flag] = true;

  document.body.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-tp-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.tpAction;

    if (action === 'stop') {
      e.stopPropagation();
      return;
    }
    const fnMap: Record<string, string> = {
      'close': '__tpClose',
      'auto-gen': '__tpAutoGen',
      'reset': '__tpReset',
      'cancel': '__tpCancel',
      'apply': '__tpApply',
    };
    const fnName = fnMap[action || ''];
    if (fnName && typeof (window as any)[fnName] === 'function') {
      (window as any)[fnName]();
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachThemePickerDelegation);
  } else {
    attachThemePickerDelegation();
  }
}
