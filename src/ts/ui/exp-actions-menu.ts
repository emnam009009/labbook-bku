// src/ts/ui/exp-actions-menu.ts
// Dropdown menu hien thi khi click nut ⋯ tren row hydro/electrode.
// Muc: Nhap du lieu | Xuat du lieu

interface ExpActionContext {
  refType: string;
  refId: string;
  code?: string;
}

let _currentMenu: HTMLElement | null = null;
let _currentTrigger: HTMLElement | null = null;

function _setTriggerChecked(trigger: HTMLElement | null, checked: boolean): void {
  if (!trigger) return;
  const cb = trigger.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (cb) cb.checked = checked;
}

function closeCurrentMenu(): void {
  // Round 76: cancel any pending hover timers when forcibly closing
  if (_hoverOpenTimer) { clearTimeout(_hoverOpenTimer); _hoverOpenTimer = null; }
  if (_hoverCloseTimer) { clearTimeout(_hoverCloseTimer); _hoverCloseTimer = null; }
  if (_currentMenu) {
    _currentMenu.remove();
    _currentMenu = null;
    _setTriggerChecked(_currentTrigger, false);
    _currentTrigger = null;
    document.removeEventListener('click', _outsideClickHandler, true);
    document.removeEventListener('keydown', _escHandler, true);
  }
}

function _outsideClickHandler(e: MouseEvent): void {
  if (_currentMenu && !_currentMenu.contains(e.target as Node)) {
    closeCurrentMenu();
  }
}

function _escHandler(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeCurrentMenu();
}

// ─── Round 76: Hover-to-open state ─────────────────────────
let _hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
let _hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
const HOVER_OPEN_DELAY = 150;   // delay before opening (debounce)
const HOVER_CLOSE_DELAY = 200;  // grace period before closing

function _cancelHoverOpen(): void {
  if (_hoverOpenTimer) { clearTimeout(_hoverOpenTimer); _hoverOpenTimer = null; }
}
function _cancelHoverClose(): void {
  if (_hoverCloseTimer) { clearTimeout(_hoverCloseTimer); _hoverCloseTimer = null; }
}

/**
 * Schedule opening the menu for a given anchor. If user moves away before
 * delay expires, opening is cancelled.
 */
export function hoverEnterTrigger(anchor: HTMLElement, ctx: ExpActionContext): void {
  _cancelHoverClose();
  // If the same trigger's menu is already open, do nothing
  if (_currentTrigger === anchor && _currentMenu) return;
  // If a different trigger is open, close it immediately
  if (_currentTrigger && _currentTrigger !== anchor) {
    closeCurrentMenu();
  }
  _cancelHoverOpen();
  _hoverOpenTimer = setTimeout(() => {
    _hoverOpenTimer = null;
    openExpActionsMenu(anchor, ctx);
  }, HOVER_OPEN_DELAY);
}

/**
 * User left the trigger. Wait grace period: if menu/trigger not re-entered,
 * close. Otherwise (mouse moved to menu), the menu's mouseenter cancels.
 */
export function hoverLeaveTrigger(): void {
  _cancelHoverOpen();
  _cancelHoverClose();
  _hoverCloseTimer = setTimeout(() => {
    _hoverCloseTimer = null;
    closeCurrentMenu();
  }, HOVER_CLOSE_DELAY);
}

/** Called from page when leaving the menu element itself. */
function _onMenuMouseEnter(): void {
  _cancelHoverClose();
}
function _onMenuMouseLeave(): void {
  _cancelHoverOpen();
  _cancelHoverClose();
  _hoverCloseTimer = setTimeout(() => {
    _hoverCloseTimer = null;
    closeCurrentMenu();
  }, HOVER_CLOSE_DELAY);
}

/**
 * Hien thi dropdown menu canh nut trigger.
 */
export function openExpActionsMenu(anchor: HTMLElement, ctx: ExpActionContext): void {
  // If clicking same trigger that opened the menu -> close (toggle off)
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

  // Round 76: bind hover keep-alive on menu itself
  menu.addEventListener('mouseenter', _onMenuMouseEnter);
  menu.addEventListener('mouseleave', _onMenuMouseLeave);

  // After render, adjust if overflow right edge
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth - 8) {
    menu.style.left = `${window.innerWidth - menuRect.width - 8}px`;
  }

  // Bind clicks
  menu.addEventListener('click', (e: MouseEvent) => {
    const item = (e.target as HTMLElement)?.closest('.exp-actions-item') as HTMLElement | null;
    if (!item) return;
    const action = item.dataset.action;
    closeCurrentMenu();

    if (action === 'import') {
      // Mo modal upload (giu nguyen modal da co)
      (window as any).openAttachmentsModal?.({ refType, refId, title });
    } else if (action === 'export') {
      (window as any).openAttachmentsExportModal?.({ refType, refId, title });
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
export async function openAttachmentsExportModal({ refType, refId }: { refType: string; refId: string; title?: string }): Promise<unknown> {
  try {
    const mod: any = await import('./pdf-export-modal.js');
    return mod.openPdfExportModal(refType, refId);
  } catch (e: any) {
    console.error('[exp-actions-menu] PDF export load failed:', e);
    if (typeof window.showToast === 'function') {
      window.showToast(`Loi mo modal: ${e.message}`, 'danger');
    } else {
      alert(`Loi mo modal: ${e.message}`);
    }
  }
}
