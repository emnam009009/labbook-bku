/**
 * services/custom-select-keyboard.js
 *
 * Thêm keyboard support cho 3 loại custom select trong app:
 *  - .cs-modal-trigger (modal selects, vd: c-unit, eq-group)
 *  - .cs-filter-trigger (filter bar selects)
 *  - .custom-select-trigger (legacy)
 *
 * Hỗ trợ:
 *  - Enter/Space: mở dropdown
 *  - ArrowDown: mở + focus option đầu (hoặc move xuống)
 *  - ArrowUp: move lên
 *  - Enter (khi đang mở): chọn option đang focus
 *  - Esc: đóng dropdown, return focus về trigger
 *  - Tab: đóng dropdown, để Tab tiếp tục flow bình thường
 *  - Home/End: jump first/last option
 *
 * Cách hoạt động: dùng MutationObserver theo dõi DOM, attach handler khi
 * custom select mới được tạo. Tự update aria-expanded, aria-activedescendant.
 */

(function setupCustomSelectKeyboard() {

  // ── Attach keyboard handler to a trigger ──────────────────────────────
  function enhanceTrigger(trigger) {
    if (trigger.dataset.kbDone) return;
    trigger.dataset.kbDone = '1';

    // ARIA setup (đã có ở a11y-enhancements.js, đảm bảo lại)
    if (!trigger.hasAttribute('role')) trigger.setAttribute('role', 'combobox');
    if (!trigger.hasAttribute('aria-haspopup')) trigger.setAttribute('aria-haspopup', 'listbox');
    if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
    if (!trigger.hasAttribute('tabindex')) trigger.setAttribute('tabindex', '0');

    // Find dropdown (sibling of trigger inside wrap)
    const wrap = trigger.parentElement;
    if (!wrap) return;
    const dropdown = wrap.querySelector('.cs-modal-dropdown, .cs-filter-dropdown, .custom-select-dropdown');
    if (!dropdown) return;

    if (!dropdown.id) {
      dropdown.id = 'cs-dropdown-' + Math.random().toString(36).substr(2, 9);
    }
    trigger.setAttribute('aria-controls', dropdown.id);
    if (!dropdown.hasAttribute('role')) dropdown.setAttribute('role', 'listbox');

    // Set role="option" for items
    function ensureOptionRoles() {
      dropdown.querySelectorAll('.cs-modal-opt, .cs-filter-opt, .custom-select-option').forEach((opt, i) => {
        if (!opt.hasAttribute('role')) opt.setAttribute('role', 'option');
        if (!opt.id) opt.id = dropdown.id + '-opt-' + i;
        opt.setAttribute('aria-selected', opt.classList.contains('selected') ? 'true' : 'false');
      });
    }
    ensureOptionRoles();

    // Observer to ensure roles when options are added later (rebuild)
    const optObserver = new MutationObserver(() => ensureOptionRoles());
    optObserver.observe(dropdown, { childList: true });

    // Sync aria-expanded with visual state
    function syncExpanded() {
      const isOpen = dropdown.classList.contains('open') || dropdown.style.display === 'block';
      trigger.setAttribute('aria-expanded', String(isOpen));
    }
    const stateObserver = new MutationObserver(syncExpanded);
    stateObserver.observe(dropdown, { attributes: true, attributeFilter: ['class', 'style'] });
    stateObserver.observe(trigger, { attributes: true, attributeFilter: ['class'] });

    // ── Keyboard handler ────────────────────────────────────────────
    let _activeIdx = -1;

    function getOptions() {
      return [...dropdown.querySelectorAll('.cs-modal-opt, .cs-filter-opt, .custom-select-option')];
    }

    function highlightOption(idx) {
      const opts = getOptions();
      if (opts.length === 0) return;
      // Clamp
      idx = Math.max(0, Math.min(opts.length - 1, idx));
      _activeIdx = idx;
      // Visual highlight (giống hover)
      opts.forEach((o, i) => {
        if (i === idx) {
          o.classList.add('kb-active');
          o.scrollIntoView({ block: 'nearest' });
          trigger.setAttribute('aria-activedescendant', o.id);
        } else {
          o.classList.remove('kb-active');
        }
      });
    }

    function clearHighlight() {
      _activeIdx = -1;
      getOptions().forEach(o => o.classList.remove('kb-active'));
      trigger.removeAttribute('aria-activedescendant');
    }

    function isOpen() {
      return dropdown.classList.contains('open') || dropdown.style.display === 'block';
    }

    function openDropdown() {
      // Trigger native click để dùng logic open có sẵn của custom-selects.js
      if (!isOpen()) trigger.click();
      // Highlight selected option (nếu có) hoặc option đầu
      setTimeout(() => {
        const opts = getOptions();
        const selectedIdx = opts.findIndex(o => o.classList.contains('selected'));
        highlightOption(selectedIdx >= 0 ? selectedIdx : 0);
      }, 50);
    }

    function closeDropdown() {
      if (isOpen()) {
        // Emulate click outside
        document.body.click();
        clearHighlight();
      }
    }

    function selectActive() {
      if (_activeIdx < 0) return;
      const opts = getOptions();
      if (opts[_activeIdx]) {
        opts[_activeIdx].click();
        clearHighlight();
        trigger.focus();
      }
    }

    trigger.addEventListener('keydown', (e) => {
      const opts = getOptions();
      if (opts.length === 0) return;

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (isOpen() && _activeIdx >= 0) {
            selectActive();
          } else {
            openDropdown();
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen()) {
            openDropdown();
          } else {
            highlightOption(_activeIdx < 0 ? 0 : _activeIdx + 1);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (!isOpen()) {
            openDropdown();
          } else {
            highlightOption(_activeIdx <= 0 ? opts.length - 1 : _activeIdx - 1);
          }
          break;

        case 'Home':
          if (isOpen()) {
            e.preventDefault();
            highlightOption(0);
          }
          break;

        case 'End':
          if (isOpen()) {
            e.preventDefault();
            highlightOption(opts.length - 1);
          }
          break;

        case 'Escape':
          if (isOpen()) {
            e.preventDefault();
            closeDropdown();
          }
          break;

        case 'Tab':
          // Để Tab flow tiếp tục — chỉ đóng dropdown
          if (isOpen()) closeDropdown();
          break;
      }
    });
  }

  // ── Scan + observe DOM ──────────────────────────────────────────────
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.cs-modal-trigger, .cs-filter-trigger, .custom-select-trigger')
        .forEach(enhanceTrigger);
  }

  // Initial + retries (vì custom selects được build dynamic)
  function init() {
    scan(document);
    setTimeout(() => scan(document), 500);
    setTimeout(() => scan(document), 2000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch for new triggers being added
  const obs = new MutationObserver(muts => {
    let needScan = false;
    for (const m of muts) {
      if (m.addedNodes.length) { needScan = true; break; }
    }
    if (needScan) {
      clearTimeout(obs._t);
      obs._t = setTimeout(() => scan(document), 200);
    }
  });
  function startObs() {
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObs);
  } else {
    startObs();
  }

  // CSS for kb-active state — inject inline
  const style = document.createElement('style');
  style.textContent = `
    .cs-modal-opt.kb-active,
    .cs-filter-opt.kb-active,
    .custom-select-option.kb-active {
      background: var(--teal-light, rgba(13,148,136,0.12)) !important;
      color: var(--teal, #0d9488) !important;
      outline: 2px solid var(--teal, #0d9488);
      outline-offset: -2px;
    }
  `;
  document.head.appendChild(style);

  console.log('[custom-select-keyboard] loaded');
})();
