// Settings Page - Visual style picker (default/glass/neuro)
import { getStyles, getStyle, setStyle } from '../services/theme-manager.js';

function renderStylePicker() {
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
          ${s.name === current ? '<span class="style-active-badge">✓ Đang dùng</span>' : ''}
        </div>
        <div class="style-card-desc">${s.description}</div>
      </div>
    </div>
  `).join('');
}

window.selectStyle = function(name) {
  setStyle(name);
  renderStylePicker();
  if (typeof window.showToast === 'function') {
    const labels = { default: 'Mặc định', glass: 'Glassmorphism', neuro: 'Neumorphism' };
    window.showToast(`Đã đổi style: ${labels[name]}`, 'success');
  }
};

export function renderSettings() {
  renderStylePicker();
}

window.renderSettings = renderSettings;

// Re-render khi style đổi từ nơi khác
window.addEventListener('style-change', () => {
  if (document.getElementById('page-settings')?.classList.contains('active')) {
    renderStylePicker();
  }
});

// Auto-render khi user vào page Settings
document.addEventListener('pageChange', (e) => {
  if (e.detail?.id === 'settings') {
    renderSettings();
  }
});
