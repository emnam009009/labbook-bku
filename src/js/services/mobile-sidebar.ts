/**
 * services/mobile-sidebar.ts
 * Round 58e (CSP): tach tu inline <script> cuoi index.html
 *
 * Toggle/close mobile sidebar (< 768px). Click .sidebar-item -> auto close.
 * Expose toggleMobileSidebar/closeMobileSidebar lo to window cho data-action delegation.
 */

function toggleMobileSidebar(): void {
  const sidebar = document.querySelector<HTMLElement>('nav.site-sidebar');
  const overlay = document.getElementById('mobile-sidebar-overlay');
  if (!sidebar || !overlay) return;
  if (sidebar.classList.contains('mobile-open')) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('mobile-open');
    overlay.style.display = 'block';
  }
}

function closeMobileSidebar(): void {
  const sidebar = document.querySelector<HTMLElement>('nav.site-sidebar');
  const overlay = document.getElementById('mobile-sidebar-overlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.remove('mobile-open');
  overlay.style.display = 'none';
}

// Click sidebar item -> auto close (mobile only)
document.addEventListener('click', function(e: MouseEvent) {
  if (window.innerWidth > 768) return;
  const target = e.target as HTMLElement | null;
  const item = target?.closest('.sidebar-item');
  if (item) closeMobileSidebar();
});

window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
