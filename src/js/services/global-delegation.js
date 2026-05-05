/**
 * services/global-delegation.js
 * Round 58a (CSP): event delegation cap document.body cho cac inline event
 * trong index.html da duoc thay bang data-action attributes.
 *
 * Pham vi:
 *  - Modal triggers (open-modal, close-modal)
 *  - Page navigation (show-page)
 *  - Tab switch (switch-auth-tab, switch-electrode-tab, switch-booking-view)
 *  - Save buttons (8 trang chinh)
 *  - Auth (login/register/logout/password)
 *  - Sidebar/notif/toast
 *
 * Idempotent qua flag _globalDelegated tren document.body.
 *
 * Cac delegation cap thap hon (tbody, grid) da co o Round 55-57b - khong
 * conflict vi closest() chon innermost match va event tu bubble:
 *  - Click tren button trong tbody -> tbody listener xu ly truoc, body listener
 *    KHONG fire neu action key khac nhau (vi target.dataset.action khac)
 *  - data-action="open-modal" da bi remove khoi experiments.js tbody listener
 *    de tranh double-call
 */

export function attachGlobalDelegation() {
  if (document.body._globalDelegated) return;
  document.body._globalDelegated = true;

  document.body.addEventListener('click', function(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    switch (action) {
      // Modal triggers
      case 'open-modal':
        if (typeof window.openModal === 'function') window.openModal(target.dataset.modal);
        break;
      case 'close-modal':
        if (typeof window.closeModal === 'function') window.closeModal(target.dataset.modal);
        break;

      // Page navigation
      case 'show-page':
        if (typeof window.showPage === 'function') window.showPage(target.dataset.page, target);
        break;

      // Tab switch
      case 'switch-auth-tab':
        if (typeof window.switchAuthTab === 'function') window.switchAuthTab(target.dataset.tab);
        break;
      case 'switch-electrode-tab':
        if (typeof window.switchElectrodeTab === 'function') window.switchElectrodeTab(target.dataset.tab, target);
        break;
      case 'switch-booking-view':
        if (typeof window.switchBookingView === 'function') window.switchBookingView(target.dataset.view);
        break;

      // Save buttons
      case 'save-hydro':       if (typeof window.saveHydro === 'function') window.saveHydro(); break;
      case 'save-electrode':   if (typeof window.saveElectrode === 'function') window.saveElectrode(); break;
      case 'save-ink':         if (typeof window.saveInk === 'function') window.saveInk(); break;
      case 'save-electrochem': if (typeof window.saveElectrochem === 'function') window.saveElectrochem(); break;
      case 'save-chemical':    if (typeof window.saveChemical === 'function') window.saveChemical(); break;
      case 'save-equipment':   if (typeof window.saveEquipment === 'function') window.saveEquipment(); break;
      case 'save-booking':     if (typeof window.saveBooking === 'function') window.saveBooking(); break;
      case 'save-member':      if (typeof window.saveMember === 'function') window.saveMember(); break;

      // Auth
      case 'do-login':                if (typeof window.doLogin === 'function') window.doLogin(); break;
      case 'do-register':             if (typeof window.doRegister === 'function') window.doRegister(); break;
      case 'do-logout':               if (typeof window.doLogout === 'function') window.doLogout(); break;
      case 'toggle-password-visibility': if (typeof window.togglePasswordVisibility === 'function') window.togglePasswordVisibility(); break;
      case 'check-admin':             if (typeof window.checkAdmin === 'function') window.checkAdmin(); break;
      case 'open-change-password':    if (typeof window.openChangePassword === 'function') window.openChangePassword(); break;

      // Sidebar / mobile
      case 'toggle-mobile-sidebar':   if (typeof window.toggleMobileSidebar === 'function') window.toggleMobileSidebar(); break;
      case 'close-mobile-sidebar':    if (typeof window.closeMobileSidebar === 'function') window.closeMobileSidebar(); break;

      // Lab brand edit
      case 'edit-lab-title':          if (typeof window.editLabTitle === 'function') window.editLabTitle(); break;
      case 'edit-subtitle':           if (typeof window.editSubtitle === 'function') window.editSubtitle(); break;

      // Notifications
      case 'toggle-bell-dropdown':         if (typeof window.toggleBellDropdown === 'function') window.toggleBellDropdown(); break;
      case 'mark-all-notifications-read':  if (typeof window.markAllNotificationsRead === 'function') window.markAllNotificationsRead(); break;
      case 'clear-all-notifications':      if (typeof window.clearAllNotifications === 'function') window.clearAllNotifications(); break;

      // Toast
      case 'undo-delete':             if (typeof window.undoDelete === 'function') window.undoDelete(); break;
      case 'hide-toast':              if (typeof window.hideToast === 'function') window.hideToast(); break;

      // Misc no-arg modals
      case 'open-booking-modal-global':   if (typeof window.openBookingModal === 'function') window.openBookingModal(); break;
      case 'open-custom-theme-picker':    if (typeof window.openCustomThemePicker === 'function') window.openCustomThemePicker(); break;
      case 'confirm-reject-booking':      if (typeof window.confirmRejectBooking === 'function') window.confirmRejectBooking(); break;
    }
  });

  // ── SUBMIT (forms) ─────────────────────────────────
  document.body.addEventListener('submit', function(e) {
    const target = e.target.closest('[data-submit-action]');
    if (!target) return;
    e.preventDefault();
    const action = target.dataset.submitAction;
    if (action === 'login') {
      if (typeof window.doLogin === 'function') window.doLogin();
    } else if (action === 'register') {
      if (typeof window.doRegister === 'function') window.doRegister();
    }
  });

  // ── CHANGE (selects, checkboxes, file inputs) ─────
  document.body.addEventListener('change', function(e) {
    const target = e.target.closest('[data-change-action]');
    if (!target) return;
    const action = target.dataset.changeAction;

    switch (action) {
      case 'change-avatar':
        if (typeof window.changeAvatar === 'function') window.changeAvatar(target);
        break;
      case 'chat-pick-image':
        if (typeof window.chatPickImage === 'function') window.chatPickImage(target);
        break;
      case 'toggle-dark-mode':
        if (typeof window.toggleDarkMode === 'function') window.toggleDarkMode(target.checked);
        break;
      case 'render-hydro':       if (typeof window.renderHydro === 'function') window.renderHydro(); break;
      case 'render-electrode':   if (typeof window.renderElectrode === 'function') window.renderElectrode(); break;
      case 'render-electrochem': if (typeof window.renderElectrochem === 'function') window.renderElectrochem(); break;
      case 'render-chemicals':   if (typeof window.renderChemicals === 'function') window.renderChemicals(); break;
      case 'render-equipment':   if (typeof window.renderEquipment === 'function') window.renderEquipment(); break;
      case 'render-booking':     if (typeof window.renderBooking === 'function') window.renderBooking(); break;
      case 'set-member-filter':
        if (typeof window.setMemberFilter === 'function') {
          window.setMemberFilter(target.dataset.target, target.value);
        }
        break;
      case 'cal-jump-to-date':
        if (typeof window.calJumpToDate === 'function') window.calJumpToDate(target.value);
        break;
      case 'day-jump-to':
        if (typeof window.dayJumpTo === 'function') window.dayJumpTo(target.value);
        break;
    }
  });

  // ── INPUT (text inputs - search + autoPrefix + chat) ─
  document.body.addEventListener('input', function(e) {
    const target = e.target.closest('[data-input-action]');
    if (!target) return;
    const action = target.dataset.inputAction;

    switch (action) {
      case 'search': {
        // Search inputs co chained logic: reset + render + toggle clear button
        const resetFnName = target.dataset.resetFn;
        const renderFnName = target.dataset.renderFn;
        const clearBtnId = target.dataset.clearBtn;
        if (resetFnName && typeof window[resetFnName] === 'function') {
          window[resetFnName]();
        }
        if (renderFnName && typeof window[renderFnName] === 'function') {
          window[renderFnName]();
        }
        if (clearBtnId) {
          const btn = document.getElementById(clearBtnId);
          if (btn) btn.style.display = target.value ? 'flex' : 'none';
        }
        break;
      }
      case 'auto-prefix': {
        const prefix = target.dataset.prefix;
        if (prefix && typeof window.autoPrefix === 'function') {
          window.autoPrefix(target, prefix);
        }
        break;
      }
      case 'chat-input':
        if (typeof window.chatInput === 'function') window.chatInput(target);
        break;
      case 'header-search':
        if (typeof window.headerSearch === 'function') window.headerSearch(target);
        break;
    }
  });

  // ── KEYDOWN (Enter handlers) ──────────────────────
  document.body.addEventListener('keydown', function(e) {
    const target = e.target.closest('[data-keydown-action]');
    if (!target) return;
    const action = target.dataset.keydownAction;

    if (action === 'chat-keydown') {
      // Special: pass full event to chatKeydown
      if (typeof window.chatKeydown === 'function') window.chatKeydown(e);
      return;
    }

    // Cac keydown khac chi trigger khi Enter
    if (e.key !== 'Enter') return;

    switch (action) {
      case 'focus-next': {
        const nextId = target.dataset.nextId;
        const next = document.getElementById(nextId);
        if (next) next.focus();
        break;
      }
      case 'do-login':         if (typeof window.doLogin === 'function') window.doLogin(); break;
      case 'do-register':      if (typeof window.doRegister === 'function') window.doRegister(); break;
      case 'add-chem-group':   if (typeof window.addChemGroup === 'function') window.addChemGroup(); break;
      case 'add-eq-group':     if (typeof window.addEqGroup === 'function') window.addEqGroup(); break;
      case 'check-admin':      if (typeof window.checkAdmin === 'function') window.checkAdmin(); break;
    }
  });

  // ── HEADER SEARCH BOX focus/blur (phuc tap) ───────
  // Logic: focus -> expand box; blur -> if empty, collapse
  // Khong dung delegation vi can listen tren chinh element (focus/blur khong bubble)
  const hsInput = document.querySelector('[data-header-search="1"]');
  if (hsInput) {
    hsInput.addEventListener('focus', function() {
      const b = document.getElementById('header-search-box');
      if (b) {
        b.style.width = '240px';
        b.style.borderColor = 'var(--teal)';
        b.style.borderRadius = '20px';
      }
      this.style.width = '180px';
      this.style.padding = '0 8px 0 0';
    });
    hsInput.addEventListener('blur', function() {
      const self = this;
      setTimeout(function() {
        if (!self.value) {
          const b = document.getElementById('header-search-box');
          if (b) {
            b.style.width = '40px';
            b.style.borderColor = '#e2e8f0';
            b.style.borderRadius = '50%';
          }
          self.style.width = '0';
          self.style.padding = '0';
        }
      }, 300);
    });
  }

  // ── INJECT CSS for auth/chat input focus ──────────
  // Thay cho onfocus/onblur inline
  if (!document.getElementById('global-input-css')) {
    const style = document.createElement('style');
    style.id = 'global-input-css';
    style.textContent =
      '[data-auth-input="1"]:focus{border-color:var(--teal) !important;background:var(--teal-light) !important}' +
      '[data-chat-input="1"]:focus{border-color:var(--teal) !important}';
    document.head.appendChild(style);
  }
}
