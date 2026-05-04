// src/js/ui/exp-actions-menu.js
// Dropdown menu hiển thị khi click nút ⋯ trên row hydro/electrode.
// Mục: Nhập dữ liệu | Xuất dữ liệu

let _currentMenu = null;
let _currentTrigger = null;

function _setTriggerChecked(trigger, checked) {
  if (!trigger) return;
  const cb = trigger.querySelector('input[type="checkbox"]');
  if (cb) cb.checked = checked;
}

function closeCurrentMenu() {
  if (_currentMenu) {
    _currentMenu.remove();
    _currentMenu = null;
    _setTriggerChecked(_currentTrigger, false);
    _currentTrigger = null;
    document.removeEventListener('click', _outsideClickHandler, true);
    document.removeEventListener('keydown', _escHandler, true);
  }
}

function _outsideClickHandler(e) {
  if (_currentMenu && !_currentMenu.contains(e.target)) {
    closeCurrentMenu();
  }
}

function _escHandler(e) {
  if (e.key === 'Escape') closeCurrentMenu();
}

/**
 * Hiển thị dropdown menu cạnh nút trigger.
 * @param {HTMLElement} anchor - nút ⋯ được click
 * @param {object} ctx - { refType: 'hydro'|'electrode', refId, code }
 */
export function openExpActionsMenu(anchor, ctx) {
  // If clicking same trigger that opened the menu → close (toggle off)
  const sameTrigger = _currentTrigger === anchor;
  closeCurrentMenu();
  if (sameTrigger) return;

  const { refType, refId, code } = ctx;
  _currentTrigger = anchor;
  _setTriggerChecked(anchor, true);
  const title = `Tài liệu — ${code || refId}`;

  const menu = document.createElement('div');
  menu.className = 'exp-actions-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <button type="button" class="exp-actions-item" role="menuitem" data-action="import">
      <svg class="exp-actions-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Nhập dữ liệu</span>
    </button>
    <button type="button" class="exp-actions-item" role="menuitem" data-action="export">
      <svg class="exp-actions-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <span>Xuất dữ liệu</span>
    </button>
  `;

  // Position menu below-right of anchor
  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  menu.style.zIndex = '9999';

  document.body.appendChild(menu);
  _currentMenu = menu;

  // After render, adjust if overflow right edge
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth - 8) {
    menu.style.left = `${window.innerWidth - menuRect.width - 8}px`;
  }

  // Bind clicks
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.exp-actions-item');
    if (!item) return;
    const action = item.dataset.action;
    closeCurrentMenu();

    if (action === 'import') {
      // Mở modal upload (giữ nguyên modal đã có)
      window.openAttachmentsModal?.({ refType, refId, title });
    } else if (action === 'export') {
      window.openAttachmentsExportModal?.({ refType, refId, title });
    }
  });

  // Close on outside click / esc (defer to skip the click that opened it)
  setTimeout(() => {
    document.addEventListener('click', _outsideClickHandler, true);
    document.addEventListener('keydown', _escHandler, true);
  }, 0);
}

/**
 * Mở modal Xuất dữ liệu — lazy-load PDF export module.
 */
export async function openAttachmentsExportModal({ refType, refId, title = '' }) {
  try {
    const mod = await import('./pdf-export-modal.js');
    return mod.openPdfExportModal(refType, refId);
  } catch (e) {
    console.error('[exp-actions-menu] PDF export load failed:', e);
    if (typeof window.showToast === 'function') {
      window.showToast(`Lỗi mở modal: ${e.message}`, 'danger');
    } else {
      alert(`Lỗi mở modal: ${e.message}`);
    }
  }
}
