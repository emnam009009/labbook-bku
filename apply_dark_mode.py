#!/usr/bin/env python3
"""
apply_dark_mode.py — Bổ sung dark mode cho các class mới

Phạm vi:
- Thêm import 'dark-mode.css' vào main.js (sau mobile-ux.css để override)
- Thêm sentinel data-dark-mode-v1

KHÔNG đụng:
- File CSS có sẵn
- File HTML
- File JS khác
"""

import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
MAIN_JS = ROOT / "src" / "js" / "main.js"
JS_BAK = ROOT / "src" / "js" / "main.js.dark-mode.bak"


def main():
    if not MAIN_JS.exists():
        print(f"❌ Không tìm thấy {MAIN_JS}")
        sys.exit(1)

    main_js = MAIN_JS.read_text(encoding="utf-8")

    if "dark-mode.css" in main_js:
        print("⚠️  main.js đã có import dark-mode.css")
        sys.exit(0)

    shutil.copy(MAIN_JS, JS_BAK)
    print(f"✓ Backup → {JS_BAK.name}")

    print("\n[1] Import dark-mode.css vào main.js (sau mobile-ux.css)")

    if "import '../css/mobile-ux.css'" in main_js:
        old_block = "import '../css/mobile-ux.css'"
        new_block = "import '../css/mobile-ux.css'\nimport '../css/dark-mode.css'"
        main_js = main_js.replace(old_block, new_block, 1)
        print("  ✓ Đã thêm sau mobile-ux.css")
    elif "import '../css/components.css'" in main_js:
        old_block = "import '../css/components.css'"
        new_block = "import '../css/components.css'\nimport '../css/dark-mode.css'"
        main_js = main_js.replace(old_block, new_block, 1)
        print("  ✓ Đã thêm sau components.css")
    else:
        print("  ❌ Không tìm thấy điểm chèn import trong main.js")
        sys.exit(1)

    MAIN_JS.write_text(main_js, encoding="utf-8")

    print(f"\n✓ Done. Test localhost: npm run dev")
    print(f"\n  Test:")
    print(f"    1. Login → vào Dashboard → click avatar → toggle Dark mode")
    print(f"    2. Quay lại login (logout) → kiểm tra login screen ở dark mode")
    print(f"    3. Check tất cả modals: Thêm hydro/electrode/chemical/equipment")
    print(f"    4. Check bell dropdown, avatar menu, search topbar")
    print(f"    5. Check mobile drawer + hamburger trong dark mode")
    print(f"\n  Rollback:")
    print(f"    mv {JS_BAK.name} src/js/main.js")
    print(f"    rm src/css/dark-mode.css")


if __name__ == "__main__":
    main()
