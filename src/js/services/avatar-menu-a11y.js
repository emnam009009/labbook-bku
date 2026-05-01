/**
 * services/avatar-menu-a11y.js
 *
 * Cải thiện a11y cho avatar menu (M4 fix):
 *  - Add ARIA: role="menu", role="menuitem", aria-expanded, aria-haspopup
 *  - Keyboard support:
 *    + Enter/Space trên avatar btn: toggle menu
 *    + ArrowDown khi mở: focus item đầu
 *    + ArrowUp/Down trong menu: navigate items
 *    + Esc: đóng menu, return focus về avatar btn
 *    + Tab: đóng menu
 *
 * Không sửa source file avatar.js — patch qua DOM observer + wrap toggleAvatarMenu.
 */

(function setupAvatarMenuA11y() {

  // ── ARIA setup ────────────────────────────────────────────────────────
  function setupAria() {
    const btn = document.querySelector('.avatar-menu-btn, #avatar-btn, [onclick*="toggleAvatarMenu"]');
    const menu = document.getElementById('avatar-menu');
    if (!btn || !menu || btn.dataset.a11yMenu) return;
    btn.dataset.a11yMenu = '1';

    // Avatar button
    if (!btn.hasAttribute('aria-haspopup')) btn.setAttribute('aria-haspopup', 'menu');
    if (!btn.hasAttribute('aria-expanded')) btn.setAttribute('aria-expanded', 'false');
    if (!btn.hasAttribute('aria-controls')) {
      if (!menu.id) menu.id = 'avatar-menu';
      btn.setAttribute('aria-controls', menu.id);
    }
    if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Mở menu tài khoản');
    if (!btn.hasAttribute('tabindex')) btn.setAttribute('tabindex', '0');

    // Menu container
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-labelledby', btn.id || 'avatar-btn');

    // Menu items: tìm các interactive child
    const items = menu.querySelectorAll('a, button, [onclick]:not(input)');
    items.forEach((item, i) => {
      if (!item.hasAttribute('role')) item.setAttribute('role', 'menuitem');
      if (!item.hasAttribute('tabindex')) item.setAttribute('tabindex', '-1');
    });

    return { btn, menu, items: Array.from(items) };
  }

  // ── Keyboard handler ─────────────────────────────────────────────────
  function setupKeyboard() {
    const setup = setupAria();
    if (!setup) return;
    const { btn, menu } = setup;

    // Sync aria-expanded với visual state
    function syncExpanded() {
      const isOpen = menu.style.display === 'block' || getComputedStyle(menu).display !== 'none';
      btn.setAttribute('aria-expanded', String(isOpen));
    }
    const obs = new MutationObserver(syncExpanded);
    obs.observe(menu, { attributes: true, attributeFilter: ['style', 'class'] });

    function isOpen() {
      return menu.style.display === 'block';
    }

    function openMenu() {
      if (typeof window.toggleAvatarMenu === 'function') {
        if (!isOpen()) window.toggleAvatarMenu();
      } else {
        menu.style.display = 'block';
      }
      syncExpanded();
      // Focus first menuitem
      setTimeout(() => {
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        if (items[0]) items[0].focus();
      }, 50);
    }

    function closeMenu() {
      if (typeof window.toggleAvatarMenu === 'function') {
        if (isOpen()) window.toggleAvatarMenu();
      } else {
        menu.style.display = 'none';
      }
      syncExpanded();
      btn.focus();
    }

    function focusItem(items, idx) {
      idx = Math.max(0, Math.min(items.length - 1, idx));
      items[idx]?.focus();
    }

    // Avatar button keyboard
    btn.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (isOpen()) closeMenu();
          else openMenu();
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen()) openMenu();
          else {
            const items = [...menu.querySelectorAll('[role="menuitem"]')];
            focusItem(items, 0);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen()) openMenu();
          else {
            const items = [...menu.querySelectorAll('[role="menuitem"]')];
            focusItem(items, items.length - 1);
          }
          break;
        case 'Escape':
          if (isOpen()) {
            e.preventDefault();
            closeMenu();
          }
          break;
      }
    });

    // Menu items keyboard
    menu.addEventListener('keydown', (e) => {
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      const currentIdx = items.indexOf(document.activeElement);

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          focusItem(items, currentIdx + 1 >= items.length ? 0 : currentIdx + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          focusItem(items, currentIdx - 1 < 0 ? items.length - 1 : currentIdx - 1);
          break;
        case 'Home':
          e.preventDefault();
          focusItem(items, 0);
          break;
        case 'End':
          e.preventDefault();
          focusItem(items, items.length - 1);
          break;
        case 'Escape':
          e.preventDefault();
          closeMenu();
          break;
        case 'Tab':
          // Tab khi mở → đóng menu, để tab flow tự nhiên
          if (isOpen()) closeMenu();
          break;
      }
    });
  }

  // Init: setup khi DOM ready + retry cho elements load chậm
  function init() {
    setupKeyboard();
    setTimeout(setupKeyboard, 1000);
    setTimeout(setupKeyboard, 3000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch for menu being added later
  const obs = new MutationObserver(() => setupKeyboard());
  function startObs() {
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObs);
  } else {
    startObs();
  }

  console.log('[avatar-menu-a11y] loaded');
})();
