// Theme Manager v2 - Visual Style Layer (default/glass/neuro)
// Hoạt động ĐỘC LẬP với color accent (avatar menu) và dark mode (toggle)
// CSS classes: html.glass, html.neuro (default = không có class nào)

type StyleName = 'default' | 'glass' | 'neuro';

const STYLES: readonly StyleName[] = ['default', 'glass', 'neuro'] as const;
const STYLE_LABELS: Record<StyleName, string> = {
  default: 'Mặc định',
  glass: 'Glassmorphism',
  neuro: 'Neumorphism'
};
const STYLE_DESCRIPTIONS: Record<StyleName, string> = {
  default: 'Giao diện chuẩn, sạch sẽ, tối ưu cho làm việc',
  glass: 'Hiệu ứng kính mờ, gradient nền đa sắc - hiện đại',
  neuro: 'Bề mặt mềm mại, bóng đổ nổi/chìm - tinh tế'
};
const STORAGE_KEY = 'labbook-style';

function getStoredStyle(): StyleName {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s && (STYLES as readonly string[]).includes(s)) return s as StyleName;
  } catch (e) {}
  return 'default';
}

export function getStyle(): StyleName {
  return getStoredStyle();
}

export function setStyle(name: string): void {
  if (!(STYLES as readonly string[]).includes(name)) return;
  const styleName = name as StyleName;

  const html = document.documentElement;
  html.style.transition = 'background-color 250ms ease, color 250ms ease, backdrop-filter 250ms ease';

  STYLES.forEach(s => html.classList.remove(s));
  if (styleName !== 'default') html.classList.add(styleName);

  try { localStorage.setItem(STORAGE_KEY, styleName); } catch (e) {}

  window.dispatchEvent(new CustomEvent('style-change', { detail: { style: styleName } }));
  setTimeout(() => { html.style.transition = ''; }, 300);

  console.log(`[style] ${styleName}`);
}

export interface StyleInfo {
  name: StyleName;
  label: string;
  description: string;
}

export function getStyles(): StyleInfo[] {
  return STYLES.map(name => ({
    name,
    label: STYLE_LABELS[name],
    description: STYLE_DESCRIPTIONS[name]
  }));
}

export function initStyle(): void {
  setStyle(getStoredStyle());
}

(window as any).themeManager = { getStyle, setStyle, getStyles, initStyle };
