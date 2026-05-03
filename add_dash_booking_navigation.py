#!/usr/bin/env python3
"""
add_dash_booking_navigation.py — Thêm điều hướng từ booking item ở dashboard

Khi user click 1 yêu cầu đăng ký trong card "Lịch đăng ký thiết bị" ở dashboard:
  1. Chuyển sang page Booking
  2. Flash highlight booking row tương ứng

Implementation:
- Sửa file src/js/pages/dashboard.js:
  A. Inject onclick + cursor:pointer vào booking item HTML
  B. Thêm hàm _dashGoToBooking helper ở cuối file
"""

import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
DASH_FILE = ROOT / "src" / "js" / "pages" / "dashboard.js"
BAK_FILE = ROOT / "src" / "js" / "pages" / "dashboard.js.nav-booking.bak"


def main():
    if not DASH_FILE.exists():
        print(f"❌ Không tìm thấy {DASH_FILE}")
        sys.exit(1)

    src = DASH_FILE.read_text(encoding="utf-8")

    if "_dashGoToBooking" in src:
        print("⚠️  Đã patch rồi (có _dashGoToBooking).")
        sys.exit(0)

    shutil.copy(DASH_FILE, BAK_FILE)
    print(f"✓ Backup → {BAK_FILE.name}")

    # ─────────────────────────────────────────────────────────
    # PATCH A: Inject onclick + cursor:pointer vào booking item
    # ─────────────────────────────────────────────────────────
    print("\n[A] Inject onclick vào booking item HTML")

    old_div = (
        '    return `<div style="display:flex;align-items:flex-start;gap:10px;'
        'padding:9px 0;border-bottom:0.5px solid var(--border)">'
    )
    new_div = (
        '    const bookingKey = b._key || \'\';\n'
        '    return `<div onclick="window._dashGoToBooking(\'${bookingKey}\')" '
        'style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;'
        'border-bottom:0.5px solid var(--border);cursor:pointer;'
        'transition:background 0.15s" '
        'onmouseover="this.style.background=\'var(--surface-2)\'" '
        'onmouseout="this.style.background=\'\'" '
        'title="Xem chi tiết yêu cầu đăng ký">'
    )

    if old_div in src:
        src = src.replace(old_div, new_div)
        print("  ✓ Đã inject onclick + hover effect")
    else:
        print("  ❌ Pattern không tìm thấy — có thể code đã đổi")
        sys.exit(1)

    # ─────────────────────────────────────────────────────────
    # PATCH B: Thêm helper _dashGoToBooking ở cuối file
    # ─────────────────────────────────────────────────────────
    print("\n[B] Thêm helper _dashGoToBooking")

    helper_code = '''

// ── Điều hướng từ dashboard booking item → page Booking + flash row ──
window._dashGoToBooking = function(bookingKey) {
  if (!bookingKey || typeof window.showPage !== 'function') return;

  // 1. Tìm sidebar item booking để truyền vào showPage (giúp set active state)
  let sidebarItem = null;
  document.querySelectorAll('.sidebar-item').forEach(s => {
    const onclick = s.getAttribute('onclick') || '';
    if (onclick.includes("'booking'")) sidebarItem = s;
  });

  // 2. Navigate
  window.showPage('booking', sidebarItem);

  // 3. Flash row sau khi page render
  // Multi-attempt vì tbody có thể chưa render xong ngay
  const cache = window.cache || {};
  const code = cache.bookings?.[bookingKey]?.code;
  const attempts = [200, 400, 700, 1000, 1500, 2000];
  attempts.forEach(delay => {
    setTimeout(() => _dashFlashBookingRow(bookingKey, code), delay);
  });
};

function _dashFlashBookingRow(bookingKey, code) {
  const rows = document.querySelectorAll('#booking-tbody tr');
  if (rows.length === 0) return;

  // Skip empty-state row
  const dataRows = [...rows].filter(r => {
    const firstTd = r.querySelector('td:first-child');
    return firstTd && firstTd.colSpan <= 1;
  });
  if (dataRows.length === 0) return;

  let target = null;
  // Match 1: bookingKey trong outerHTML
  if (bookingKey) {
    for (const row of dataRows) {
      if (row.outerHTML.indexOf(bookingKey) !== -1) {
        target = row;
        break;
      }
    }
  }
  // Match 2: code trong text
  if (!target && code) {
    for (const row of dataRows) {
      if ((row.textContent || '').indexOf(code) !== -1) {
        target = row;
        break;
      }
    }
  }

  if (!target) return;

  // Scroll into view + flash highlight
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Animation flash: dùng class .row-flash nếu có, fallback inline
  if (target.classList.contains('row-flash')) {
    target.classList.remove('row-flash');
    void target.offsetWidth; // trigger reflow để re-animate
  }
  target.classList.add('row-flash');
  setTimeout(() => target.classList.remove('row-flash'), 2200);
}
'''

    src = src.rstrip() + helper_code + "\n"
    print("  ✓ Đã thêm _dashGoToBooking + _dashFlashBookingRow")

    DASH_FILE.write_text(src, encoding="utf-8")

    print(f"\n✓ Done. Test localhost: npm run dev")
    print(f"\n  Test:")
    print(f"    1. Mở Dashboard → card 'Lịch đăng ký thiết bị'")
    print(f"    2. Click 1 booking trong list")
    print(f"    3. → Tự navigate sang page Booking + row được highlight")
    print(f"\n  Rollback:")
    print(f"    mv {BAK_FILE.name} src/js/pages/dashboard.js")


if __name__ == "__main__":
    main()
