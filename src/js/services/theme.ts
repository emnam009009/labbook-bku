// services/theme.ts v2 — Theme picker service
// Hỗ trợ: 4 presets (teal/cyan/purple/orange) + custom theme với 4 vars riêng

interface ThemePreset {
  name: string;
  swatch: string;
  vars: Record<string, string>;
}

const PRESETS: Record<string, ThemePreset> = {
  teal: {
    name: 'Xanh teal',
    swatch: '#0d9488',
    vars: { '--teal': '#0d9488', '--teal-2': '#14b8a6', '--teal-3': '#2dd4bf', '--teal-light': '#f0fdfa' }
  },
  cyan: {
    name: 'Xanh cyan',
    swatch: '#0891b2',
    vars: { '--teal': '#0891b2', '--teal-2': '#06b6d4', '--teal-3': '#22d3ee', '--teal-light': '#ecfeff' }
  },
  purple: {
    name: 'Tím',
    swatch: '#7c3aed',
    vars: { '--teal': '#7c3aed', '--teal-2': '#8b5cf6', '--teal-3': '#a78bfa', '--teal-light': '#f5f3ff' }
  },
  orange: {
    name: 'Cam',
    swatch: '#ea580c',
    vars: { '--teal': '#ea580c', '--teal-2': '#f97316', '--teal-3': '#fb923c', '--teal-light': '#fff7ed' }
  },
};

const STORAGE_KEY = 'lb_theme';            // 'teal' | 'cyan' | ... | 'custom'
const CUSTOM_KEY = 'lb_theme_custom';      // JSON: {--teal, --teal-2, --teal-3, --teal-light}
const DEFAULT_THEME = 'teal';

function applyVars(vars: Record<string, string>): void {
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  // Auto-compute --teal-rgb từ --teal (cho rgba(...) box-shadow)
  if (vars['--teal']) {
    const rgb = hexToRgbString(vars['--teal']);
    if (rgb) root.style.setProperty('--teal-rgb', rgb);
  }
}

/**
 * Convert "#0d9488" → "13, 148, 136"
 */
function hexToRgbString(hex: string): string | null {
  hex = hex.replace('#', '');
  if (hex.length !== 6) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function applyTheme(name: string): void {
  const theme = PRESETS[name] || PRESETS[DEFAULT_THEME];
  applyVars(theme.vars);
  localStorage.setItem(STORAGE_KEY, name);
  document.querySelectorAll<HTMLElement>('.theme-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === name);
  });
  window.dispatchEvent(new CustomEvent('themechange', { detail: { name, theme } }));
}

/**
 * Áp custom theme (4 màu tùy chỉnh)
 * @param vars - {--teal, --teal-2, --teal-3, --teal-light}
 * @param persist - lưu localStorage không (false khi live preview)
 */
export function applyCustomTheme(vars: Record<string, string>, persist: boolean = true): void {
  applyVars(vars);
  if (persist) {
    localStorage.setItem(STORAGE_KEY, 'custom');
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(vars));
    document.querySelectorAll<HTMLElement>('.theme-swatch').forEach(el => el.classList.remove('active'));
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: { name: 'custom', vars } }));
}

/**
 * Tự sinh --teal-2/-3/-light từ --teal (HSL transformation)
 */
export function generateShades(baseHex: string): Record<string, string> {
  const hsl = hexToHsl(baseHex);
  return {
    '--teal':       baseHex,
    '--teal-2':     hslToHex(hsl.h, hsl.s, Math.min(hsl.l + 8, 60)),
    '--teal-3':     hslToHex(hsl.h, Math.max(hsl.s - 5, 0), Math.min(hsl.l + 18, 75)),
    '--teal-light': hslToHex(hsl.h, Math.max(hsl.s - 25, 0), 96),
  };
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): HSL {
  hex = hex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s: number, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r: number, g: number, b: number;
  if (h < 60)       [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else              [r, g, b] = [c, 0, x];
  const toHex = (n: number): string => {
    const v = Math.round((n + m) * 255);
    return v.toString(16).padStart(2, '0');
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

export function getCurrentTheme(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
}

export function getCustomTheme(): Record<string, string> | null {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null');
  } catch {
    return null;
  }
}

export function initTheme(): void {
  const saved = getCurrentTheme();
  if (saved === 'custom') {
    const custom = getCustomTheme();
    if (custom) {
      applyVars(custom);
    } else {
      applyTheme(DEFAULT_THEME);
    }
  } else if (saved !== DEFAULT_THEME) {
    applyTheme(saved);
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll<HTMLElement>('.theme-swatch').forEach(el => {
      el.classList.toggle('active', el.dataset.theme === saved);
    });
  });
}

export function resetTheme(): void {
  localStorage.removeItem(CUSTOM_KEY);
  applyTheme(DEFAULT_THEME);
}

export interface PresetInfo {
  key: string;
  name: string;
  swatch: string;
}

export function getPresets(): PresetInfo[] {
  return Object.entries(PRESETS).map(([key, val]) => ({
    key, name: val.name, swatch: val.swatch,
  }));
}

// Expose ra window cho HTML inline onclick
window.applyTheme = applyTheme;
(window as any).applyCustomTheme = applyCustomTheme;
(window as any).resetTheme = resetTheme;
(window as any).generateShades = generateShades;
