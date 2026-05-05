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
}
