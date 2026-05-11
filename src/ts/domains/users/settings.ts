// Settings Page - Visual style picker (default/glass/neuro)
import { getStyles, getStyle, setStyle } from '@/services/theme-manager.js';

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
    const labels: Record<string, string> = { default: 'Mặc định', glass: 'Glassmorphism', neuro: 'Neumorphism' };
    window.showToast(`Đã đổi style: ${labels[name]}`, 'success');
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


// ═══════════════════════════════════════════════════════════
// R152d-2 — Migration card (legacy → Firestore experiments)
// ═══════════════════════════════════════════════════════════

import { callMigration, isSuperadmin, MigrationResponse } from '@/services/migration.js';

let _migrationDryRunResult: MigrationResponse | null = null;

function escapeHtmlMig(s: string): string {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function renderMigrationCard(): void {
  const card = document.getElementById('migration-card');
  if (!card) return;

  // Hide for non-superadmin
  if (!isSuperadmin()) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const result = _migrationDryRunResult;
  const status = card.querySelector('#migration-status') as HTMLElement | null;
  const action = card.querySelector('#migration-action') as HTMLElement | null;
  if (!status || !action) return;

  if (!result) {
    status.innerHTML = `
      <div class="lb-hint">Chạy "Tổng quan" để xem có bao nhiêu thí nghiệm legacy chưa migrate.</div>
    `;
    action.innerHTML = `
      <button class="btn btn-primary" data-settings-action="migration-dryrun">
        Tổng quan
      </button>
    `;
    return;
  }

  // Show dry-run result
  const t = result.totals;
  const rows = result.perCollection.map(c => `
    <div class="lb-prop-row">
      <span class="lb-prop-key">${escapeHtmlMig(c.collection)}</span>
      <span class="lb-prop-val">
        ${c.willMigrate} sẽ migrate
        ${c.alreadyMigrated > 0 ? ` · ${c.alreadyMigrated} đã có` : ''}
        ${c.errors > 0 ? ` · <span style="color:#EF4444">${c.errors} lỗi</span>` : ''}
      </span>
    </div>
  `).join('');

  const isConfirmed = result.mode === 'confirm';
  const isReady = !isConfirmed && t.willMigrate > 0 && t.errors === 0;
  const isNothing = !isConfirmed && t.willMigrate === 0;

  status.innerHTML = `
    ${rows}
    <div class="lb-prop-row" style="margin-top:8px;border-top:1px solid #E2E8F0;padding-top:8px">
      <span class="lb-prop-key" style="font-weight:600">
        ${isConfirmed ? 'Đã migrate' : 'Tổng'}
      </span>
      <span class="lb-prop-val" style="font-weight:600">
        ${isConfirmed ? `${t.migrated}/${t.willMigrate + t.alreadyMigrated}` : `${t.willMigrate} sẽ migrate`}
        ${t.errors > 0 ? ` · <span style="color:#EF4444">${t.errors} lỗi</span>` : ''}
      </span>
    </div>
    ${isConfirmed && result.backupId ? `
      <div class="lb-hint" style="margin-top:8px">
        Backup: <code>${escapeHtmlMig(result.backupId)}</code> · ${result.durationMs}ms
      </div>
    ` : ''}
    ${isNothing ? `
      <div class="lb-hint" style="margin-top:8px;color:#10B981">
        ✓ Tất cả dữ liệu legacy đã được migrate.
      </div>
    ` : ''}
  `;

  if (isConfirmed) {
    action.innerHTML = `
      <button class="btn" data-settings-action="migration-reset">
        Đóng
      </button>
    `;
  } else if (isReady) {
    action.innerHTML = `
      <button class="btn" data-settings-action="migration-reset">Hủy</button>
      <button class="btn btn-primary" data-settings-action="migration-confirm">
        Bắt đầu migrate (${t.willMigrate})
      </button>
    `;
  } else {
    action.innerHTML = `
      <button class="btn" data-settings-action="migration-reset">Đóng</button>
    `;
  }
}

async function handleMigrationDryRun(): Promise<void> {
  const btn = document.querySelector('[data-settings-action="migration-dryrun"]') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = 'Đang quét...'; }
  try {
    _migrationDryRunResult = await callMigration('dry-run', 'all');
    renderMigrationCard();
  } catch (err: any) {
    if (typeof window.showToast === 'function') {
      window.showToast(`Lỗi: ${err?.message || err}`, 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Tổng quan'; }
  }
}

async function handleMigrationConfirm(): Promise<void> {
  const btns = document.querySelectorAll('#migration-action button');
  btns.forEach(b => (b as HTMLButtonElement).disabled = true);
  const confirmBtn = document.querySelector('[data-settings-action="migration-confirm"]') as HTMLButtonElement | null;
  if (confirmBtn) confirmBtn.textContent = 'Đang migrate...';
  try {
    _migrationDryRunResult = await callMigration('confirm', 'all');
    renderMigrationCard();
    if (typeof window.showToast === 'function') {
      window.showToast(
        `Đã migrate ${_migrationDryRunResult.totals.migrated} thí nghiệm`,
        'success',
      );
    }
  } catch (err: any) {
    if (typeof window.showToast === 'function') {
      window.showToast(`Lỗi: ${err?.message || err}`, 'error');
    }
    btns.forEach(b => (b as HTMLButtonElement).disabled = false);
    if (confirmBtn) confirmBtn.textContent = `Bắt đầu migrate`;
  }
}

function handleMigrationReset(): void {
  _migrationDryRunResult = null;
  renderMigrationCard();
}

// Extend renderSettings to also render migration card
const _originalRenderSettings = (window as any).renderSettings;
(window as any).renderSettings = function(): void {
  if (typeof _originalRenderSettings === 'function') {
    _originalRenderSettings();
  } else {
    renderStylePicker();
  }
  renderMigrationCard();
};

// Also listen to pageChange directly (original settings.ts listener calls
// local renderSettings, not window override — so we add our own).
document.addEventListener('pageChange', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail?.id === 'settings') {
    renderMigrationCard();
  }
});

// And render once on script load if settings page is already active
// (handles edge case: user lands directly on settings via URL/refresh)
if (document.getElementById('page-settings')?.classList.contains('active')) {
  renderMigrationCard();
}

// Extend settings delegation to handle 3 migration actions
const _origAttach = attachSettingsDelegation;
(function() {
  const flag = '__migrationDelegationAttached';
  if ((document.body as any)[flag]) return;
  (document.body as any)[flag] = true;
  document.body.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-settings-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.settingsAction;
    if (action === 'migration-dryrun') {
      void handleMigrationDryRun();
    } else if (action === 'migration-confirm') {
      void handleMigrationConfirm();
    } else if (action === 'migration-reset') {
      handleMigrationReset();
    }
  });
})();

// Wire export so original attach not unused
void _origAttach;
