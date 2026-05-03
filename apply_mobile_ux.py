#!/usr/bin/env python3
"""
apply_mobile_ux.py — Cải thiện trải nghiệm mobile

Phạm vi:
1. Thêm import 'mobile-ux.css' vào main.js
2. Thêm inputmode, autocapitalize, autocorrect vào search inputs (mobile keyboard tốt hơn)
3. Thêm meta viewport-fit cho iPhone notch
4. Mark sentinel data-mobile-ux-v1

KHÔNG đụng:
- Logic JS (sidebar toggle, dropdown, ...)
- File CSS có sẵn (argon-flavor.css, main.css, theme-swatches.css, components.css)
"""

import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
HTML_FILE = ROOT / "index.html"
MAIN_JS = ROOT / "src" / "js" / "main.js"
HTML_BAK = ROOT / "index.html.mobile-ux.bak"
JS_BAK = ROOT / "src" / "js" / "main.js.mobile-ux.bak"


def main():
    if not HTML_FILE.exists():
        print(f"❌ Không tìm thấy {HTML_FILE}")
        sys.exit(1)

    html = HTML_FILE.read_text(encoding="utf-8")
    main_js = MAIN_JS.read_text(encoding="utf-8")

    if "data-mobile-ux-v1" in html:
        print("⚠️  Đã áp dụng mobile UX rồi.")
        sys.exit(0)

    shutil.copy(HTML_FILE, HTML_BAK)
    shutil.copy(MAIN_JS, JS_BAK)
    print(f"✓ Backup → {HTML_BAK.name}, {JS_BAK.name}")

    replacements = 0

    def do(needle, replacement, label):
        nonlocal html, replacements
        cnt = html.count(needle)
        if cnt == 0:
            print(f"   ⚠ [{label}] không tìm thấy")
            return 0
        html = html.replace(needle, replacement)
        replacements += cnt
        print(f"   ✓ [{label}] thay {cnt} chỗ")
        return cnt

    print("\n━━━━━━━━ APPLY MOBILE UX ━━━━━━━━")

    # ─────────────────────────────────────────────────────────
    # [1] Import mobile-ux.css vào main.js
    # ─────────────────────────────────────────────────────────
    print("\n[1] Import mobile-ux.css vào main.js")
    if "mobile-ux.css" in main_js:
        print("   ⚠ main.js đã có import mobile-ux.css")
    else:
        old_import = "import '../css/components.css'"
        new_import = "import '../css/components.css'\nimport '../css/mobile-ux.css'"
        if old_import in main_js:
            main_js = main_js.replace(old_import, new_import, 1)
            MAIN_JS.write_text(main_js, encoding="utf-8")
            print("   ✓ Đã thêm import mobile-ux.css")
        else:
            print("   ❌ Không tìm thấy import components.css trong main.js")
            sys.exit(1)

    # ─────────────────────────────────────────────────────────
    # [2] Viewport meta — thêm viewport-fit=cover cho iPhone notch
    # ─────────────────────────────────────────────────────────
    print("\n[2] Viewport meta tag — thêm viewport-fit=cover")
    do(
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
        "viewport-fit",
    )

    # ─────────────────────────────────────────────────────────
    # [3] Search inputs — inputmode + autocapitalize off
    # ─────────────────────────────────────────────────────────
    print("\n[3] Search inputs — inputmode='search' + autocapitalize='off'")

    search_inputs = [
        "hydro-search",
        "electrode-search",
        "ec-search",
        "chem-search",
        "equipment-search",
        "header-search-input",
    ]
    for input_id in search_inputs:
        # Pattern: id="xxx" type="text"
        old_pattern = f'id="{input_id}" type="text"'
        new_pattern = f'id="{input_id}" type="search" inputmode="search" autocapitalize="off" autocorrect="off"'
        do(old_pattern, new_pattern, f"input attrs for #{input_id}")

    # booking-search có pattern khác: type="text" id="booking-search"
    do(
        'type="text" id="booking-search"',
        'type="search" inputmode="search" autocapitalize="off" autocorrect="off" id="booking-search"',
        "input attrs for #booking-search",
    )

    # ─────────────────────────────────────────────────────────
    # [4] Email/login inputs — autocapitalize=none, autocomplete đã có
    # ─────────────────────────────────────────────────────────
    print("\n[4] Auth inputs — autocapitalize=none cho email")

    do(
        'id="login-email" placeholder="example@hcmut.edu.vn" autocomplete="email"',
        'id="login-email" placeholder="example@hcmut.edu.vn" autocomplete="email" autocapitalize="none" autocorrect="off" inputmode="email"',
        "login-email mobile attrs",
    )
    do(
        'id="reg-email" placeholder="example@hcmut.edu.vn" autocomplete="off"',
        'id="reg-email" placeholder="example@hcmut.edu.vn" autocomplete="off" autocapitalize="none" autocorrect="off" inputmode="email"',
        "reg-email mobile attrs",
    )

    # ─────────────────────────────────────────────────────────
    # [5] Password inputs — autocapitalize=off
    # ─────────────────────────────────────────────────────────
    print("\n[5] Password inputs — autocapitalize=off")

    do(
        'id="login-password" placeholder="••••••••" autocomplete="current-password"',
        'id="login-password" placeholder="••••••••" autocomplete="current-password" autocapitalize="off" autocorrect="off"',
        "login-password mobile attrs",
    )
    do(
        'id="reg-password" placeholder="Tối thiểu 6 ký tự" autocomplete="new-password"',
        'id="reg-password" placeholder="Tối thiểu 6 ký tự" autocomplete="new-password" autocapitalize="off" autocorrect="off"',
        "reg-password mobile attrs",
    )

    # ─────────────────────────────────────────────────────────
    # Sentinel
    # ─────────────────────────────────────────────────────────
    if 'data-fix-header-search-v1' in html:
        html = html.replace(
            'data-fix-header-search-v1',
            'data-fix-header-search-v1 data-mobile-ux-v1',
            1,
        )
    elif 'data-refactored-v3' in html:
        html = html.replace(
            'data-refactored-v3',
            'data-refactored-v3 data-mobile-ux-v1',
            1,
        )
    else:
        # Fallback: append vào html tag
        html = html.replace(
            '<html lang="vi"',
            '<html lang="vi" data-mobile-ux-v1',
            1,
        )

    HTML_FILE.write_text(html, encoding="utf-8")

    print(f"\n━━━━━━━━ KẾT QUẢ ━━━━━━━━")
    print(f"  HTML replacements: {replacements}")
    print(f"  Files: index.html, src/js/main.js, src/css/mobile-ux.css")
    print(f"\n✓ Done. Test localhost: npm run dev")
    print(f"\n  Test mobile bằng cách:")
    print(f"    - Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M)")
    print(f"    - Hoặc mở localhost:5173 trên điện thoại cùng wifi")
    print(f"    - Test 3 viewport: 375px (iPhone), 414px (iPhone Pro Max), 768px (iPad)")
    print(f"\n  Rollback nếu cần:")
    print(f"    mv {HTML_BAK.name} index.html")
    print(f"    mv {JS_BAK.name} src/js/main.js")
    print(f"    rm src/css/mobile-ux.css")


if __name__ == "__main__":
    main()
