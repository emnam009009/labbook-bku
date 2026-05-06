// Settings Page - Visual style picker (default/glass/neuro)
import { getStyles, getStyle, setStyle } from '../services/theme-manager.js';

function renderStylePicker(): void {
  const container = document.getElementById('theme-picker');
  if (!container) return;

  const current = getStyle();
  const styles = getStyles();

  container.innerHTML = styles.map(s => `
    <div class="style-card ${s.name === current ? 'active' : ''}"
         data-style="${s.name}"
         onclick="window.selectStyle('${s.name}')">
      <div class="style-preview style-preview-${s.name}">
        <div class="style-preview-header"></div>
        <div class="style-preview-body">
          <div class="style-preview-card"></div>
          <div class="style-preview-card"></div>
        </div>
      </div>
      <div class="style-card-info">
        <div class="style-card-name">
          ${s.label}
          ${s.name === current ? '<span class="style-active-badge">✓ Dang dung</span>' : ''}
        </div>
        <div class="style-card-desc">${s.description}</div>
      </div>
    </div>
  `).join('');
}

(window as any).selectStyle = function(name: string): void {
  setStyle(name as any);
  renderStylePicker();
  if (typeof window.showToast === 'function') {
    const labels: Record<string, string> = { default: 'Mac dinh', glass: 'Glassmorphism', neuro: 'Neumorphism' };
    window.showToast(`Da doi style: ${labels[name]}`, 'success');
  }
};

export function renderSettings(): void {
  renderStylePicker();
}

(window as any).renderSettings = renderSettings;

// Re-render khi style doi tu noi khac
window.addEventListener('style-change', () => {
  if (document.getElementById('page-settings')?.classList.contains('active')) {
    renderStylePicker();
  }
});

// Auto-render khi user vao page Settings
document.addEventListener('pageChange', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail?.id === 'settings') {
    renderSettings();
  }
});
