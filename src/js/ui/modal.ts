/**
 * ui/modal.ts — v2 (a11y Phase 2 Batch 2 — C4 fix)
 *
 * Moi: Modal focus trap + return focus
 *  - Khi modal mo: focus vao focusable element dau tien
 *  - Tab/Shift+Tab vong quanh trong modal (khong thoat ra ngoai)
 *  - Esc dong modal
 *  - Khi dong: focus quay lai element da trigger modal
 *
 * Hook registry (giu nguyen):
 *  - registerModalHook('afterOpen', fn)
 *  - fireModalHooks('afterOpen', id)
 *
 * Cac module phu thuoc DOM/cache khac (vd updateChemSelects) duoc goi qua
 * window.* runtime de tranh circular import.
 */

// db, ref, update, remove, fbPush van duoc import nhung khong dung truc tiep
// (giu de match goc va tranh circular fix)

type ModalHookFn = (id: string) => void;
type HookKey = string;

interface ModalHooks {
  [when: string]: ModalHookFn[];
}

interface FocusTrapState {
  modalId: string | null;
  triggerElement: Element | null;
  keydownHandler: ((e: KeyboardEvent) => void) | null;
}

// ── Hook registry ────────────────────────────────────────────────────────
((window as any).__modalHooks as ModalHooks) = ((window as any).__modalHooks as ModalHooks) || { afterOpen: [] };

export function registerModalHook(when: HookKey, fn: ModalHookFn): void {
  const hooks = (window as any).__modalHooks as ModalHooks;
  if (!hooks[when]) hooks[when] = [];
  hooks[when].push(fn);
}

export function fireModalHooks(when: HookKey, id: string): void {
  const hooks = (window as any).__modalHooks as ModalHooks;
  const list = hooks[when] || [];
  for (const fn of list) {
    try { fn(id); } catch (e) { console.error('[modalHook ' + when + ']', e); }
  }
}

// ── A11y: Focus trap state ───────────────────────────────────────────────
const _focusTrapState: FocusTrapState = {
  modalId: null,
  triggerElement: null,
  keydownHandler: null
};

// Selector cho focusable elements
const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])'
].join(',');

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(el => {
      // Loai bo element bi display:none hoac visibility:hidden
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    });
}

function setupFocusTrap(modalEl: HTMLElement, modalId: string): void {
  // Luu element da trigger mo modal (de return focus sau)
  _focusTrapState.modalId = modalId;
  _focusTrapState.triggerElement = document.activeElement;

  // Focus vao focusable element dau tien trong modal
  setTimeout(() => {
    const focusables = getFocusableElements(modalEl);
    if (focusables.length > 0) {
      // Skip close button — focus input/textarea dau tien neu co
      const firstInput = focusables.find(el =>
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
      );
      (firstInput || focusables[0]).focus();
    } else {
      // Modal khong co focusable element — focus vao modal container
      modalEl.setAttribute('tabindex', '-1');
      modalEl.focus();
    }
  }, 50);

  // Keydown handler: Tab trap + Esc to close
  const handler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(modalId);
      return;
    }

    if (e.key !== 'Tab') return;

    const focusables = getFocusableElements(modalEl);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      // Shift+Tab: neu dang o first -> quay sang last
      if (active === first || !modalEl.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: neu dang o last -> quay ve first
      if (active === last || !modalEl.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', handler, true);
  _focusTrapState.keydownHandler = handler;
}

function teardownFocusTrap(): void {
  if (_focusTrapState.keydownHandler) {
    document.removeEventListener('keydown', _focusTrapState.keydownHandler, true);
    _focusTrapState.keydownHandler = null;
  }

  // Return focus to trigger element
  const trigger = _focusTrapState.triggerElement as HTMLElement | null;
  if (trigger && document.body.contains(trigger) && typeof trigger.focus === 'function') {
    setTimeout(() => trigger.focus(), 0);
  }

  _focusTrapState.modalId = null;
  _focusTrapState.triggerElement = null;
}

// ── Round 83: Mo modal STACKED (khong dong cac modal khac) ───────────────
// Dung cho modal-overview de khi user dong overview, modal-attachments
// (parent) van con mo, ko phai vao lai tu dau.
export function openModalStacked(id: string): void {
  document.body.style.overflow = 'hidden';
  const _md = document.getElementById(id);
  if (!_md) return;
  _md.classList.add('open');
  // Boost z-index above already-open modals
  let maxZ = 1000;
  document.querySelectorAll('.modal-overlay.open').forEach(m => {
    if (m.id === id) return;
    const z = parseInt(getComputedStyle(m as HTMLElement).zIndex, 10) || 1000;
    if (z > maxZ) maxZ = z;
  });
  (_md as HTMLElement).style.zIndex = String(maxZ + 10);
  setupFocusTrap(_md as HTMLElement, id);
  fireModalHooks('afterOpen', id);
}

// ── Mo modal ─────────────────────────────────────────────────────────────
export function openModal(id: string): void {
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('.modal-overlay.open').forEach(m => {
    if (m.id !== id) m.classList.remove('open');
  });
  const _md = document.getElementById(id);
  if (!_md) return;
  _md.classList.add('open');

  // Special case: modal-chemical
  if (id === 'modal-chemical') {
    if (!(document.getElementById('modal-chemical') as HTMLElement)?.dataset.editKey) {
      const titleEl = document.querySelector('#modal-chemical .modal-title');
      const footerBtn = document.querySelector('#modal-chemical .modal-footer .btn-primary');
      if (titleEl) titleEl.textContent = 'Them hoa chat';
      if (footerBtn) footerBtn.textContent = 'Luu hoa chat';
    }
    setTimeout(() => {
      const unitSel = document.getElementById('c-unit') as HTMLSelectElement | null;
      if (unitSel && typeof (window as any).makeCustomSelect === 'function') {
        (window as any).makeCustomSelect(unitSel);
        // Note: previously declared 'wrap' + 'trigger' here, both unused.
      }
    }, 50);
  }

  // Default ngay hom nay
  const today = new Date().toISOString().split('T')[0];
  ['h-date', 'e-date', 'ec-date'].forEach(f => {
    const el = document.getElementById(f) as HTMLInputElement | null;
    if (el && !el.value) el.value = today;
  });

  // Modal hydrothermal
  if (id === 'modal-hydrothermal' && typeof (window as any).updateChemSelects === 'function') {
    (window as any).updateChemSelects();
    const hPersonWrap = document.getElementById('h-person')?.closest('.form-group') as HTMLElement | null;
    if (hPersonWrap) {
      const isEditByAdmin = (document.getElementById('modal-hydrothermal') as HTMLElement)?.dataset.editKey
                         && (window.currentAuth as any)?.isAdmin;
      hPersonWrap.style.display = isEditByAdmin ? '' : 'none';
    }
  }

  // Modal chemical
  if (id === 'modal-chemical' && typeof (window as any).updateGroupSelects === 'function') {
    setTimeout(() => {
      (window as any).updateGroupSelects();
      const cg = document.getElementById('c-group') as HTMLSelectElement | null;
      if (cg && cg.dataset.pendingVal !== undefined) cg.value = cg.dataset.pendingVal;
    }, 100);
  }

  // Cap nhat cac dropdown chung
  if (typeof (window as any).updatePersonSelects === 'function') (window as any).updatePersonSelects();
  if (typeof (window as any).updateInkSelects === 'function') (window as any).updateInkSelects();

  // Modal electrode reset
  if (id === 'modal-electrode') {
    const cb = document.getElementById('e-is-sample') as HTMLInputElement | null;
    if (cb && !(document.getElementById('modal-electrode') as HTMLElement)?.dataset.editKey) cb.checked = false;
  }

  // ★ A11y: Setup focus trap
  setupFocusTrap(_md, id);

  // Round 6: fire afterOpen hooks
  fireModalHooks('afterOpen', id);
}

// ── Dong modal ───────────────────────────────────────────────────────────
export function closeModal(id: string): void {
  // Round 83: only clear body overflow if NO other modals remain open
  const stillOpen = Array.from(document.querySelectorAll('.modal-overlay.open'))
    .filter(m => m.id !== id);
  if (stillOpen.length === 0) {
    document.body.style.overflow = '';
  }
  const el = document.getElementById(id) as HTMLElement | null;
  if (!el) return;
  el.classList.remove('open');
  el.style.zIndex = '';  // Clear inline z-index from openModalStacked
  delete el.dataset.editKey;

  // Reset title
  const titleEl = el.querySelector('.modal-title');
  if (titleEl) titleEl.textContent = (titleEl.textContent || '').replace('Chinh sua', 'Them');

  // Reset footer button
  const footerBtn = el.querySelector('.modal-footer .btn-primary');
  if (footerBtn && footerBtn.textContent === 'Tra cuu') footerBtn.textContent = 'Luu';
  if (footerBtn && footerBtn.textContent === 'Cap nhat') {
    const defaults: Record<string, string> = {
      'modal-hydrothermal': 'Luu thi nghiem',
      'modal-electrode':    'Luu dien cuc',
      'modal-electrochem':  'Luu phep do',
      'modal-chemical':     'Luu hoa chat',
      'modal-equipment':    'Luu thiet bi',
      'modal-member':       'Luu thanh vien',
      'modal-ink':          'Luu cong thuc',
    };
    if (defaults[id]) footerBtn.textContent = defaults[id];
  }

  // Cleanup paste listeners
  if (id === 'modal-ink-image' && typeof (window as any).handleInkPaste === 'function') {
    document.removeEventListener('paste', (window as any).handleInkPaste);
  }
  if (id === 'modal-electrode-image' && typeof (window as any).handleElectrodePaste === 'function') {
    document.removeEventListener('paste', (window as any).handleElectrodePaste);
  }
  if (id === 'modal-hydro-image' && typeof (window as any).handleHydroPaste === 'function') {
    document.removeEventListener('paste', (window as any).handleHydroPaste);
  }

  // ★ A11y: Teardown focus trap (only if this is the active modal)
  if (_focusTrapState.modalId === id) {
    teardownFocusTrap();
  }
}
