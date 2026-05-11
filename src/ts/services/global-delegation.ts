/**
 * services/global-delegation.ts
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
// @ts-nocheck — Service layer — DOM event handlers + legacy patterns. Defer typing until UI rewrite.


export function attachGlobalDelegation() {
  if (document.body._globalDelegated) return;
  document.body._globalDelegated = true;

  // R150d-2: Input handler for search-materials (debounced)
  let _matSearchTimer: any = null;
  document.body.addEventListener('input', function(e) {
    const t = (e.target as HTMLElement);
    if (!t || !(t as any).dataset || (t as any).dataset.inputAction !== 'search-materials') return;
    clearTimeout(_matSearchTimer);
    const val = (t as HTMLInputElement).value || '';
    _matSearchTimer = setTimeout(() => {
      if (typeof (window as any).searchMaterialsHandler === 'function') {
        (window as any).searchMaterialsHandler(val);
      }
    }, 250);
  });

  // R151d-1: Input handler for search-samples (debounced)
  let _smpSearchTimer: any = null;
  document.body.addEventListener('input', function(e) {
    const t = (e.target as HTMLElement);
    if (!t || !(t as any).dataset || (t as any).dataset.inputAction !== 'search-samples') return;
    clearTimeout(_smpSearchTimer);
    const val = (t as HTMLInputElement).value || '';
    _smpSearchTimer = setTimeout(() => {
      if (typeof (window as any).searchSamplesHandler === 'function') {
        (window as any).searchSamplesHandler(val);
      }
    }, 250);
  });

  // R151d-2: Parent search typeahead (real-time, no debounce — small list)
  document.body.addEventListener('input', function(e) {
    const t = (e.target as HTMLElement);
    if (!t || (t as HTMLInputElement).id !== 'smp-parent-search') return;
    const val = (t as HTMLInputElement).value || '';
    if (typeof (window as any).searchParentsHandler === 'function') {
      (window as any).searchParentsHandler(val);
    }
  });

  // R152c-1: Experiments type filter change
  document.body.addEventListener('change', function(e) {
    const t = (e.target as HTMLElement);
    if (!t || !(t as any).dataset || (t as any).dataset.changeAction !== 'filter-experiments-type') return;
    const val = (t as HTMLSelectElement).value || '';
    if (typeof (window as any).filterExperimentsByType === 'function') {
      (window as any).filterExperimentsByType(val);
    }
  });

  // R152c-2: Experiment form type change → re-render conditions
  document.body.addEventListener('change', function(e) {
    const t = (e.target as HTMLElement);
    if (!t || !(t as any).dataset || (t as any).dataset.changeAction !== 'experiment-form-type-change') return;
    const val = (t as HTMLSelectElement).value || '';
    if (typeof (window as any).changeExperimentFormType === 'function') {
      (window as any).changeExperimentFormType(val);
    }
  });

  // R152c-2: Sample picker search inputs (input + output)
  document.body.addEventListener('input', function(e) {
    const t = (e.target as HTMLElement);
    if (!t || !(t as any).dataset) return;
    const action = (t as any).dataset.inputAction;
    if (action === 'search-exp-input-samples') {
      const val = (t as HTMLInputElement).value || '';
      if (typeof (window as any).searchExpInputSamplesHandler === 'function') {
        (window as any).searchExpInputSamplesHandler(val);
      }
    } else if (action === 'search-exp-output-samples') {
      const val = (t as HTMLInputElement).value || '';
      if (typeof (window as any).searchExpOutputSamplesHandler === 'function') {
        (window as any).searchExpOutputSamplesHandler(val);
      }
    }
  });

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

      // R150d-2: Materials CRUD
      case 'open-material-detail': {
        const id = target.dataset.id;
        if (id && typeof window.openMaterialDetail === 'function') window.openMaterialDetail(id);
        break;
      }
      case 'open-material-form':
        if (typeof window.openMaterialForm === 'function') window.openMaterialForm(null);
        break;
      case 'edit-material':
        if (typeof window.closeModal === 'function') window.closeModal('modal-material-detail');
        if (typeof window.openMaterialFormFromDetail === 'function') window.openMaterialFormFromDetail();
        break;
      case 'submit-material-form':
        if (typeof window.submitMaterialForm === 'function') window.submitMaterialForm();
        break;

      // R151c: Samples
      case 'open-sample-detail': {
        const id = target.dataset.id;
        if (id && typeof window.openSampleDetail === 'function') window.openSampleDetail(id);
        break;
      }
      // R151d-1: Sample CRUD
      case 'open-sample-form':
        if (typeof window.openSampleForm === 'function') window.openSampleForm(null);
        break;
      case 'edit-sample':
        if (typeof window.closeModal === 'function') window.closeModal('modal-sample-detail');
        if (typeof window.openSampleFormFromDetail === 'function') window.openSampleFormFromDetail();
        break;
      case 'submit-sample-form':
        if (typeof window.submitSampleForm === 'function') window.submitSampleForm();
        break;

      // R151d-2: Lineage picker
      case 'add-parent-badge': {
        const pid = target.dataset.id;
        if (pid && typeof window.addParentBadge === 'function') window.addParentBadge(pid);
        break;
      }
      case 'remove-parent-badge': {
        const pid = target.dataset.id;
        if (pid && typeof window.removeParentBadge === 'function') window.removeParentBadge(pid);
        break;
      }

      // R152c-1: Experiments unified
      case 'open-experiment-detail': {
        const id = target.dataset.id;
        if (id && typeof window.openExperimentDetail === 'function') window.openExperimentDetail(id);
        break;
      }
      // R152c-2: Experiments form
      case 'open-experiment-form':
        if (typeof window.openExperimentForm === 'function') window.openExperimentForm();
        break;
      case 'submit-experiment-form':
        if (typeof window.submitExperimentForm === 'function') window.submitExperimentForm();
        break;
      case 'exp-add-input-sample': {
        const id = target.dataset.id;
        if (id && typeof window.addExpInputSample === 'function') window.addExpInputSample(id);
        break;
      }
      case 'exp-add-output-sample': {
        const id = target.dataset.id;
        if (id && typeof window.addExpOutputSample === 'function') window.addExpOutputSample(id);
        break;
      }
      case 'exp-remove-input-sample': {
        const id = target.dataset.id;
        if (id && typeof window.removeExpInputSample === 'function') window.removeExpInputSample(id);
        break;
      }
      case 'exp-remove-output-sample': {
        const id = target.dataset.id;
        if (id && typeof window.removeExpOutputSample === 'function') window.removeExpOutputSample(id);
        break;
      }

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

      // Round 58c additions
      case 'clear-search': {
        const searchId = target.dataset.searchId;
        const renderFnName = target.dataset.renderFn;
        const input = document.getElementById(searchId);
        if (input) input.value = '';
        if (renderFnName && typeof window[renderFnName] === 'function') {
          window[renderFnName]();
        }
        target.style.display = 'none';
        break;
      }
      case 'focus-element': {
        const id = target.dataset.targetId;
        const el = document.getElementById(id);
        if (el) el.focus();
        break;
      }
      case 'apply-theme':
        if (typeof window.applyTheme === 'function') window.applyTheme(target.dataset.theme);
        break;
      case 'export-excel': {
        const tgt = target.dataset.target;
        const fnMap = {
          hydro: 'exportHydroExcel',
          electrode: 'exportElectrodeExcel',
          electrochem: 'exportElectrochemExcel',
          chemicals: 'exportChemicalsExcel',
          equipment: 'exportEquipmentExcel',
          bookings: 'exportBookingsExcel',
        };
        const fn = fnMap[tgt];
        if (fn && typeof window[fn] === 'function') window[fn]();
        break;
      }
      case 'toggle-booking-sort':
        if (typeof window.toggleBookingSort === 'function') window.toggleBookingSort(target.dataset.sortKey);
        break;
      case 'cal-nav-prev':  if (typeof window.calNavWeek === 'function') window.calNavWeek(-1); break;
      case 'cal-nav-next':  if (typeof window.calNavWeek === 'function') window.calNavWeek(1); break;
      case 'cal-today':     if (typeof window.calToday === 'function') window.calToday(); break;
      case 'day-nav-prev':  if (typeof window.dayNav === 'function') window.dayNav(-1); break;
      case 'day-nav-next':  if (typeof window.dayNav === 'function') window.dayNav(1); break;
      case 'day-today':     if (typeof window.dayToday === 'function') window.dayToday(); break;

      case 'toggle-history':              if (typeof window.toggleHistory === 'function') window.toggleHistory(); break;
      case 'reset-avatar':                if (typeof window.resetAvatar === 'function') window.resetAvatar(); break;
      case 'add-chem':                    if (typeof window.addChem === 'function') window.addChem(); break;
      case 'add-ink-row': {
        const tbody = target.dataset.tbody;
        if (typeof window.addInkRow === 'function') {
          // Khi co data-tbody (modal Ink): pass arg; khi khong co (fallback): no-arg
          if (tbody) window.addInkRow(tbody);
          else window.addInkRow();
        }
        break;
      }
      case 'toggle-chat-widget-close':
        if (typeof window.toggleChatWidget === 'function') window.toggleChatWidget(false);
        break;
      case 'add-chem-group':              if (typeof window.addChemGroup === 'function') window.addChemGroup(); break;
      case 'add-eq-group':                if (typeof window.addEqGroup === 'function') window.addEqGroup(); break;
      case 'lookup-cas':                  if (typeof window.lookupCAS === 'function') window.lookupCAS(); break;
      case 'open-pdf-report-modal':       if (typeof window.openPdfReportModal === 'function') window.openPdfReportModal(); break;
      case 'toggle-chat-widget':          if (typeof window.toggleChatWidget === 'function') window.toggleChatWidget(); break;
      case 'chat-send':                   if (typeof window.chatSend === 'function') window.chatSend(); break;
      case 'chat-clear-image':            if (typeof window.chatClearImage === 'function') window.chatClearImage(); break;
      case 'remove-equipment-image-preview': if (typeof window.removeEquipmentImagePreview === 'function') window.removeEquipmentImagePreview(); break;
      case 'delete-hydro-image':          if (typeof window.deleteHydroImage === 'function') window.deleteHydroImage(); break;
      case 'delete-electrode-image':      if (typeof window.deleteElectrodeImage === 'function') window.deleteElectrodeImage(); break;
      case 'delete-ink-image':            if (typeof window.deleteInkImage === 'function') window.deleteInkImage(); break;
      case 'delete-chemical-image':       if (typeof window.deleteChemicalImage === 'function') window.deleteChemicalImage(); break;

      case 'remove-chem':
        if (typeof window.removeChem === 'function') window.removeChem(target);
        break;
      case 'show-clear-all-confirm':
        if (typeof window.showClearAllConfirm === 'function') window.showClearAllConfirm(target);
        break;

      // ════════ AI Chat Sidetab (Round 108) ════════
      case 'ai-chat-toggle':
        if (typeof window.toggleAiChatSidetab === 'function') window.toggleAiChatSidetab();
        break;
      case 'ai-chat-close':
        if (typeof window.closeAiChatSidetab === 'function') window.closeAiChatSidetab();
        break;
      // ════════ AI Tools Sidetab (Round 131) ════════
      case 'ai-tools-toggle':
        if (typeof window.toggleAiToolsSidetab === 'function') window.toggleAiToolsSidetab();
        break;
      case 'ai-tools-tab-switch':
        if (typeof window.onAiToolsTabSwitch === 'function') window.onAiToolsTabSwitch(target);
        break;
      case 'ai-tools-resize-start':
        if (typeof window.onAiToolsResizeStart === 'function' && e) window.onAiToolsResizeStart(target, e);
        break;
      // ════════ Paper Library (Round 132b) ════════
      case 'ai-paper-pick':
        if (typeof window.onPaperPickClick === 'function') window.onPaperPickClick();
        break;
      case 'ai-paper-file-selected':
        if (typeof window.onPaperFileSelected === 'function') window.onPaperFileSelected(target as HTMLInputElement);
        break;
      case 'ai-paper-delete':
        if (typeof window.onPaperDelete === 'function') window.onPaperDelete(target);
        break;
      case 'ai-paper-reextract':
        if (typeof window.onPaperReExtract === 'function') window.onPaperReExtract(target);
        break;
      // ════════ Paper Search (Round 136b) ════════
      case 'ai-paper-search-submit':
        if (typeof window.onPaperSearchSubmit === 'function') window.onPaperSearchSubmit();
        break;
      case 'ai-paper-search-keydown':
        if (typeof window.onPaperSearchKeydown === 'function' && e) window.onPaperSearchKeydown(target, e);
        break;
      case 'ai-paper-search-clear':
        if (typeof window.onPaperSearchClear === 'function') window.onPaperSearchClear();
        break;
      case 'ai-chat-suggestion':
        if (typeof window.onAiChatSuggestion === 'function') window.onAiChatSuggestion(target);
        break;
      case 'ai-chat-send':
        if (typeof window.onAiChatSend === 'function') window.onAiChatSend();
        break;
      // Round 109: Conversation list cases
      case 'ai-chat-new-chat':
        if (typeof window.onNewChatClick === 'function') window.onNewChatClick();
        break;
      case 'ai-chat-load-conv':
        if (typeof window.onLoadConv === 'function') window.onLoadConv(target);
        break;
      case 'ai-chat-delete-conv':
        if (typeof window.onDeleteConv === 'function') window.onDeleteConv(target, e);
        break;
      case 'ai-chat-toggle-conv-sidebar':
        if (typeof window.toggleConvSidebar === 'function') window.toggleConvSidebar();
        break;
      // Round 110: Message actions
      case 'ai-msg-copy':
        if (typeof window.onCopyMessage === 'function') window.onCopyMessage(target);
        break;
      // Round 113b: Regenerate response
      case 'ai-msg-regenerate':
        if (typeof (window as any).regenerateLastResponse === 'function') (window as any).regenerateLastResponse();
        break;
      // Round 114b: Voice
      case 'ai-mic-toggle':
        if (typeof (window as any).onAiMicToggle === 'function') (window as any).onAiMicToggle();
        break;
      case 'ai-msg-speak':
        if (typeof (window as any).onAiMsgSpeak === 'function') (window as any).onAiMsgSpeak(target);
        break;
      // Round 115b: Action confirmation
      case 'ai-confirm-action':
        if (typeof (window as any).onConfirmAction === 'function') (window as any).onConfirmAction(target);
        break;
      case 'ai-cancel-action':
        if (typeof (window as any).onCancelAction === 'function') (window as any).onCancelAction(target);
        break;
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

      // Round 58c: modal form changes
      case 'upload-hydro-image':       if (typeof window.uploadHydroImage === 'function') window.uploadHydroImage(target); break;
      case 'upload-electrode-image':   if (typeof window.uploadElectrodeImage === 'function') window.uploadElectrodeImage(target); break;
      case 'upload-ink-image':         if (typeof window.uploadInkImage === 'function') window.uploadInkImage(target); break;
      case 'upload-chemical-image':    if (typeof window.uploadChemicalImage === 'function') window.uploadChemicalImage(target); break;
      case 'preview-equipment-image':  if (typeof window.previewEquipmentImage === 'function') window.previewEquipmentImage(target); break;
      case 'fill-ink-formula':         if (typeof window.fillInkFormula === 'function') window.fillInkFormula(); break;
      case 'sync-unit':                if (typeof window.syncUnit === 'function') window.syncUnit(); break;
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

      // Round 58c: modal form inputs
      case 'search-chem':
        if (typeof window.searchChem === 'function') window.searchChem(target);
        break;
      case 'calc-mol':
        if (typeof window.calcMol === 'function') window.calcMol(target);
        break;
      case 'calc-loading':
        if (typeof window.calcLoading === 'function') window.calcLoading();
        break;
      case 'search-electrode':
        if (typeof window.searchElectrode === 'function') window.searchElectrode(target);
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

  // R125: form data-noop-submit="1" — chặn submit event (thay cho onsubmit
  // inline để pass CSP strict). Wrap password fields trong <form> để
  // password manager nhận diện, nhưng không submit.
  document.body.addEventListener('submit', function(e) {
    const t = e.target as HTMLElement;
    if (t && t.tagName === 'FORM' && (t as HTMLElement).dataset?.noopSubmit === '1') {
      e.preventDefault();
    }
  });

  // ── Round 58c: INJECT CSS for hover effects ───────
  // Thay cho onmouseover/out inline tren cac element
  if (!document.getElementById('global-hover-css')) {
    const style = document.createElement('style');
    style.id = 'global-hover-css';
    style.textContent =
      // Auth button hover
      '[data-hover="auth-btn"]:hover{background:#0f766e !important}' +
      // Bell button hover
      '[data-hover="bell-btn"]:hover{background:var(--teal-light) !important;border-color:var(--teal-3) !important}' +
      // Avatar trigger hover
      '[data-hover="avatar-trigger"]:hover{border-color:var(--teal) !important}' +
      // Admin action button (changeAvatar)
      '[data-hover="admin-action-btn"]:hover{background:var(--teal) !important;color:white !important;transform:translate(1px,-1px)}' +
      // Logout button (resetAvatar)
      '[data-hover="logout-btn"]:hover{background:#fef2f2 !important;transform:translate(1px,-1px)}' +
      // Del-circle red (group delete buttons in modals)
      '[data-hover="del-circle-red"]:hover{background:#dc2626 !important}' +
      // Chat message hover
      '[data-hover="chat-msg"]:hover{background:var(--surface-3) !important}' +
      // Chat send button
      '[data-hover="chat-send-btn"]:hover{background:var(--teal-2) !important}' +
      // Chat widget clear-all button
      '[data-hover="cw-clear-btn"]:hover{background:rgba(255,255,255,0.18) !important;opacity:1 !important}';
    document.head.appendChild(style);
  }

  // ── Round 58c: bell-wrapper hover (logic phuc tap) ─
  // Cho dropdown notif: enter -> show ngay; leave -> hide sau 200ms
  const bellWrapper = document.querySelector('[data-bell-wrapper="1"]');
  if (bellWrapper && !bellWrapper._delegated) {
    bellWrapper._delegated = true;
    bellWrapper.addEventListener('mouseenter', function() {
      if (window._bellTimer) clearTimeout(window._bellTimer);
      const dropdown = document.getElementById('bell-dropdown');
      if (dropdown) dropdown.style.display = 'block';
      if (typeof window.renderNotificationsList === 'function') {
        window.renderNotificationsList();
      }
    });
    bellWrapper.addEventListener('mouseleave', function() {
      window._bellTimer = setTimeout(function() {
        const dropdown = document.getElementById('bell-dropdown');
        if (dropdown) dropdown.style.display = 'none';
      }, 200);
    });
  }

  // ── Round 58c: avatar-wrapper hover (similar to bell)
  const avatarWrapper = document.querySelector('[data-avatar-wrapper="1"]');
  if (avatarWrapper && !avatarWrapper._delegated) {
    avatarWrapper._delegated = true;
    avatarWrapper.addEventListener('mouseenter', function() {
      if (window._avatarTimer) clearTimeout(window._avatarTimer);
      const menu = document.getElementById('avatar-menu');
      if (menu) menu.style.display = 'block';
    });
    avatarWrapper.addEventListener('mouseleave', function() {
      window._avatarTimer = setTimeout(function() {
        const menu = document.getElementById('avatar-menu');
        if (menu) menu.style.display = 'none';
      }, 200);
    });
  }

  // ── Round 58c: header search box hover (expand/collapse w/ delay)
  const hsBox = document.querySelector('[data-header-search-box="1"]');
  if (hsBox && !hsBox._delegated) {
    hsBox._delegated = true;
    hsBox.addEventListener('mouseenter', function() {
      if (window._srchTimer) clearTimeout(window._srchTimer);
      const i = document.getElementById('header-search-input');
      const b = this;
      b.style.width = '240px';
      b.style.borderColor = 'var(--teal)';
      b.style.borderRadius = '20px';
      if (i) {
        i.style.width = '180px';
        i.style.padding = '0 8px 0 0';
        i.focus();
      }
    });
    hsBox.addEventListener('mouseleave', function() {
      window._srchTimer = setTimeout(function() {
        const i = document.getElementById('header-search-input');
        if (!i || i.value) return;
        i.blur();
        const b = document.getElementById('header-search-box');
        if (b) {
          b.style.width = '40px';
          b.style.borderColor = '#e2e8f0';
          b.style.borderRadius = '50%';
        }
        i.style.width = '0';
        i.style.padding = '0';
      }, 400);
    });
  }

  // ── Round 58c: header search button hover (border on enter, conditional on leave)
  const hsBtn = document.querySelector('[data-header-search-btn="1"]');
  if (hsBtn && !hsBtn._delegated) {
    hsBtn._delegated = true;
    hsBtn.addEventListener('mouseenter', function() {
      this.style.borderColor = 'var(--teal)';
    });
    hsBtn.addEventListener('mouseleave', function() {
      const input = document.getElementById('header-search-input');
      if (!input || !input.matches(':focus')) {
        this.style.borderColor = '#e2e8f0';
      }
    });
  }

  // ── Round 58e: drag-drop delegation for image upload zones ──────
  // Pattern A: Pattern B (border + bg style change) - 4 modal drop zones
  // Pattern C: class toggle (chemical main)
  // Pattern D: opacity change + file processing (preview drops)
  // Calendar edge zones (cal-edge-zone) handled separately in booking.js

  document.body.addEventListener('dragover', function(e) {
    // Drop zones with style change (Pattern B)
    const dz = e.target.closest('[data-drop-zone]');
    if (dz) {
      e.preventDefault();
      const cls = dz.dataset.dropClass;
      if (cls) {
        // Pattern C: class toggle (chemical-main)
        dz.classList.add(cls);
        return;
      }
      // Pattern B: style change
      const borderActive = dz.dataset.dropBorderActive;
      const bgActive = dz.dataset.dropBgActive;
      if (borderActive) dz.style.borderColor = borderActive;
      if (bgActive) dz.style.background = bgActive;
      return;
    }
    // Drop preview zones (Pattern D)
    const dp = e.target.closest('[data-drop-preview]');
    if (dp) {
      e.preventDefault();
      const opacityActive = dp.dataset.dropOpacityActive;
      if (opacityActive) dp.style.opacity = opacityActive;
      return;
    }
  });

  document.body.addEventListener('dragleave', function(e) {
    const dz = e.target.closest('[data-drop-zone]');
    if (dz) {
      const cls = dz.dataset.dropClass;
      if (cls) {
        // Pattern C: class toggle - check relatedTarget like original
        if (!dz.contains(e.relatedTarget)) {
          dz.classList.remove(cls);
        }
        return;
      }
      // Pattern B: restore style
      const borderRest = dz.dataset.dropBorderRest;
      const bgRest = dz.dataset.dropBgRest;
      if (borderRest !== undefined) dz.style.borderColor = borderRest;
      if (bgRest !== undefined) dz.style.background = bgRest;
      return;
    }
    const dp = e.target.closest('[data-drop-preview]');
    if (dp) {
      dp.style.opacity = '1';
    }
  });

  document.body.addEventListener('drop', function(e) {
    const dz = e.target.closest('[data-drop-zone]');
    if (dz) {
      const fn = dz.dataset.dropFn;
      const cls = dz.dataset.dropClass;
      if (cls) dz.classList.remove(cls);
      // Restore Pattern B style
      const borderRest = dz.dataset.dropBorderRest;
      const bgRest = dz.dataset.dropBgRest;
      if (borderRest !== undefined) dz.style.borderColor = borderRest;
      if (bgRest !== undefined) dz.style.background = bgRest;
      // Call drop function
      if (fn && typeof window[fn] === 'function') {
        window[fn](e);
      }
      return;
    }
    const dp = e.target.closest('[data-drop-preview]');
    if (dp) {
      e.preventDefault();
      dp.style.opacity = '1';
      // Pattern D inline logic: extract file + check image type + call fn
      const fn = dp.dataset.dropFn;
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && f.type && f.type.startsWith('image/') && typeof window[fn] === 'function') {
        window[fn]({ files: [f] });
      }
    }
  });
}


// ═══════════════════════════════════════════════════════════
// R153b — DataAsset action handlers (delegation extension)
// ═══════════════════════════════════════════════════════════

(function attachDataAssetDelegation() {
  const flag = '__dataAssetDelegationAttached';
  if ((document.body as any)[flag]) return;
  (document.body as any)[flag] = true;

  // Click delegation: download, delete, type-select user-picked tracking
  document.body.addEventListener('click', async (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'da-download') {
      const id = target.dataset.assetId;
      if (id && typeof (window as any).handleDataAssetDownload === 'function') {
        await (window as any).handleDataAssetDownload(id);
      }
    } else if (action === 'da-delete') {
      const id = target.dataset.assetId;
      const name = target.dataset.assetName || '(unknown)';
      const expWrap = target.closest('[data-experiment-id]') as HTMLElement | null;
      const expId = expWrap?.dataset.experimentId;
      if (id && expId && typeof (window as any).handleDataAssetDelete === 'function') {
        await (window as any).handleDataAssetDelete(id, name, expId);
      }
    }
  });

  // Change delegation: file pick triggers upload; mark type-select as user-picked
  document.body.addEventListener('change', async (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.matches?.('[data-input-action="da-file-pick"]')) {
      const expId = (target as HTMLInputElement).dataset.experimentId;
      if (expId && typeof (window as any).handleDataAssetFilePick === 'function') {
        await (window as any).handleDataAssetFilePick(expId);
      }
    } else if (target.matches?.('.lb-da-type-select')) {
      // Mark as user-picked so auto-detect doesn't override
      (target as HTMLSelectElement).dataset.userPicked = '1';
    }
  });
})();


// ═══════════════════════════════════════════════════════════
// R153c — DataAssets gallery page action handlers
// ═══════════════════════════════════════════════════════════

(function attachDataAssetsGalleryDelegation() {
  const flag = '__dataAssetsGalleryDelegationAttached';
  if ((document.body as any)[flag]) return;
  (document.body as any)[flag] = true;

  document.body.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'da-filter') {
      const type = target.dataset.type || '';
      if (typeof (window as any).filterDataAssetsByType === 'function') {
        (window as any).filterDataAssetsByType(type);
      }
    } else if (action === 'da-card-click') {
      const id = target.dataset.assetId;
      if (id && typeof (window as any).openDataAssetPreview === 'function') {
        void (window as any).openDataAssetPreview(id);
      }
    }
  });
})();


// ═══════════════════════════════════════════════════════════
// R154-1 — Lineage graph button delegation
// ═══════════════════════════════════════════════════════════

(function attachLineageGraphDelegation() {
  const flag = '__lineageGraphDelegationAttached';
  if ((document.body as any)[flag]) return;
  (document.body as any)[flag] = true;

  document.body.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-action="open-lineage-graph"]') as HTMLElement | null;
    if (!target) return;
    const expId = target.dataset.experimentId;
    if (expId && typeof (window as any).openLineageGraphModal === 'function') {
      void (window as any).openLineageGraphModal(expId);
    }
  });
})();


// ═══════════════════════════════════════════════════════════
// R154-3 — Lineage page filter + search delegation
// ═══════════════════════════════════════════════════════════

(function attachLineageFilterDelegation() {
  const flag = '__lineageFilterDelegationAttached';
  if ((document.body as any)[flag]) return;
  (document.body as any)[flag] = true;

  document.body.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'lineage-toggle-type') {
      const type = target.dataset.type;
      if (type && typeof (window as any).toggleLineageType === 'function') {
        (window as any).toggleLineageType(type);
      }
    } else if (action === 'lineage-search-clear') {
      if (typeof (window as any).clearLineageSearch === 'function') {
        (window as any).clearLineageSearch();
      }
    }
  });

  document.body.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement | null;
    if (!target || !target.matches?.('[data-input-action="lineage-search"]')) return;
    if (typeof (window as any).setLineageSearch === 'function') {
      (window as any).setLineageSearch(target.value || '');
    }
  });
})();
