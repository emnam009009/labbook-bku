/**
 * services/a11y-enhancements.js
 *
 * Tự động thêm ARIA attributes cho các widget dynamic được render bởi JS,
 * mà không cần sửa từng file render riêng lẻ.
 *
 * Phụ trách:
 *  1. Lock toggle button (M3): thêm role="switch", aria-checked, aria-label
 *  2. Sort toggle (table headers clickable): thêm aria-sort
 *  3. Action delete buttons trong table: thêm aria-label nếu thiếu
 *  4. Avatar menu (M4 placeholder): thêm aria-haspopup, aria-expanded
 *
 * Strategy: MutationObserver theo dõi DOM, mỗi khi có node mới được thêm
 * thì scan và enhance.
 */

(function setupA11yEnhancements() {

  // ── 1. Lock toggle ARIA ──────────────────────────────────────────────
  function enhanceLockToggle(btn) {
    if (btn.dataset.a11yDone) return;
    btn.dataset.a11yDone = '1';

    btn.setAttribute('role', 'switch');
    // Detect locked state — usually based on class or icon SVG path
    const isLocked = btn.classList.contains('locked')
      || btn.classList.contains('lock-on')
      || btn.querySelector('svg path[d*="rect"]') !== null
      || (btn.title && /khóa|lock/i.test(btn.title));

    btn.setAttribute('aria-checked', String(isLocked));

    if (!btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', isLocked ? 'Mở khóa' : 'Khóa');
    }

    // Khi click, sau 100ms recheck state để cập nhật aria-checked
    btn.addEventListener('click', () => {
      setTimeout(() => {
        const newLocked = btn.classList.contains('locked')
          || btn.classList.contains('lock-on')
          || btn.querySelector('svg path[d*="rect"]') !== null
          || (btn.title && /khóa|lock/i.test(btn.title));
        btn.setAttribute('aria-checked', String(newLocked));
        btn.setAttribute('aria-label', newLocked ? 'Mở khóa' : 'Khóa');
      }, 150);
    });
  }

  // ── 2. Action buttons (del-btn, edit-btn) ARIA ───────────────────────
  function enhanceActionButton(btn) {
    if (btn.dataset.a11yDone) return;
    btn.dataset.a11yDone = '1';

    // Nếu đã có aria-label, không đụng
    if (btn.getAttribute('aria-label')) return;

    if (btn.classList.contains('del-btn')) {
      btn.setAttribute('aria-label', 'Xóa');
    } else if (btn.classList.contains('edit-btn')) {
      btn.setAttribute('aria-label', 'Chỉnh sửa');
    } else if (btn.classList.contains('duplicate-btn')) {
      btn.setAttribute('aria-label', 'Nhân bản');
    } else if (btn.classList.contains('approve-btn')) {
      btn.setAttribute('aria-label', 'Duyệt');
    } else if (btn.classList.contains('reject-btn')) {
      btn.setAttribute('aria-label', 'Từ chối');
    } else if (btn.classList.contains('member-del-btn')) {
      btn.setAttribute('aria-label', 'Xóa thành viên');
    }
  }

  // ── 3. Sortable table headers (aria-sort) ────────────────────────────
  function enhanceSortableHeader(th) {
    if (th.dataset.a11yDone) return;
    th.dataset.a11yDone = '1';

    if (!th.classList.contains('sortable')) return;
    if (!th.hasAttribute('aria-sort')) {
      th.setAttribute('aria-sort', 'none');
    }
  }

  // ── 4. Custom select (cs-modal-trigger) — placeholder for H1 ─────────
  function enhanceCustomSelect(trigger) {
    if (trigger.dataset.a11yDone) return;
    trigger.dataset.a11yDone = '1';

    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    if (!trigger.hasAttribute('aria-expanded')) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    if (!trigger.hasAttribute('tabindex')) {
      trigger.setAttribute('tabindex', '0');
    }
  }

  // ── 5. Avatar menu — placeholder for M4 ──────────────────────────────
  function enhanceAvatarMenu(btn) {
    if (btn.dataset.a11yDone) return;
    btn.dataset.a11yDone = '1';

    btn.setAttribute('aria-haspopup', 'menu');
    if (!btn.hasAttribute('aria-expanded')) {
      btn.setAttribute('aria-expanded', 'false');
    }
    if (!btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', 'Mở menu tài khoản');
    }
  }

  // ── Main scan ────────────────────────────────────────────────────────
  function scan(root) {
    if (!root || !root.querySelectorAll) return;

    // Lock toggles: button có class lock-toggle hoặc onclick chứa lockItem/unlockItem
    root.querySelectorAll('button.lock-toggle, button[onclick*="lockItem"], button[onclick*="unlockItem"], button[onclick*="lockInk"], button[onclick*="unlockInk"]')
      .forEach(enhanceLockToggle);

    // Action buttons
    root.querySelectorAll('button.del-btn, button.edit-btn, button.duplicate-btn, button.approve-btn, button.reject-btn, button.member-del-btn')
      .forEach(enhanceActionButton);

    // Sortable headers
    root.querySelectorAll('th.sortable').forEach(enhanceSortableHeader);

    // Custom selects (modal dropdowns)
    root.querySelectorAll('.cs-modal-trigger, .custom-select-trigger')
      .forEach(enhanceCustomSelect);

    // Avatar menu button
    root.querySelectorAll('.avatar-menu-btn').forEach(enhanceAvatarMenu);
  }

  // Initial scan
  function init() {
    scan(document);
    setTimeout(() => scan(document), 1000);  // re-scan sau khi data load
    setTimeout(() => scan(document), 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // MutationObserver để bắt elements mới được thêm vào DOM
  const observer = new MutationObserver(mutations => {
    let needScan = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) { needScan = true; break; }
    }
    if (needScan) {
      // Throttle để tránh scan quá thường xuyên
      clearTimeout(observer._throttle);
      observer._throttle = setTimeout(() => scan(document), 200);
    }
  });

  // Bắt đầu observe khi DOM ready
  function startObserving() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
  } else {
    startObserving();
  }

  console.log('[a11y-enhancements] loaded');
})();
