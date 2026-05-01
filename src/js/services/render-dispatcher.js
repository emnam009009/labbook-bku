/**
 * services/render-dispatcher.js
 * Debounced render dispatcher — gọi tất cả renderXxx functions sau khi cache thay đổi
 *
 * Thiết kế:
 *  - renderAll() chỉ dispatch — debounce 30ms để gộp nhiều listener fire liên tiếp
 *    (vd 9 collections cùng load lần đầu) thành 1 lần render thực sự
 *  - _renderAllNow() là bản chạy ngay, gọi tất cả renderXxx
 *  - Các renderXxx (renderHydro, renderElectrode, ...) chưa được tách thành module
 *    nên đọc qua window.* runtime (sẽ migrate sau ở Phần 4-6)
 *
 * State module-level:
 *  - _renderTimer: timer của debounce
 */

import { renderDash } from '../pages/dashboard.js'

let _renderTimer = null;

// ── Hàm public: được gọi bởi listeners khi cache thay đổi ──
// Debounced 30ms để tránh render liên tục khi nhiều collection update gần nhau
export function renderAll() {
  if (_renderTimer) return;
  _renderTimer = setTimeout(() => {
    _renderTimer = null;
    _renderAllNow();
  }, 30);
}

// ── Hàm internal: chạy tất cả renderers ngay lập tức ─────
function _renderAllNow() {
  // Dashboard: đã được tách module, gọi trực tiếp
  renderDash();

  // Admin-only renderers
  if (window.currentAuth?.isAdmin && typeof window.renderUsers === 'function') {
    window.renderUsers();
  }

  // Các renderers chưa được tách — gọi qua window.* (sẽ migrate ở Phần 4-6)
  if (typeof window.renderHydro === 'function')      window.renderHydro();
  if (typeof window.renderElectrode === 'function')  window.renderElectrode();
  if (typeof window.renderElectrochem === 'function') window.renderElectrochem();
  if (typeof window.renderChemicals === 'function')  window.renderChemicals();
  if (typeof window.renderMembers === 'function')    window.renderMembers();
  if (typeof window.renderHistory === 'function')    window.renderHistory();
  if (typeof window.renderInk === 'function')        window.renderInk();
  if (typeof window.renderEquipment === 'function')  window.renderEquipment();

  // Update các dropdown phụ thuộc cache (person, group, ink, chem)
  if (typeof window.updatePersonSelects === 'function') window.updatePersonSelects();
  if (typeof window.updateGroupSelects === 'function')  window.updateGroupSelects();
  if (typeof window.updateInkSelects === 'function')    window.updateInkSelects();
  // [FIX legacy] updateChemSelects gọi ở đây thay vì override window.renderAll lần 2
  // Đảm bảo đi qua debounce 30ms và không tạo thêm wrapper nào nữa
  if (typeof window.updateChemSelects === 'function')   window.updateChemSelects();
}
