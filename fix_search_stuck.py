#!/usr/bin/env python3
"""
fix_search_stuck.py — Fix bug header search bị cứng sau khi navigate page

Bug 1 (đã fix lần trước): Search "cứng sau 2 lần" — do icon button có thể giữ focus.
Fix: tabindex="-1" + :has(input:not(:placeholder-shown)) trong CSS.

Bug 2 (đang fix bây giờ): Sau khi click 1 search result và navigate page, search box stuck mở.
Nguyên nhân: global-search.js trong closeDropdown() set inline style:
  box.style.width = '40px';
  box.style.borderColor = '#e2e8f0';
  ... etc.

Inline style này có specificity cao, override CSS :hover/:focus-within → CSS không tự collapse được.

Hơn nữa, rule :has(input:not(:placeholder-shown)) tôi thêm trước đó — cũng gây stuck nếu
input value chưa được clear khi navigate.

Fix v2:
  A. CSS: bỏ rule :has() (vì tin tưởng JS sẽ clear value)
  B. JS (global-search.js): thay inline style.width='40px' → removeProperty('width')
     để CSS hover/focus lại làm chủ
"""

import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
HTML_FILE = ROOT / "index.html"
CSS_FILE = ROOT / "src" / "css" / "components.css"
JS_FILE = ROOT / "src" / "js" / "services" / "global-search.js"

CSS_BAK = ROOT / "src" / "css" / "components.css.fix-stuck.bak"
JS_BAK = ROOT / "src" / "js" / "services" / "global-search.js.fix-stuck.bak"


def main():
    css = CSS_FILE.read_text(encoding="utf-8") if CSS_FILE.exists() else ""
    js = JS_FILE.read_text(encoding="utf-8") if JS_FILE.exists() else ""

    if not css or not js:
        print("❌ Không tìm thấy components.css hoặc global-search.js")
        sys.exit(1)

    if "fix-search-stuck-v2" in js:
        print("⚠️  Đã patch v2 rồi.")
        sys.exit(0)

    shutil.copy(CSS_FILE, CSS_BAK)
    shutil.copy(JS_FILE, JS_BAK)
    print(f"✓ Backup → {CSS_BAK.name}, {JS_BAK.name}")

    # ─────────────────────────────────────────────────────────
    # FIX A: CSS — gỡ rule :has(input:not(:placeholder-shown))
    # ─────────────────────────────────────────────────────────
    print("\n[FIX A] CSS — gỡ rule :has() gây stuck")

    old_block_1 = """.header-search-box:hover,
.header-search-box.is-expanded,
.header-search-box:focus-within,
.header-search-box:has(input:not(:placeholder-shown)) {
  width: 240px;
  border-color: var(--teal);
  border-radius: 20px;
}"""
    new_block_1 = """.header-search-box:hover,
.header-search-box.is-expanded,
.header-search-box:focus-within {
  width: 240px;
  border-color: var(--teal);
  border-radius: 20px;
}"""

    if old_block_1 in css:
        css = css.replace(old_block_1, new_block_1)
        print("  ✓ Đã gỡ :has() ở block 1")
    else:
        print("  ⚠ Block 1 không khớp (có thể đã gỡ rồi)")

    old_block_2 = """.header-search-box:hover .header-search-input,
.header-search-box.is-expanded .header-search-input,
.header-search-box:focus-within .header-search-input,
.header-search-box:has(input:not(:placeholder-shown)) .header-search-input {
  width: 180px;
  padding: 0 8px 0 0;
}"""
    new_block_2 = """.header-search-box:hover .header-search-input,
.header-search-box.is-expanded .header-search-input,
.header-search-box:focus-within .header-search-input {
  width: 180px;
  padding: 0 8px 0 0;
}"""

    if old_block_2 in css:
        css = css.replace(old_block_2, new_block_2)
        print("  ✓ Đã gỡ :has() ở block 2")
    else:
        print("  ⚠ Block 2 không khớp")

    CSS_FILE.write_text(css, encoding="utf-8")

    # ─────────────────────────────────────────────────────────
    # FIX B: JS — sửa closeDropdown trong global-search.js
    # ─────────────────────────────────────────────────────────
    print("\n[FIX B] JS — sửa closeDropdown() để CSS lại làm chủ visibility")

    old_js_block = """    const box = document.getElementById('header-search-box');
    if (box) {
      box.style.width = '40px';
      box.style.borderColor = '#e2e8f0';
      box.style.borderRadius = '50%';
      input.style.width = '0';
      input.style.padding = '0';
    }"""

    new_js_block = """    const box = document.getElementById('header-search-box');
    if (box) {
      // fix-search-stuck-v2: dùng removeProperty để CSS :hover/:focus-within
      // lại kiểm soát width/border. Nếu set inline style, sẽ override CSS
      // và search box bị stuck ở trạng thái collapsed dù chuột hover.
      box.style.removeProperty('width');
      box.style.removeProperty('border-color');
      box.style.removeProperty('border-radius');
      input.style.removeProperty('width');
      input.style.removeProperty('padding');
    }"""

    if old_js_block in js:
        js = js.replace(old_js_block, new_js_block)
        print("  ✓ Đã sửa closeDropdown() dùng removeProperty")
    else:
        print("  ⚠ JS block không khớp (có thể đã patch hoặc code đã thay đổi)")
        # Try to find similar pattern with diff line wrapping
        if "box.style.width = '40px'" in js:
            print("  ❗ Tìm thấy 'box.style.width = \\'40px\\'' nhưng pattern khác — cần manual fix")
            sys.exit(1)

    JS_FILE.write_text(js, encoding="utf-8")

    print(f"\n✓ Done. Test localhost: npm run dev")
    print(f"\n  Test scenarios:")
    print(f"    1. Hover search → expand → leave → collapse")
    print(f"    2. Click icon → focus → expand → click outside → collapse")
    print(f"    3. Gõ 'abc' → expand → click 1 result → navigate → search collapse luôn")
    print(f"    4. Quay lại dashboard → hover lại → expand bình thường")
    print(f"\n  Rollback nếu cần:")
    print(f"    mv {CSS_BAK.name} src/css/components.css")
    print(f"    mv {JS_BAK.name} src/js/services/global-search.js")


if __name__ == "__main__":
    main()
