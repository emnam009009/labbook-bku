// Settings Page - Visual style picker (default/glass/neuro)
import { getStyles, getStyle, setStyle } from '../services/theme-manager.js';

function renderStylePicker(): void {
  const container = document.getElementById('theme-picker');
  if (!container) return;

  const current = getStyle();
  const styles = getStyles();

  container.innerHTML = styles.map(s => `
    <div class="style-card ${s.name === current ? 'active' : ''}"
         data-settings-action="select-style"
         data-style="${s.name}">
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

// ─── Round 69: Event delegation for settings page CSP fix ────────────────
function attachSettingsDelegation(): void {
  const flag = '__settingsDelegationAttached';
  if ((document.body as any)[flag]) return;
  (document.body as any)[flag] = true;

  document.body.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-settings-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.settingsAction;

    if (action === 'select-style') {
      const name = target.dataset.style || '';
      if (name && typeof (window as any).selectStyle === 'function') {
        (window as any).selectStyle(name);
      }
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachSettingsDelegation);
  } else {
    attachSettingsDelegation();
  }
}
