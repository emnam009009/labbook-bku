/**
 * ui/navigation.ts
 * Dieu huong trang: showPage, sidebar section toggle, electrode tabs
 *
 * Thiet ke:
 *  - showPage dispatch CustomEvent 'pageChange' de cac hook khac lang nghe
 */

// ── Chuyen trang ───────────────────────────────────────
// id: ten page (vd 'dashboard', 'hydro', 'chemicals'); el: sidebar item duoc click
export function showPage(id: string, el?: HTMLElement | null): void {
  // R121 fix Bug A: reset header search box state khi navigate.
  // Tránh case: user gõ search → click result → navigate, nhưng box ở trạng
  // thái expand vì input value còn → mouseleave check value → skip collapse.
  const _hsBox = document.getElementById('header-search-box');
  const _hsInput = document.getElementById('header-search-input') as HTMLInputElement | null;
  if (_hsBox && _hsInput) {
    _hsInput.value = '';
    _hsInput.blur();
    _hsBox.style.width = '40px';
    _hsBox.style.borderColor = '#e2e8f0';
    _hsBox.style.borderRadius = '50%';
    _hsInput.style.width = '0';
    _hsInput.style.padding = '0';
    const dd = document.getElementById('header-search-dropdown');
    if (dd) { dd.style.display = 'none'; dd.innerHTML = ''; }
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
  const _pg = document.getElementById('page-' + id);
  if (_pg) _pg.classList.add('active');
  if (el) el.classList.add('active');
  // Equipment co render rieng — goi neu ham ton tai
  if (id === 'equipment' && typeof window.renderEquipment === 'function') {
    window.renderEquipment();
  }
  // Booking co render rieng
  if (id === 'booking' && typeof window.renderBooking === 'function') {
    window.renderBooking();
  }
  // Hydro / Electrode / Electrochem: re-render tu cache hien tai
  if (id === 'hydrothermal' && typeof window.renderHydro === 'function') {
    window.renderHydro();
  }
  if (id === 'electrode' && typeof window.renderElectrode === 'function') {
    window.renderElectrode();
  }
  if (id === 'electrochemistry' && typeof window.renderElectrochem === 'function') {
    window.renderElectrochem();
  }
  // Round 77c: Cross-experiment overview page
  if (id === 'overview' && typeof (window as any).renderOverviewPage === 'function') {
    (window as any).renderOverviewPage();
  }
  // Dispatch event de cac hook khac (chat, dashboard class, ...) lang nghe
  document.dispatchEvent(new CustomEvent('pageChange', { detail: { id } }));
}

// ── Toggle collapse sidebar section ────────────────────
export function toggleSidebarSection(labelEl: HTMLElement): void {
  const section = labelEl.closest('.sidebar-section');
  if (section) section.classList.toggle('collapsed');
}

// ── Mo trang lich su (admin only) ──────────────────────
export function toggleHistory(): void {
  showPage('history', document.querySelector<HTMLElement>('.admin-only'));
}

// ── Chuyen tab Electrode <-> Ink ──────────────────────
// tab: 'electrode' hoac 'ink'; btn: button duoc click
export function switchElectrodeTab(tab: string, btn?: HTMLElement | null): void {
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
