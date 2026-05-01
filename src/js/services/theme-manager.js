// Theme Manager v2 - Visual Style Layer (default/glass/neuro)
// Hoạt động ĐỘC LẬP với color accent (avatar menu) và dark mode (toggle)
// CSS classes: html.glass, html.neuro (default = không có class nào)

const STYLES = ['default', 'glass', 'neuro'];
const STYLE_LABELS = {
  default: 'Mặc định',
  glass: 'Glassmorphism',
  neuro: 'Neumorphism'
};
const STYLE_DESCRIPTIONS = {
  default: 'Giao diện chuẩn, sạch sẽ, tối ưu cho làm việc',
  glass: 'Hiệu ứng kính mờ, gradient nền đa sắc - hiện đại',
  neuro: 'Bề mặt mềm mại, bóng đổ nổi/chìm - tinh tế'
};
const STORAGE_KEY = 'labbook-style';

function getStoredStyle() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (STYLES.includes(s)) return s;
  } catch (e) {}
  return 'default';
}

export function getStyle() {
  return getStoredStyle();
}

export function setStyle(name) {
  if (!STYLES.includes(name)) return;
  
  const html = document.documentElement;
  html.style.transition = 'background-color 250ms ease, color 250ms ease, backdrop-filter 250ms ease';
  
  STYLES.forEach(s => html.classList.remove(s));
  if (name !== 'default') html.classList.add(name);
  
  try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
  
  window.dispatchEvent(new CustomEvent('style-change', { detail: { style: name } }));
  setTimeout(() => { html.style.transition = ''; }, 300);
  
  console.log(`[style] ${name}`);
}

export function getStyles() {
  return STYLES.map(name => ({
    name,
    label: STYLE_LABELS[name],
    description: STYLE_DESCRIPTIONS[name]
  }));
}

export function initStyle() {
  setStyle(getStoredStyle());
}

window.themeManager = { getStyle, setStyle, getStyles, initStyle };
