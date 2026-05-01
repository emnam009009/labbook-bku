/**
 * main.js
 * Entry point — import CSS, Firebase, và chạy toàn bộ ứng dụng
 * Vite sẽ bundle file này cùng tất cả imports thành 1 file tối ưu
 */

// ── Import CSS ───────────────────────────────────────────
import '../css/main.css'
import '../css/theme-swatches.css'

// ── Import Firebase ───────────────────────────────────────
import { db, ref, push, onValue, fbListen, fbPush, fbSet, fbGet, fbDel, update } from './firebase.js'
import { initAuth, login, logout, register, currentAuth, applyRoleUI, updateDisplayName } from './auth.js'

// ── Import utilities (Phần 1 refactor) ───────────────────
import { escapeHtml, escapeJs, vals, fuzzy, normalizeSub, formatChemical, fmtDate, autoPrefix } from './utils/format.js'
import { flashRow, setText, setHtml } from './utils/dom.js'
import { getPersonName, canDelete, canEdit, syncAuthState } from './utils/auth-helpers.js'
import { safeAsync } from './utils/async.js'
import { logHistory } from './services/history-log.js'

// ── Import UI core (Phần 2 refactor) ─────────────────────
import { openModal, closeModal, registerModalHook, fireModalHooks } from './ui/modal.js'
import { showToast, hideToast, undoDelete } from './ui/toast.js'
import { showPage, toggleSidebarSection, toggleHistory, switchElectrodeTab } from './ui/navigation.js'

// ── Import listeners + render dispatcher + dashboard (Phần 3) ──
import { startListeners, stopListeners, updateChatFabBadge } from './services/listeners.js'
import { renderAll } from './services/render-dispatcher.js'
import { renderDash } from './pages/dashboard.js'

// ── Theme picker ──────────────────────────────────────────
import { initTheme } from './services/theme.js'
import './services/theme-picker-ui.js'
import { initMemberFilter } from './services/member-filter.js'

// ── Import experiment pages (Phần 4) ─────────────────────
import { renderHydro, renderElectrode, renderElectrochem } from './pages/experiments.js'

// ── Import chemicals page (Phần 5a) ──────────────────────
import { renderChemicals, toggleChemGroup } from './pages/chemicals.js'

// ── Import ink page (Phần 5b) ────────────────────────────
import { renderInk } from './pages/ink.js'

// ── Import equipment page (Phần 5c) ──────────────────────
import { renderEquipment, toggleEqGroup } from './pages/equipment.js'
import { renderBooking } from './pages/booking.js'

// ── Import members + history + users + avatar (Phần 6) ──
import { renderMembers } from './pages/members.js'
import { renderHistory } from './pages/history.js'
import { renderUsers } from './pages/users.js'
import { toggleAvatarMenu, changeAvatar, resetAvatar, updateAvatarUI } from './services/avatar.js'

// ── Import save handlers (Phần 7a) ───────────────────────
import {
  saveHydro, saveElectrode, saveElectrochem, saveMember,
  saveInk, saveChemical, saveEquipment
} from './services/save-handlers.js'

// ── Import image handlers (Phần 7b) ──────────────────────
import {
  showInkImage, handleInkPaste, dropInkImage, uploadInkImage, deleteInkImage,
  showElectrodeImage, handleElectrodePaste, dropElectrodeImage, uploadElectrodeImage, deleteElectrodeImage,
  showHydroImage, handleHydroPaste, dropHydroImage, uploadHydroImage, deleteHydroImage,
  showChemicalImage, dropImageToCell, uploadChemicalImage, dropChemicalImage, deleteChemicalImage,
  previewEquipmentImage, dropEquipmentImageToCell, dropEquipmentImage, removeEquipmentImagePreview, showEquipmentImage
} from './services/image-handlers.js'

// ── Import chat widget (Phần 7c) ─────────────────────────
import {
  cleanupChat, initChat, chatSend, chatInput, chatKeydown,
  chatPickImage, chatClearImage, insertMention,
  showReactionPicker, toggleReaction, toggleChatWidget, _updateChatWidgetRole
} from './pages/chat.js'

// ── Import edit handlers (Phần 7d) ───────────────────────
import {
  editElectrode, editElectrochem, editMember, editHydro, editInk,
  editChemical, editEquipment, editSubtitle, editLabTitle
} from './services/edit-handlers.js'

// ── Import group + lock management (Phần 7d) ────────────
import {
  lockItem, unlockItem, lockInk, unlockInk,
  startEditGroup, addGroup, deleteGroup, renderGroupList, addChemGroup, delChemGroup,
  renderEqGroupList, updateEqGroupSelects, addEqGroup, delEqGroup
} from './services/group-lock-mgmt.js'

// ── Import custom selects + form helpers (Phần 8a) ──────
import {
  syncUnit, calcMol,
  searchChem, selectChem, searchElectrode, selectElectrode,
  makeCustomSelect, rebuildCustomSelect, initCustomFilters
} from './ui/custom-selects.js'

// ── Import duplicate + delete + user mgmt (Phần 8b) ─────
import {
  delItem, duplicateItem,
  approveUser, deleteUserAccount, changeUserRole, deleteMemberSafe
} from './services/duplicate-delete.js'

// ── Import auth flow handlers (Phần 8c) ─────────────────
import {
  doLogin, doLogout, doRegister, togglePasswordVisibility, switchAuthTab
} from './pages/auth-flow.js'

// ── Import form helpers + update selects (Phần 8d) ──────
import {
  statusBadge, removeChem, calcLoading, getElectrodeMaterial,
  addChem, addInkRow, fillChem, fillInkFormula, lookupCAS,
  updateGroupSelects, updatePersonSelects, updateInkSelects, updateChemSelects
} from './services/form-helpers.js'

// ── Expose currentAuth lên window để utils đọc được ──────
// (utils/auth-helpers.js đọc window.currentAuth thay vì import để tránh circular)
window.currentAuth = currentAuth;

// ── Expose lên window để HTML onclick + legacy code gọi được ──
window.escapeHtml = escapeHtml;
window.escapeJs = escapeJs;
window.safeAsync = safeAsync;
window.vals = vals;
window.fuzzy = fuzzy;
window.normalizeSub = normalizeSub;
window.formatChemical = formatChemical;
window.fmtDate = fmtDate;
window.autoPrefix = autoPrefix;
window.flashRow = flashRow;
window.setText = setText;
window.setHtml = setHtml;
window.getPersonName = getPersonName;
window.canEdit = canEdit;
window.canDelete = canDelete;
window.syncAuthState = syncAuthState;
window.logHistory = logHistory;

// Expose UI core lên window (Phần 2)
window.openModal = openModal;
window.closeModal = closeModal;
window.registerModalHook = registerModalHook;
window.fireModalHooks = fireModalHooks;
window.showToast = showToast;
window.hideToast = hideToast;
window.undoDelete = undoDelete;
window.showPage = showPage;
window.toggleSidebarSection = toggleSidebarSection;
window.toggleHistory = toggleHistory;
window.switchElectrodeTab = switchElectrodeTab;

// Expose listeners + renderAll + renderDash lên window (Phần 3)
// renderAll PHẢI được set TRƯỚC khi startListeners chạy (listeners gọi window.renderAll)
window.startListeners = startListeners;
window.stopListeners = stopListeners;
window.updateChatFabBadge = updateChatFabBadge;
window.renderAll = renderAll;
window.renderDash = renderDash;

// Expose experiment renders lên window (Phần 4)
// render-dispatcher.js sẽ gọi window.renderHydro/Electrode/Electrochem
window.renderHydro = renderHydro;
window.renderElectrode = renderElectrode;
window.renderElectrochem = renderElectrochem;

// Expose chemicals lên window (Phần 5a)
window.renderChemicals = renderChemicals;
window.toggleChemGroup = toggleChemGroup;

// Expose ink lên window (Phần 5b)
window.renderInk = renderInk;

// Expose equipment lên window (Phần 5c)
window.renderEquipment = renderEquipment;
window.renderBooking = renderBooking;
window.toggleEqGroup = toggleEqGroup;

// Expose members + history + users + avatar lên window (Phần 6)
window.renderMembers = renderMembers;
window.renderHistory = renderHistory;
window.renderUsers = renderUsers;
window.toggleAvatarMenu = toggleAvatarMenu;
window.changeAvatar = changeAvatar;
window.resetAvatar = resetAvatar;
window.updateAvatarUI = updateAvatarUI;

// Expose save handlers lên window (Phần 7a)
// HTML modal footer buttons gọi onclick="saveHydro()" etc.
window.saveHydro = saveHydro;
window.saveElectrode = saveElectrode;
window.saveElectrochem = saveElectrochem;
window.saveMember = saveMember;
window.saveInk = saveInk;
window.saveChemical = saveChemical;
window.saveEquipment = saveEquipment;

// Expose image handlers lên window (Phần 7b)
// HTML onclick gọi: showInkImage(), dropInkImage(event), uploadInkImage(this), etc.
window.showInkImage = showInkImage;
window.handleInkPaste = handleInkPaste;
window.dropInkImage = dropInkImage;
window.uploadInkImage = uploadInkImage;
window.deleteInkImage = deleteInkImage;
window.showElectrodeImage = showElectrodeImage;
window.handleElectrodePaste = handleElectrodePaste;
window.dropElectrodeImage = dropElectrodeImage;
window.uploadElectrodeImage = uploadElectrodeImage;
window.deleteElectrodeImage = deleteElectrodeImage;
window.showHydroImage = showHydroImage;
window.handleHydroPaste = handleHydroPaste;
window.dropHydroImage = dropHydroImage;
window.uploadHydroImage = uploadHydroImage;
window.deleteHydroImage = deleteHydroImage;
window.showChemicalImage = showChemicalImage;
window.dropImageToCell = dropImageToCell;
window.uploadChemicalImage = uploadChemicalImage;
window.dropChemicalImage = dropChemicalImage;
window.deleteChemicalImage = deleteChemicalImage;
window.previewEquipmentImage = previewEquipmentImage;
window.dropEquipmentImageToCell = dropEquipmentImageToCell;
window.dropEquipmentImage = dropEquipmentImage;
window.removeEquipmentImagePreview = removeEquipmentImagePreview;
window.showEquipmentImage = showEquipmentImage;

// Expose chat lên window (Phần 7c)
// HTML onclick gọi: chatSend(), chatInput(this), chatKeydown(event), etc.
window.cleanupChat = cleanupChat;
window.initChat = initChat;
window.chatSend = chatSend;
window.chatInput = chatInput;
window.chatKeydown = chatKeydown;
window.chatPickImage = chatPickImage;
window.chatClearImage = chatClearImage;
window.insertMention = insertMention;
window.showReactionPicker = showReactionPicker;
window.toggleReaction = toggleReaction;
window.toggleChatWidget = toggleChatWidget;
window._updateChatWidgetRole = _updateChatWidgetRole;

// Expose edit handlers lên window (Phần 7d)
// HTML onclick từ row click gọi: editHydro('...'), etc.
window.editElectrode = editElectrode;
window.editElectrochem = editElectrochem;
window.editMember = editMember;
window.editHydro = editHydro;
window.editInk = editInk;
window.editChemical = editChemical;
window.editEquipment = editEquipment;
window.editSubtitle = editSubtitle;
window.editLabTitle = editLabTitle;

// Expose group + lock management lên window (Phần 7d)
window.lockItem = lockItem;
window.unlockItem = unlockItem;
window.lockInk = lockInk;
window.unlockInk = unlockInk;
window.startEditGroup = startEditGroup;
window.addGroup = addGroup;
window.deleteGroup = deleteGroup;
window.renderGroupList = renderGroupList;
window.addChemGroup = addChemGroup;
window.delChemGroup = delChemGroup;
window.renderEqGroupList = renderEqGroupList;
window.updateEqGroupSelects = updateEqGroupSelects;
window.addEqGroup = addEqGroup;
window.delEqGroup = delEqGroup;

// Expose custom selects + form helpers lên window (Phần 8a)
// HTML inline: oninput="searchChem(this)", onclick="selectChem(...)", oninput="calcMol(this)"
window.syncUnit = syncUnit;
window.calcMol = calcMol;
window.searchChem = searchChem;
window.selectChem = selectChem;
window.searchElectrode = searchElectrode;
window.selectElectrode = selectElectrode;
window.makeCustomSelect = makeCustomSelect;
window.rebuildCustomSelect = rebuildCustomSelect;

// Expose duplicate + delete + user mgmt lên window (Phần 8b)
// HTML onclick: delItem('hydro','...'), duplicateItem('ink','...'), approveUser('uid','member')
window.delItem = delItem;
window.duplicateItem = duplicateItem;
window.approveUser = approveUser;
window.deleteUserAccount = deleteUserAccount;
window.changeUserRole = changeUserRole;
window.deleteMemberSafe = deleteMemberSafe;

// Expose auth flow handlers lên window (Phần 8c)
// HTML onclick: doLogin(), doLogout(), doRegister(), togglePasswordVisibility(), switchAuthTab('login')
window.doLogin = doLogin;
window.doLogout = doLogout;
window.doRegister = doRegister;
window.togglePasswordVisibility = togglePasswordVisibility;
window.switchAuthTab = switchAuthTab;

// Expose form helpers + update selects lên window (Phần 8d)
// HTML inline: onclick="addChem()", onclick="removeChem(this)", oninput="lookupCAS()", etc.
window.statusBadge = statusBadge;
window.removeChem = removeChem;
window.calcLoading = calcLoading;
window.getElectrodeMaterial = getElectrodeMaterial;
window.addChem = addChem;
window.addInkRow = addInkRow;
window.fillChem = fillChem;
window.fillInkFormula = fillInkFormula;
window.lookupCAS = lookupCAS;
window.updateGroupSelects = updateGroupSelects;
window.updatePersonSelects = updatePersonSelects;
window.updateInkSelects = updateInkSelects;
window.updateChemSelects = updateChemSelects;

// ── Stub cho hàm thiếu trong labbook-extensions.js ──────
// Hàm này được gọi trong labbook-extensions.js nhưng chưa được implement.
// Thêm stub no-op để tránh TypeError. Khi muốn vẽ chart thật, thay nội dung hàm này.
if (typeof window.renderDashboardCharts !== 'function') {
  window.renderDashboardCharts = function(cache) {
    // TODO: implement Chart.js dashboard charts
    // labbook-extensions.js đã có helpers: chartOptions, getLast12Months,
    // countByMonth, injectChartContainer
  };
}

// ── Auth state legacy (sẽ remove dần ở Phần sau) ─────────
var isAdmin = false;
var currentUser = 'Khách';
const SUPER_ADMIN_EMAIL = 'nvhn.7202@gmail.com';

// ── Sync wrapper: cập nhật cả local var lẫn window globals ──
// (Phần 1: utils/auth-helpers.syncAuthState chỉ set window globals.
//  Một số chỗ trong main.js dùng `currentUser` / `isAdmin` local — wrapper này sync cả hai.)
function _syncAuthStateLocal() {
  syncAuthState();
  isAdmin = !!currentAuth.isAdmin;
  currentUser = currentAuth.displayName || currentAuth.email || 'Khách';
}
// Override window.syncAuthState để các caller dùng version sync cả local
window.syncAuthState = _syncAuthStateLocal;

// ── Dev-only logger (Round 5) ────────────────────────────
// console.log/warn chỉ chạy ở dev mode; console.error luôn chạy để monitor production
const __DEV__ = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) || false;
const devLog  = (...a) => { if (__DEV__) console.log(...a); };
const devWarn = (...a) => { if (__DEV__) console.warn(...a); };
window.devLog = devLog;
window.devWarn = devWarn;

// ── Cache local ───────────────────────────────────────────
let cache = { hydro:{}, electrode:{}, electrochem:{}, chemicals:{}, members:{}, history:{}, equipment:{}, groups:{}, ink:{}, bookings:{}, notifications:{}, presence:{} }
window.cache = cache;

// ── Listeners đã được tách sang ./services/listeners.js (Phần 3 refactor)
//    startListeners, stopListeners, updateChatFabBadge — import ở đầu file

// ── Navigation, Modal, Toast đã được tách sang ./ui/navigation.js,
//    ./ui/modal.js, ./ui/toast.js (Phần 2 refactor)
// Event "click outside modal → close" giữ ở DOMContentLoaded để chắc chắn
// modal đã render xong.

// ── Status badge ──────────────────────────────────────────

// ── Chem rows ─────────────────────────────────────────────

// ── Calc loading ──────────────────────────────────────────

// Cập nhật dropdown nhóm

// Sửa tên nhóm inline

// Thêm nhóm mới

// Xóa nhóm
// ── Render functions: dispatcher đã tách sang ./services/render-dispatcher.js
//    renderDash đã tách sang ./pages/dashboard.js (Phần 3 refactor)
//    renderAll, renderDash được import ở đầu file và set window.* sẵn

// vals đã được import từ ./utils/format.js (Phần 1 refactor)







// ── Delete ────────────────────────────────────────────────

// ── Save hydro ────────────────────────────────────────────

// ── Save electrode ────────────────────────────────────────

// ── Save electrochem ──────────────────────────────────────

// ── Save chemical ─────────────────────────────────────────




// switchElectrodeTab đã được import từ ./ui/navigation.js (Phần 2 refactor)









// formatChemical đã được import từ ./utils/format.js (Phần 1 refactor)

// flashRow đã được import từ ./utils/dom.js + gắn lên window trong DOMContentLoaded


// ── Populate chem dropdowns ───────────────────────────────



// ── Edit chemical ─────────────────────────────────────────

// Override saveChemical để xử lý cả thêm mới và cập nhật
const _origSaveChem = window.saveChemical;

// Gọi updateChemSelects mỗi khi chemicals thay đổi
// ── Equipment ─────────────────────────────────────────────
// Equipment image base64 — dùng chung giữa preview (image-handlers) và save (save-handlers)
// Phần 7a: expose lên window để module save-handlers đọc được runtime
window.__eqImageBase64 = null;









// [FIX] Đã xóa override window.renderAll lần 2 — updateChemSelects đã được gọi
// bên trong _renderAllNow() để đảm bảo đi qua debounce 30ms (xem hàm _renderAllNow ở trên)
document.getElementById('btn-add-member').addEventListener('click', () => openModal('modal-member'));
// toggleSidebarSection đã được import từ ./ui/navigation.js (Phần 2)
// autoPrefix đã được import từ ./utils/format.js (Phần 1)
// toggleHistory đã được import từ ./ui/navigation.js (Phần 2)




// ── Init khi DOM ready ────────────────────────────────────


// ── Custom select cho modal dropdowns (dynamic options) ──────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.body.style.visibility = 'visible'
  initCustomFilters()
  initMemberFilter()
  // Đóng modal khi click ngoài
  document.querySelectorAll('.modal-overlay').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id) })
  )

  // Các globals UI (showPage, openModal, showToast, ...) đã được gán
  // lên window ngay sau imports ở đầu file (Phần 1 + Phần 2 refactor).

  // Show/hide btn-add-member theo role
  const _btnMember = document.getElementById('btn-add-member');
  if (_btnMember) _btnMember.style.display = currentAuth.isAdmin ? 'inline-flex' : 'none';


  const btnAddMember = document.getElementById('btn-add-member')
  if (btnAddMember) btnAddMember.addEventListener('click', () => openModal('modal-member'))

  // ── Khởi động Firebase Auth ────────────────────────────
  initAuth(
    // onLogin
    (user, role) => {
      // Nếu app đã load rồi (role thay đổi realtime)
      if (document.getElementById('app-shell').style.display !== 'none') {
        if (!['admin','member','viewer'].includes(role)) {
          showToast('Quyền bị thu hồi. Đang đăng xuất...', 'danger')
          setTimeout(() => logout(), 2000)
          return
        }
        applyRoleUI(role); if (window._updateChatWidgetRole) window._updateChatWidgetRole();
        setTimeout(() => { if (window.initSidebarTooltip) window.initSidebarTooltip(); }, 500)
        _syncAuthStateLocal()
        if (role === 'viewer') document.body.classList.add('viewer-mode')
        else document.body.classList.remove('viewer-mode')
        showToast('Quyền đã được cập nhật: ' + role, 'info')
        return
      }
      if (!['admin','member','viewer'].includes(role)) {
        // pending, rejected hoặc chưa có role
        document.getElementById('skeleton-loader').style.display = 'none'
        const ls = document.getElementById('login-screen')
        ls.style.cssText = 'display:flex;align-items:center;justify-content:center;visibility:visible'
        const msg = role === 'rejected'
          ? 'Tài khoản của bạn đã bị từ chối. Vui lòng liên hệ Admin.'
          : 'Tài khoản của bạn đang chờ Admin xét duyệt. Vui lòng chờ thông báo.'
        logout()
        setTimeout(() => showToast(msg, 'danger', null, 6000), 400)
        return
      }
      _syncAuthStateLocal()
      startListeners()
      document.getElementById('skeleton-loader').style.display = 'none'
      document.getElementById('login-screen').style.display = 'none'
      document.getElementById('login-screen').style.visibility = 'hidden'
      document.getElementById('app-shell').style.display = 'block'
      applyRoleUI(role); if (window._updateChatWidgetRole) window._updateChatWidgetRole();
      updateAvatarUI()
      // Gọi lại sau updateAvatarUI để badge không bị xóa
      setTimeout(() => applyRoleUI(role), 50)
      const greeting = role === 'viewer'
        ? 'Xin chào ' + (currentAuth.displayName || user.email) + '! Bạn đang ở chế độ chỉ xem.'
        : 'Xin chào, ' + (currentAuth.displayName || user.email) + '!'
      showToast(greeting, role === 'viewer' ? 'info' : 'success')
    },
    // onLogout
    () => {
      // Cleanup tất cả listeners để tránh leak + lỗi permission sau logout
      try { stopListeners(); } catch(e) {}
      try { window.cleanupChat && window.cleanupChat(); } catch(e) {}
      document.getElementById('app-shell').style.display = 'none'
      document.getElementById('skeleton-loader').style.display = 'none'
      const ls = document.getElementById('login-screen');
      ls.style.cssText = 'display:flex;align-items:center;justify-content:center;visibility:visible';
      if (typeof switchAuthTab === 'function') switchAuthTab('login');
    }
  )
})

// ── Login / Logout handlers ───────────────────────────────



// ── Switch auth tab ───────────────────────────────────────

// ── Register handler ──────────────────────────────────────

// ── Render Users page ─────────────────────────────────────
// fmtDate đã được import từ ./utils/format.js (Phần 1 refactor)


// ── Approve/change user role ──────────────────────────────




// ── Custom Select Component ───────────────────────────────
function initCustomSelects(container) {
  const root = container || document;
  root.querySelectorAll('select.cs-select').forEach(sel => {
    if (sel.dataset.customized) return;
    sel.dataset.customized = '1';
    sel.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.textContent = sel.options[sel.selectedIndex]?.text || '';

    const arrow = document.createElement('div');
    arrow.className = 'custom-select-arrow';
    arrow.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';

    // Round 9b fix #33: cache builder so we can rebuild when underlying <select> options change
    function buildOptions() {
      dropdown.innerHTML = '';
      Array.from(sel.options).forEach((opt, i) => {
        const item = document.createElement('div');
        item.className = 'custom-select-option' + (i === sel.selectedIndex ? ' selected' : '');
        item.textContent = opt.text;
        item.dataset.value = opt.value;
        item.onclick = () => {
          sel.value = opt.value;
          trigger.textContent = opt.text;
          dropdown.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
          item.classList.add('selected');
          trigger.classList.remove('open');
          dropdown.classList.remove('open');
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        };
        dropdown.appendChild(item);
      });
    }
    buildOptions();
    sel._csBuildOptions = buildOptions;
    sel._csLabel = trigger;

    trigger.onclick = (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      document.querySelectorAll('.custom-select-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.previousElementSibling?.classList.remove('open');
      });
      if (!isOpen) {
        dropdown.classList.add('open');
        trigger.classList.add('open');
      }
    };

    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(sel);
    wrapper.appendChild(trigger);
    wrapper.appendChild(arrow);
    wrapper.appendChild(dropdown);
  });
}

// Close dropdown khi click ngoài
document.addEventListener('click', () => {
  document.querySelectorAll('.custom-select-dropdown.open').forEach(d => {
    d.classList.remove('open');
    d.previousSibling?.classList.remove('open');
  });
});

// Khởi tạo khi mở modal
// Round 6: replaced chain override with afterOpen hook (initCustomSelects + c-group builder)
window.registerModalHook('afterOpen', function(id) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    initCustomSelects(el);
    // Gán _csBuildOptions cho c-group để updateGroupSelects có thể sync
    if (id === 'modal-chemical') {
      const cg = document.getElementById('c-group');
      if (cg && cg.dataset.customized) {
        const wrapper = cg.closest('.custom-select');
        const trigger = wrapper?.querySelector('.custom-select-trigger');
        const dropdown = wrapper?.querySelector('.custom-select-dropdown');
        if (trigger && dropdown) {
          cg._csBuildOptions = () => {
            dropdown.innerHTML = '';
            Array.from(cg.options).forEach((opt, i) => {
              const item = document.createElement('div');
              item.className = 'custom-select-option' + (i === cg.selectedIndex ? ' selected' : '');
              item.textContent = opt.text;
              item.dataset.value = opt.value;
              item.onclick = () => {
                cg.value = opt.value;
                trigger.textContent = opt.text;
                dropdown.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
                item.classList.add('selected');
                trigger.classList.remove('open');
                dropdown.classList.remove('open');
                cg.dispatchEvent(new Event('change', { bubbles: true }));
              };
              dropdown.appendChild(item);
            });
          };
          cg._csLabel = trigger;
        }
      }
    }
  }, 50);
});




// ── Group management ─────────────────────────────────────
window.renderGroupList = renderGroupList;



// Round 6: replaced chain override with afterOpen hook (renderGroupList)
window.registerModalHook('afterOpen', function(id) {
  if (id === 'modal-groups') renderGroupList();
});



// ── Enter to save in modals ───────────────────────────────
const _modalSaveMap = {
  'modal-hydrothermal': () => window.saveHydro && window.saveHydro(),
  'modal-electrode':    () => window.saveElectrode && window.saveElectrode(),
  'modal-electrochem':  () => window.saveElectrochem && window.saveElectrochem(),
  'modal-chemical':     () => window.saveChemical && window.saveChemical(),
  'modal-equipment':    () => window.saveEquipment && window.saveEquipment(),
  'modal-ink':          () => window.saveInk && window.saveInk(),
  'modal-member':       () => window.saveMember && window.saveMember(),
  'modal-groups':       () => window.addChemGroup && window.addChemGroup(),
};
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  if (e.target.tagName === 'TEXTAREA') return;
  if (e.target.tagName === 'SELECT') return;
  const modal = e.target.closest('.modal-overlay') || document.querySelector('.modal-overlay.open');
  if (!modal) return;
  const fn = _modalSaveMap[modal.id];
  if (fn) { e.preventDefault(); fn(); }
});

// ── Equipment groups ──────────────────────────────────────
const cacheEqGroups = {};
window.cacheEqGroups = cacheEqGroups; // expose cho pages/equipment.js đọc runtime
fbListen('eq_groups', function(data) {
  Object.assign(cacheEqGroups, data || {});
  Object.keys(cacheEqGroups).forEach(k => { if (!data || !data[k]) delete cacheEqGroups[k]; });
  if (typeof updateEqGroupSelects === 'function') updateEqGroupSelects();
});

// vals2 removed (Round 5) - use vals() instead





// Mở modal eq-groups
// Round 6: replaced chain override with afterOpen hook (eq-groups + equipment setup)
window.registerModalHook('afterOpen', function(id) {
  if (id === 'modal-eq-groups') renderEqGroupList();
  if (id === 'modal-equipment') setTimeout(() => {
    updateEqGroupSelects();
    makeCustomSelect(document.getElementById('eq-group'));
    const el = document.getElementById('eq-group');
    if (el && el.dataset.pendingVal !== undefined) el.value = el.dataset.pendingVal;
  }, 0);
});


fbListen('settings/title', function(data) {
  if (data && data.value) {
    const el = document.getElementById('lab-title');
    if (el && !el.querySelector('input')) el.textContent = data.value;
  }
});

window.toggleDarkMode = function(on) {
  document.documentElement.classList.toggle('dark', on);
  localStorage.setItem('darkMode', on ? '1' : '0');
  const lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = on ? 'Chế độ sáng' : 'Chế độ tối';
}

// ── Init theme picker (apply saved theme từ localStorage) ──
initTheme();

// Restore
;(function(){
  const on = localStorage.getItem('darkMode') === '1';
  if (on) {
    document.documentElement.classList.add('dark');
    const t = document.getElementById('theme-toggle');
    if (t) t.checked = true;
    const lbl = document.getElementById('theme-label');
    if (lbl) lbl.textContent = 'Chế độ sáng';
  }
})();

window.openChangePassword = function() {
  // Tạo modal với input password ẩn
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--surface);border-radius:14px;border:1px solid var(--border);padding:24px;width:min(420px,96vw);box-shadow:0 20px 60px rgba(0,0,0,0.25);';
  modal.innerHTML = `
    <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:6px">Đổi mật khẩu</div>
    <div style="font-size:12.5px;color:var(--text-2);margin-bottom:16px">Nhập mật khẩu mới (tối thiểu 6 ký tự).</div>
    <div style="position:relative;margin-bottom:16px">
      <input type="password" id="cp-newpw" placeholder="Mật khẩu mới"
        style="width:100%;padding:10px 38px 10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--surface);color:var(--text);outline:none;box-sizing:border-box" />
      <button type="button" id="cp-toggle" tabindex="-1"
        style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;font-size:12px">Hiện</button>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="cp-cancel" class="btn">Hủy</button>
      <button id="cp-save" class="btn btn-primary">Đổi mật khẩu</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  const input = modal.querySelector('#cp-newpw');
  const toggle = modal.querySelector('#cp-toggle');
  const cancel = modal.querySelector('#cp-cancel');
  const save = modal.querySelector('#cp-save');
  
  setTimeout(() => input.focus(), 50);
  
  toggle.addEventListener('click', () => {
    if (input.type === 'password') {
      input.type = 'text';
      toggle.textContent = 'Ẩn';
    } else {
      input.type = 'password';
      toggle.textContent = 'Hiện';
    }
  });
  
  const close = () => overlay.remove();
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  
  const submit = () => {
    const newPw = input.value;
    if (!newPw || newPw.length < 6) { showToast('Mật khẩu quá ngắn!', 'danger'); return; }
    const user = currentAuth.user;
    if (!user) { showToast('Chưa đăng nhập!', 'danger'); close(); return; }
    save.disabled = true;
    save.textContent = 'Đang lưu...';
    updatePassword(user, newPw).then(() => {
      showToast('Đã đổi mật khẩu!', 'success');
      close();
    }).catch(e => {
      save.disabled = false;
      save.textContent = 'Đổi mật khẩu';
      if (e.code === 'auth/requires-recent-login') {
        showToast('Cần đăng nhập lại để đổi mật khẩu!', 'danger');
      } else {
        showToast('Lỗi: ' + e.message, 'danger');
      }
    });
  };
  
  save.addEventListener('click', submit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') close();
  });
}

// Threads background disabled
function initThreads() {}

// Init khi load
const _loginScreen = document.getElementById('login-screen');
if (_loginScreen) initThreads(_loginScreen, { color: [0.05, 0.58, 0.53], amplitude: 1, distance: 0 });

// [removed duplicate deleteMemberSafe - see final definition below]

import './labbook-extensions.js'
import './services/global-search.js'
import './services/excel-export.js'
import './services/notifications.js'
import './services/notifications-hooks.js'
import './services/a11y-enhancements.js'
import './services/custom-select-keyboard.js'
import './services/avatar-menu-a11y.js'
import './services/bulk-actions.js'
import './services/bulk-multi-select.js'
import './services/date-range-filter.js'
import './services/table-align.js'
import './services/bulk-row-style.js'


// ── Keyboard shortcuts (patch page IDs) ───────────────────
const _pageSearchMap = {
  'page-hydrothermal':     'hydro-search',
  'page-electrode':        'electrode-search',
  'page-electrochemistry': 'ec-search',
  'page-chemicals':        'chem-search',
  'page-equipment':        'equipment-search',
  'page-members':          'member-search',
};
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const openModal = document.querySelector('.modal-overlay.open');
    if (openModal) { window.closeModal(openModal.id); return; }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;
    const searchId = _pageSearchMap[activePage.id];
    if (searchId) {
      const input = document.getElementById(searchId);
      if (input) { e.preventDefault(); input.focus(); input.select(); }
    }
  }
});

// ── Filter "Chỉ của tôi" ──────────────────────────────────
window._mineFilter = { hydro: false, electrode: false, ec: false };

window.toggleMineFilter = function(id) {
  window._mineFilter[id] = !window._mineFilter[id];
  const btn = document.getElementById(id + '-mine-btn');
  if (btn) {
    btn.style.background  = window._mineFilter[id] ? 'var(--teal)' : '';
    btn.style.color       = window._mineFilter[id] ? 'white'   : '';
    btn.style.borderColor = window._mineFilter[id] ? 'var(--teal)' : '';
  }
  if (id === 'hydro')    window.renderHydro();
  if (id === 'electrode') window.renderElectrode();
  if (id === 'ec')       window.renderElectrochem();
};
// ── Sidebar tooltip ───────────────────────────────────
// Sidebar tooltip - chạy sau khi tất cả load xong
window.initSidebarTooltip = function() {
  let tip = document.getElementById('_stip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = '_stip';
    Object.assign(tip.style, {
      position:'fixed', background:'#1e293b', color:'#f1f5f9',
      fontSize:'12px', fontWeight:'500', padding:'4px 10px',
      borderRadius:'6px', whiteSpace:'nowrap', pointerEvents:'none',
      zIndex:'999999', opacity:'0', transition:'opacity 0.12s',
    });
    document.body.appendChild(tip);
  }
  document.querySelectorAll('nav.site-sidebar .sidebar-item[data-tip]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const r = el.getBoundingClientRect();
      tip.textContent = el.dataset.tip;
      tip.style.left = (r.right + 6) + "px";
      tip.style.top  = Math.round(r.top + r.height/2) + 'px';
      tip.style.transform = 'translateY(-50%)';
      tip.style.opacity = '1';
    });
    el.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
  });
};
// Gọi sau khi auth load xong (được gọi lại trong onLogin)
document.addEventListener('DOMContentLoaded', () => setTimeout(window.initSidebarTooltip, 800));


// Round 24: Inject nav-label + bind hover via JS (bypass CSS specificity battles)
window.injectNavLabels = function() {
  document.querySelectorAll('nav.site-sidebar .sidebar-item').forEach(item => {
    if (item.querySelector('span.nav-label')) return;
    const tip = item.getAttribute('data-tip');
    if (!tip) return;
    const span = document.createElement('span');
    span.className = 'nav-label';
    span.textContent = tip;
    span.style.cssText = 'display:none;font-size:13px;font-weight:500;margin-left:4px;white-space:nowrap;color:inherit';
    item.appendChild(span);
  });
};

(function() {
  const setup = () => {
    const sidebar = document.querySelector('nav.site-sidebar');
    if (!sidebar || sidebar.dataset.hoverBound) return;
    sidebar.dataset.hoverBound = '1';
    sidebar.addEventListener('mouseenter', () => {
      sidebar.querySelectorAll('span.nav-label').forEach(s => s.style.display = 'inline-block');
      const brandText = sidebar.querySelector('.sidebar-brand-text');
      if (brandText) brandText.style.display = 'flex';
    });
    sidebar.addEventListener('mouseleave', () => {
      sidebar.querySelectorAll('span.nav-label').forEach(s => s.style.display = 'none');
      const brandText = sidebar.querySelector('.sidebar-brand-text');
      if (brandText) brandText.style.display = 'none';
    });
  };

  function runAll() {
    window.injectNavLabels();
    setup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAll);
  } else {
    runAll();
  }
  setTimeout(runAll, 500);
  setTimeout(runAll, 1500);
  setTimeout(runAll, 3000);

  // Re-inject on auth changes
  const _orig = window.applyRoleUI;
  if (typeof _orig === 'function') {
    window.applyRoleUI = function() {
      _orig.apply(this, arguments);
      setTimeout(runAll, 100);
    };
  }
})();


// Round 25: Toggle body.page-dashboard for floating-topbar visibility
// [FIX] Dùng 'pageChange' CustomEvent thay vì override window.showPage
(function() {
  function applyPageClass(id) {
    document.body.classList.remove('page-dashboard');
    if (id === 'dashboard') document.body.classList.add('page-dashboard');
  }
  // Lắng nghe event thay vì monkey-patch
  document.addEventListener('pageChange', ({ detail: { id } }) => applyPageClass(id));
  // Initial run after a delay (sau khi page load + auth)
  setTimeout(() => {
    const active = document.querySelector('.page.active');
    if (active) {
      const id = active.id.replace(/^page-/, '');
      applyPageClass(id);
    }
  }, 500);
})();

// Round 25+27: Make chat FAB draggable - rAF + transform for buttery smoothness
(function makeFabDraggable() {
  function setup() {
    const fab = document.getElementById('chat-fab');
    if (!fab || fab.dataset.dragBound) return;
    fab.dataset.dragBound = '1';

    let isDragging = false;
    let startX, startY;
    let baseLeft, baseTop;        // FAB position at drag start (px)
    let pendingX, pendingY;       // latest mouse position
    let moved = false;
    let rafId = null;

    function updatePosition() {
      rafId = null;
      const w = fab.offsetWidth, h = fab.offsetHeight;
      let x = baseLeft + (pendingX - startX);
      let y = baseTop + (pendingY - startY);
      x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
      y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
      // Use transform — GPU accelerated, no reflow
      fab.style.left = x + 'px';
      fab.style.top = y + 'px';
    }

    function onDown(e) {
      const point = e.touches ? e.touches[0] : e;
      isDragging = true;
      moved = false;
      startX = point.clientX;
      startY = point.clientY;
      const rect = fab.getBoundingClientRect();
      baseLeft = rect.left;
      baseTop = rect.top;
      // Pin to absolute coordinates
      fab.style.left = baseLeft + 'px';
      fab.style.top = baseTop + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
      fab.style.cursor = 'grabbing';
      fab.style.transition = 'none'; // disable any CSS transition during drag
      e.preventDefault();
    }

    function onMove(e) {
      if (!isDragging) return;
      const point = e.touches ? e.touches[0] : e;
      pendingX = point.clientX;
      pendingY = point.clientY;
      if (!moved && (Math.abs(pendingX - startX) + Math.abs(pendingY - startY) > 5)) {
        moved = true;
      }
      if (moved && rafId === null) {
        rafId = requestAnimationFrame(updatePosition);
      }
    }

    function onUp() {
      if (!isDragging) return;
      isDragging = false;
      fab.style.cursor = 'grab';
      fab.style.transition = ''; // restore CSS transitions
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (moved) setTimeout(() => { moved = false; }, 50);
    }

    // Block click after drag
    fab.addEventListener('click', (e) => {
      if (moved) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);

    fab.addEventListener('mousedown', onDown);
    fab.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);

    fab.style.cursor = 'grab';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
  setTimeout(setup, 1000);
})();


// Round 37: Toggle body class theo role để CSS ẩn sidebar items
(function setupRoleBodyClass() {
  function setRoleClass(role) {
    document.body.classList.remove('superadmin-mode','admin-mode','member-mode','viewer-mode','pending-mode','rejected-mode');
    if (role) document.body.classList.add(role + '-mode');
  }
  // Hook applyRoleUI
  const _orig = window.applyRoleUI;
  if (typeof _orig === 'function') {
    window.applyRoleUI = function(role) {
      _orig.apply(this, arguments);
      setRoleClass(role);
    };
  }
  // Try to detect current role from existing badge or auth state
  setTimeout(() => {
    if (window.currentAuth?.role) {
      setRoleClass(window.currentAuth.role);
    }
  }, 800);
  setTimeout(() => {
    if (window.currentAuth?.role) {
      setRoleClass(window.currentAuth.role);
    }
  }, 2000);
})();


// Round 40: Hide sidebar items dựa trên ROLE BADGE element trong DOM
// Đáng tin hơn vì không phụ thuộc biến JS state
(function hideSidebarByRoleDOM() {
  function detectRole() {
    // Try từ window.currentAuth nếu có
    if (window.currentAuth?.role) return window.currentAuth.role;

    // Try từ avatar badge trong sidebar (Round 10 đã set theo role)
    const adminBadge = document.getElementById('admin-badge');
    if (adminBadge && adminBadge.style.display !== 'none') {
      const text = adminBadge.textContent.trim().toLowerCase();
      if (text.includes('superadmin') || text.includes('super')) return 'superadmin';
      if (text === 'admin') return 'admin';
      if (text === 'member') return 'member';
      if (text === 'viewer') return 'viewer';
    }

    // Try từ body class hiện có (set bởi auth flow)
    if (document.body.classList.contains('superadmin-mode')) return 'superadmin';
    if (document.body.classList.contains('admin-mode')) return 'admin';
    if (document.body.classList.contains('member-mode')) return 'member';
    if (document.body.classList.contains('viewer-mode')) return 'viewer';

    return null;
  }

  function apply() {
    const role = detectRole();
    if (!role) return;

    // Set body class
    document.body.classList.remove('superadmin-mode','admin-mode','member-mode','viewer-mode','pending-mode','rejected-mode');
    document.body.classList.add(role + '-mode');

    // Hide/show 2 admin items
    const canSeeAdminPages = (role === 'admin' || role === 'superadmin');
    document.querySelectorAll('.sidebar-item').forEach(item => {
      const tip = item.getAttribute('data-tip');
      if (tip === 'Quản lý tài khoản' || tip === 'Lịch sử chỉnh sửa') {
        item.style.display = canSeeAdminPages ? '' : 'none';
      }
    });
  }

  setInterval(apply, 1000);
  apply();
})();

// Workaround: avatar menu hover effect via JS (CSS không apply được)
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.querySelectorAll('.avatar-menu-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.setProperty('background', 'var(--teal)', 'important');
        btn.style.setProperty('color', 'white', 'important');
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.removeProperty('background');
        btn.style.removeProperty('color');
      });
    });
  }, 500);
});
