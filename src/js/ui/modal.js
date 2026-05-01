/**
 * ui/modal.js — v2 (a11y Phase 2 Batch 2 — C4 fix)
 *
 * Mới: Modal focus trap + return focus
 *  - Khi modal mở: focus vào focusable element đầu tiên
 *  - Tab/Shift+Tab vòng quanh trong modal (không thoát ra ngoài)
 *  - Esc đóng modal
 *  - Khi đóng: focus quay lại element đã trigger modal
 *
 * Hook registry (giữ nguyên):
 *  - registerModalHook('afterOpen', fn)
 *  - fireModalHooks('afterOpen', id)
 *
 * Các module phụ thuộc DOM/cache khác (vd updateChemSelects) được gọi qua
 * window.* runtime để tránh circular import.
 */

import { db, ref, update, remove, fbPush } from '../firebase.js'

// ── Hook registry ────────────────────────────────────────────────────────
window.__modalHooks = window.__modalHooks || { afterOpen: [] };

export function registerModalHook(when, fn) {
  if (!window.__modalHooks[when]) window.__modalHooks[when] = [];
  window.__modalHooks[when].push(fn);
}

export function fireModalHooks(when, id) {
  const list = window.__modalHooks[when] || [];
  for (const fn of list) {
    try { fn(id); } catch (e) { console.error('[modalHook ' + when + ']', e); }
  }
}

// ── A11y: Focus trap state ───────────────────────────────────────────────
const _focusTrapState = {
  modalId: null,           // ID của modal đang mở
  triggerElement: null,    // Element đã trigger mở modal (để return focus)
  keydownHandler: null     // Reference để remove
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

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(el => {
      // Loại bỏ element bị display:none hoặc visibility:hidden
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    });
}

function setupFocusTrap(modalEl, modalId) {
  // Lưu element đã trigger mở modal (để return focus sau)
  _focusTrapState.modalId = modalId;
  _focusTrapState.triggerElement = document.activeElement;

  // Focus vào focusable element đầu tiên trong modal
  setTimeout(() => {
    const focusables = getFocusableElements(modalEl);
    if (focusables.length > 0) {
      // Skip close button — focus input/textarea đầu tiên nếu có
      const firstInput = focusables.find(el =>
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
      );
      (firstInput || focusables[0]).focus();
    } else {
      // Modal không có focusable element — focus vào modal container
      modalEl.setAttribute('tabindex', '-1');
      modalEl.focus();
    }
  }, 50);

  // Keydown handler: Tab trap + Esc to close
  const handler = (e) => {
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
      // Shift+Tab: nếu đang ở first → quay sang last
      if (active === first || !modalEl.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: nếu đang ở last → quay về first
      if (active === last || !modalEl.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', handler, true);
  _focusTrapState.keydownHandler = handler;
}

function teardownFocusTrap() {
  if (_focusTrapState.keydownHandler) {
    document.removeEventListener('keydown', _focusTrapState.keydownHandler, true);
    _focusTrapState.keydownHandler = null;
  }

  // Return focus to trigger element
  const trigger = _focusTrapState.triggerElement;
  if (trigger && document.body.contains(trigger) && typeof trigger.focus === 'function') {
    setTimeout(() => trigger.focus(), 0);
  }

  _focusTrapState.modalId = null;
  _focusTrapState.triggerElement = null;
}

// ── Mở modal ─────────────────────────────────────────────────────────────
export function openModal(id) {
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('.modal-overlay.open').forEach(m => {
    if (m.id !== id) m.classList.remove('open');
  });
  const _md = document.getElementById(id);
  if (!_md) return;
  _md.classList.add('open');

  // Special case: modal-chemical
  if (id === 'modal-chemical') {
    if (!document.getElementById('modal-chemical').dataset.editKey) {
      const titleEl = document.querySelector('#modal-chemical .modal-title');
      const footerBtn = document.querySelector('#modal-chemical .modal-footer .btn-primary');
      if (titleEl) titleEl.textContent = 'Thêm hóa chất';
      if (footerBtn) footerBtn.textContent = 'Lưu hóa chất';
    }
    setTimeout(() => {
      const unitSel = document.getElementById('c-unit');
      if (unitSel && typeof window.makeCustomSelect === 'function') {
        window.makeCustomSelect(unitSel);
        const wrap = unitSel.closest('.cs-modal-wrap');
        const trigger = wrap?.querySelector('.cs-modal-trigger');
      }
    }, 50);
  }

  // Default ngày hôm nay
  const today = new Date().toISOString().split('T')[0];
  ['h-date', 'e-date', 'ec-date'].forEach(f => {
    const el = document.getElementById(f);
    if (el && !el.value) el.value = today;
  });

  // Modal hydrothermal
  if (id === 'modal-hydrothermal' && typeof window.updateChemSelects === 'function') {
    window.updateChemSelects();
    const hPersonWrap = document.getElementById('h-person')?.closest('.form-group');
    if (hPersonWrap) {
      const isEditByAdmin = document.getElementById('modal-hydrothermal').dataset.editKey
                         && window.currentAuth?.isAdmin;
      hPersonWrap.style.display = isEditByAdmin ? '' : 'none';
    }
  }

  // Modal chemical
  if (id === 'modal-chemical' && typeof window.updateGroupSelects === 'function') {
    setTimeout(() => {
      window.updateGroupSelects();
      const cg = document.getElementById('c-group');
      if (cg && cg.dataset.pendingVal !== undefined) cg.value = cg.dataset.pendingVal;
    }, 100);
  }

  // Cập nhật các dropdown chung
  if (typeof window.updatePersonSelects === 'function') window.updatePersonSelects();
  if (typeof window.updateInkSelects === 'function') window.updateInkSelects();

  // Modal electrode reset
  if (id === 'modal-electrode') {
    const cb = document.getElementById('e-is-sample');
    if (cb && !document.getElementById('modal-electrode').dataset.editKey) cb.checked = false;
  }

  // ★ A11y: Setup focus trap
  setupFocusTrap(_md, id);

  // Round 6: fire afterOpen hooks
  fireModalHooks('afterOpen', id);
}

// ── Đóng modal ───────────────────────────────────────────────────────────
export function closeModal(id) {
  document.body.style.overflow = '';
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  delete el.dataset.editKey;

  // Reset title
  const titleEl = el.querySelector('.modal-title');
  if (titleEl) titleEl.textContent = titleEl.textContent.replace('Chỉnh sửa', 'Thêm');

  // Reset footer button
  const footerBtn = el.querySelector('.modal-footer .btn-primary');
  if (footerBtn && footerBtn.textContent === 'Tra cứu') footerBtn.textContent = 'Lưu';
  if (footerBtn && footerBtn.textContent === 'Cập nhật') {
    const defaults = {
      'modal-hydrothermal': 'Lưu thí nghiệm',
      'modal-electrode':    'Lưu điện cực',
      'modal-electrochem':  'Lưu phép đo',
      'modal-chemical':     'Lưu hóa chất',
      'modal-equipment':    'Lưu thiết bị',
      'modal-member':       'Lưu thành viên',
      'modal-ink':          'Lưu công thức',
    };
    if (defaults[id]) footerBtn.textContent = defaults[id];
  }

  // Cleanup paste listeners
  if (id === 'modal-ink-image' && typeof window.handleInkPaste === 'function') {
    document.removeEventListener('paste', window.handleInkPaste);
  }
  if (id === 'modal-electrode-image' && typeof window.handleElectrodePaste === 'function') {
    document.removeEventListener('paste', window.handleElectrodePaste);
  }
  if (id === 'modal-hydro-image' && typeof window.handleHydroPaste === 'function') {
    document.removeEventListener('paste', window.handleHydroPaste);
  }

  // ★ A11y: Teardown focus trap (only if this is the active modal)
  if (_focusTrapState.modalId === id) {
    teardownFocusTrap();
  }
}
