/**
 * ui/navigation.js
 * Điều hướng trang: showPage, sidebar section toggle, electrode tabs
 *
 * Thiết kế:
 *  - showPage dispatch CustomEvent 'pageChange' để các hook khác lắng nghe
 *    (thay vì monkey-patch window.showPage nhiều lần như trước Round 6)
 */

// ── Chuyển trang ───────────────────────────────────────
// id: tên page (vd 'dashboard', 'hydro', 'chemicals'); el: sidebar item được click
export function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
  const _pg = document.getElementById('page-' + id);
  if (_pg) _pg.classList.add('active');
  if (el) el.classList.add('active');
  // Equipment có render riêng — gọi nếu hàm tồn tại
  if (id === 'equipment' && typeof window.renderEquipment === 'function') {
    window.renderEquipment();
  }
  // Booking có render riêng
  if (id === 'booking' && typeof window.renderBooking === 'function') {
    window.renderBooking();
  }
  // Dispatch event để các hook khác (chat, dashboard class, ...) lắng nghe
  document.dispatchEvent(new CustomEvent('pageChange', { detail: { id } }));
}

// ── Toggle collapse sidebar section ────────────────────
export function toggleSidebarSection(labelEl) {
  const section = labelEl.closest('.sidebar-section');
  if (section) section.classList.toggle('collapsed');
}

// ── Mở trang lịch sử (admin only) ──────────────────────
export function toggleHistory() {
  showPage('history', document.querySelector('.admin-only'));
}

// ── Chuyển tab Electrode ↔ Ink ──────────────────────────
// tab: 'electrode' hoặc 'ink'; btn: button được click
export function switchElectrodeTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const tabEl = document.getElementById('etab-' + tab);
  if (tabEl) tabEl.classList.add('active');
  const elActions = document.getElementById('electrode-actions');
  const inkActions = document.getElementById('ink-actions');
  if (elActions) elActions.style.display = tab === 'electrode' ? 'flex' : 'none';
  if (inkActions) inkActions.style.display = tab === 'ink' ? 'flex' : 'none';
}
