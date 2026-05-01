// services/theme-picker-ui.js — Custom theme picker UI
// Modal popup với 4 HSL spectrum pickers + live preview + Apply/Reset

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

let modalEl = null;
let originalVars = null;  // backup để cancel

const VAR_LABELS = {
  '--teal':       { label: 'Màu chính',     desc: 'Buttons, sidebar active, accent' },
  '--teal-2':     { label: 'Màu hover',     desc: 'Hover states, gradient 2nd' },
  '--teal-3':     { label: 'Màu sáng',      desc: 'Borders, gradient endpoint' },
  '--teal-light': { label: 'Nền nhạt',      desc: 'Hover row, badge background' },
};

const VAR_KEYS = ['--teal', '--teal-2', '--teal-3', '--teal-light'];

/**
 * Mở modal custom theme picker
 */
export function openCustomThemePicker() {
  // Backup current vars
  originalVars = {};
  VAR_KEYS.forEach(k => {
    originalVars[k] = getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  });
  
  // Init values: nếu đang custom dùng saved, ko thì lấy current computed
  const saved = getCustomTheme();
  const initVars = saved || { ...originalVars };
  
  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'tp-modal-overlay open';
  modalEl.innerHTML = renderModal(initVars);
  document.body.appendChild(modalEl);
  
  // Bind events
  bindEvents(initVars);
}

function renderModal(initVars) {
  const pickers = VAR_KEYS.map(key => renderPicker(key, initVars[key])).join('');
  return `
    <div class="tp-modal" onclick="event.stopPropagation()">
      <div class="tp-modal-header">
        <div class="tp-modal-title">Tùy chỉnh màu giao diện</div>
        <button class="tp-modal-close" onclick="window.__tpClose()">✕</button>
      </div>
      
      <div class="tp-pickers">
        ${pickers}
      </div>
      
      <div class="tp-actions-row">
        <button class="tp-btn-auto" onclick="window.__tpAutoGen()">
          ⚡ Tự sinh từ màu chính
        </button>
        <span class="tp-hint">Đổi màu chính → tự sinh 3 màu phụ hài hòa</span>
      </div>
      
      <div class="tp-preview">
        <div class="tp-preview-title">Xem trước</div>
        <div class="tp-preview-content">
          <button class="btn btn-primary" style="background: var(--teal); border-color: var(--teal); color:white;">Nút chính</button>
          <button class="btn" style="background: var(--teal-light); color: var(--teal); border:1px solid var(--teal-3);">Badge</button>
          <div style="background: linear-gradient(135deg, var(--teal), var(--teal-2)); width:48px; height:24px; border-radius:6px;"></div>
          <div style="background: var(--teal-light); padding:6px 12px; border-radius:6px; font-size:12px; color: var(--teal);">Hover row</div>
        </div>
      </div>
      
      <div class="tp-modal-footer">
        <button class="btn" onclick="window.__tpReset()">Reset về teal</button>
        <button class="btn" onclick="window.__tpCancel()">Hủy</button>
        <button class="btn btn-primary" onclick="window.__tpApply()">Áp dụng</button>
      </div>
    </div>
  `;
}

function renderPicker(varKey, currentHex) {
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

function bindEvents(initVars) {
  // Close handlers
  window.__tpClose = () => {
    // Restore original vars
    applyCustomTheme(originalVars, false);
    // Restore preset state if any
    const cur = getCurrentTheme();
    if (cur !== 'custom') applyTheme(cur);
    modalEl.remove();
    modalEl = null;
  };
  window.__tpCancel = window.__tpClose;
  
  window.__tpReset = () => {
    resetTheme();
    modalEl.remove();
    modalEl = null;
  };
  
  window.__tpApply = () => {
    // Lấy hex hiện tại của 4 var và persist
    const vars = {};
    VAR_KEYS.forEach(k => {
      const swatch = modalEl.querySelector(`[data-var="${k}"] [data-swatch]`);
      vars[k] = swatch.style.background || swatch.style.backgroundColor;
      // Convert rgb() to hex if needed
      vars[k] = rgbToHex(vars[k]);
    });
    applyCustomTheme(vars, true);
    modalEl.remove();
    modalEl = null;
  };
  
  // Esc key + click overlay to close
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) window.__tpClose();
  });
  document.addEventListener('keydown', escHandler);
  function escHandler(e) {
    if (e.key === 'Escape' && modalEl) {
      window.__tpClose();
      document.removeEventListener('keydown', escHandler);
    }
  }
  
  // Auto-gen từ màu chính
  window.__tpAutoGen = () => {
    const tealSwatch = modalEl.querySelector('[data-var="--teal"] [data-swatch]');
    const baseHex = rgbToHex(tealSwatch.style.background || tealSwatch.style.backgroundColor);
    const shades = generateShades(baseHex);
    Object.entries(shades).forEach(([k, hex]) => updatePickerColor(k, hex, true));
  };
  
  // Bind từng picker
  VAR_KEYS.forEach(key => {
    const picker = modalEl.querySelector(`[data-var="${key}"]`);
    bindPicker(picker, key);
  });
  
  // Live apply ngay khi mở
  liveApply();
}

function bindPicker(picker, varKey) {
  const hueBar = picker.querySelector('[data-hue-bar]');
  const hueThumb = picker.querySelector('[data-hue-thumb]');
  const slArea = picker.querySelector('[data-sl-area]');
  const slThumb = picker.querySelector('[data-sl-thumb]');
  const hexInput = picker.querySelector('[data-hex]');
  
  // Hue drag
  let draggingHue = false;
  hueBar.addEventListener('mousedown', e => { draggingHue = true; updateHue(e); });
  hueBar.addEventListener('touchstart', e => { draggingHue = true; updateHue(e.touches[0]); });
  document.addEventListener('mousemove', e => { if (draggingHue) updateHue(e); });
  document.addEventListener('touchmove', e => { if (draggingHue) updateHue(e.touches[0]); });
  document.addEventListener('mouseup', () => draggingHue = false);
  document.addEventListener('touchend', () => draggingHue = false);
  
  function updateHue(e) {
    const rect = hueBar.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const h = Math.round((x / rect.width) * 360);
    hueThumb.style.left = `${(h / 360) * 100}%`;
    slArea.dataset.hue = h;
    updateSLArea(slArea, h);
    syncFromUI(picker, varKey);
  }
  
  // S/L drag
  let draggingSL = false;
  slArea.addEventListener('mousedown', e => { draggingSL = true; updateSL(e); });
  slArea.addEventListener('touchstart', e => { draggingSL = true; updateSL(e.touches[0]); });
  document.addEventListener('mousemove', e => { if (draggingSL) updateSL(e); });
  document.addEventListener('touchmove', e => { if (draggingSL) updateSL(e.touches[0]); });
  document.addEventListener('mouseup', () => draggingSL = false);
  document.addEventListener('touchend', () => draggingSL = false);
  
  function updateSL(e) {
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
  updateSLArea(slArea, parseInt(slArea.dataset.hue));
  
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
    const swatch = picker.querySelector('[data-swatch]');
    hexInput.value = rgbToHex(swatch.style.background || swatch.style.backgroundColor);
  });
}

function updateSLArea(slArea, hue) {
  // Background = white-to-color gradient horizontal × black overlay vertical
  slArea.style.background = `
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))
  `;
}

function syncFromUI(picker, varKey) {
  const slArea = picker.querySelector('[data-sl-area]');
  const slThumb = picker.querySelector('[data-sl-thumb]');
  const swatch = picker.querySelector('[data-swatch]');
  const hexInput = picker.querySelector('[data-hex]');
  
  const h = parseInt(slArea.dataset.hue);
  const s = parseFloat(slThumb.style.left);
  const l = 100 - parseFloat(slThumb.style.top);
  const hex = hslToHex(h, s, l);
  
  swatch.style.background = hex;
  hexInput.value = hex;
  
  liveApply();
}

function updatePickerColor(varKey, hex, animate) {
  const picker = modalEl.querySelector(`[data-var="${varKey}"]`);
  if (!picker) return;
  const swatch = picker.querySelector('[data-swatch]');
  const hexInput = picker.querySelector('[data-hex]');
  const hueThumb = picker.querySelector('[data-hue-thumb]');
  const slThumb = picker.querySelector('[data-sl-thumb]');
  const slArea = picker.querySelector('[data-sl-area]');
  
  const hsl = hexToHsl(hex);
  swatch.style.background = hex;
  hexInput.value = hex;
  hueThumb.style.left = `${(hsl.h / 360) * 100}%`;
  slArea.dataset.hue = hsl.h;
  updateSLArea(slArea, hsl.h);
  slThumb.style.left = `${hsl.s}%`;
  slThumb.style.top = `${100 - hsl.l}%`;
  
  liveApply();
}

function liveApply() {
  // Đọc 4 màu hiện tại từ UI và apply (không persist)
  const vars = {};
  VAR_KEYS.forEach(k => {
    const swatch = modalEl.querySelector(`[data-var="${k}"] [data-swatch]`);
    vars[k] = rgbToHex(swatch.style.background || swatch.style.backgroundColor);
  });
  applyCustomTheme(vars, false);
}

/**
 * Convert "rgb(13, 148, 136)" or "#xxx" → "#xxxxxx"
 */
function rgbToHex(input) {
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
