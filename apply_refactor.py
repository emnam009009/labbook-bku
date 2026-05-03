#!/usr/bin/env python3
"""
apply_refactor.py — Đợt 1: Extract inline styles → CSS classes

Chiến lược:
- Dùng regex/string replace có chủ đích, KHÔNG parse HTML (tránh hỏng inline JS).
- Mỗi thay thế đều có pattern khớp duy nhất (verify count trước khi apply).
- Idempotent: chạy lại không hỏng (đã check by sentinel).
- Backup sang index.html.bak trước khi sửa.
"""

import re
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
HTML_FILE = ROOT / "index.html"
BACKUP_FILE = ROOT / "index.html.bak"


def main():
    if not HTML_FILE.exists():
        print(f"❌ Không tìm thấy {HTML_FILE}")
        sys.exit(1)

    text = HTML_FILE.read_text(encoding="utf-8")

    # Sentinel: nếu đã chạy rồi → bỏ qua
    if "data-refactored-v1" in text:
        print("⚠️  index.html đã refactor rồi (có data-refactored-v1). Bỏ qua.")
        sys.exit(0)

    # Backup
    shutil.copy(HTML_FILE, BACKUP_FILE)
    print(f"✓ Backup → {BACKUP_FILE.name}")

    original_len = len(text)
    replacements_made = 0

    def replace_exact(needle, replacement, label, expected_count=None):
        """Thay thế chính xác. Báo lỗi nếu count không khớp."""
        nonlocal text, replacements_made
        count = text.count(needle)
        if count == 0:
            print(f"   ⚠ [{label}] không tìm thấy pattern, bỏ qua")
            return 0
        if expected_count is not None and count != expected_count:
            print(f"   ⚠ [{label}] expected {expected_count}, found {count} — vẫn áp dụng")
        text = text.replace(needle, replacement)
        print(f"   ✓ [{label}] thay {count} chỗ")
        replacements_made += count
        return count

    print("\n━━━━━━━━ ÁP DỤNG REPLACEMENTS ━━━━━━━━")

    # ─────────────────────────────────────────────────────────
    # 1. PAGE TITLE — `style="color:#0F172A !important"` (9 lần)
    # ─────────────────────────────────────────────────────────
    print("\n[1] Page title color override")
    replace_exact(
        '<h1 class="page-title" style="color:#0F172A !important">',
        '<h1 class="page-title page-title-dark">',
        "page-title-dark",
    )

    # ─────────────────────────────────────────────────────────
    # 2. SEARCH WRAPPER — flex:1;min-width:200px (5 lần)
    # ─────────────────────────────────────────────────────────
    print("\n[2] Search wrapper")
    replace_exact(
        '<div style="position:relative;flex:1;min-width:200px">',
        '<div class="search-wrap">',
        "search-wrap",
    )

    # ─────────────────────────────────────────────────────────
    # 3. SEARCH INPUT (loại width:100%;padding-right:32px) (5 lần)
    # ─────────────────────────────────────────────────────────
    print("\n[3] Search input width override (xóa, đã dùng .search-wrap > .search-input)")
    replace_exact(
        ' style="width:100%;padding-right:32px"',
        '',
        "search-input width override (1)",
    )

    # ─────────────────────────────────────────────────────────
    # 4. SEARCH CLEAR BUTTON STYLE (5 lần)
    # ─────────────────────────────────────────────────────────
    print("\n[4] Search clear button styles")

    # Pattern: style + mouseover/mouseout có thể trên dòng riêng, indent linh hoạt
    clear_btn_re = re.compile(
        r'\s*style="display:none;position:absolute;right:8px;top:50%;'
        r'transform:translateY\(-50%\);width:18px;height:18px;border-radius:50%;'
        r'background:#f87171;border:none;cursor:pointer;align-items:center;'
        r'justify-content:center;transition:background 0\.15s"\s*\n?\s*'
        r'onmouseover="this\.style\.background=\'#dc2626\'"\s+'
        r'onmouseout="this\.style\.background=\'#f87171\'"'
    )
    new_text, n = clear_btn_re.subn(' class="search-clear-btn"', text)
    if n > 0:
        text = new_text
        replacements_made += n
        print(f"   ✓ [search-clear-btn] thay {n} chỗ")
    else:
        print("   ⚠ [search-clear-btn] không tìm thấy")

    # Ngoài ra: oninput các search input dùng `display=...?'flex':'none'`
    # → đổi sang `classList.toggle('is-visible', !!this.value)`
    # Mỗi search input có pattern riêng, ta thay từng cái:
    print("\n[4b] oninput của search → toggle .is-visible thay vì display=flex/none")
    search_pairs = [
        ("hydro-search", "renderHydro"),
        ("electrode-search", "renderElectrode"),
        ("ec-search", "renderElectrochem"),
        ("chem-search", "renderChemicals"),
        ("equipment-search", "renderEquipment"),
    ]
    for input_id, render_fn in search_pairs:
        clear_id = input_id + "-clear"
        # oninput cũ (5 lần)
        old_oninput = (
            f'oninput="{render_fn}();'
            f"document.getElementById('{clear_id}')."
            f"style.display=this.value?'flex':'none'\""
        )
        new_oninput = (
            f'oninput="{render_fn}();'
            f"document.getElementById('{clear_id}')."
            f"classList.toggle('is-visible',!!this.value)\""
        )
        replace_exact(old_oninput, new_oninput, f"oninput {input_id}")

        # onclick cũ của clear button
        old_onclick = (
            f"onclick=\"document.getElementById('{input_id}').value='';"
            f"{render_fn}();this.style.display='none'\""
        )
        new_onclick = (
            f"onclick=\"document.getElementById('{input_id}').value='';"
            f"{render_fn}();this.classList.remove('is-visible')\""
        )
        replace_exact(old_onclick, new_onclick, f"onclick {clear_id}")

    # ─────────────────────────────────────────────────────────
    # 5. BTN ICON ROW — `white-space:nowrap;gap:6px;display:inline-flex;align-items:center` (7 lần)
    # ─────────────────────────────────────────────────────────
    print("\n[5] Button icon row inline style")
    # Pattern thường ở dạng: <button class="btn ..." onclick="..." style="white-space:..."
    # Ta thay đoạn style này thành "" và bổ sung class btn-icon-row vào class hiện có.
    # Vì có nhiều biến thể class (btn admin-only, btn, btn btn-primary), ta dùng regex:
    pattern = re.compile(
        r'(<button class="btn[^"]*?")(\s+onclick="[^"]*")?\s+'
        r'style="white-space:nowrap;gap:6px;display:inline-flex;align-items:center"'
    )
    def repl(m):
        class_attr = m.group(1)
        # Inject btn-icon-row vào trong class
        new_class = class_attr[:-1] + ' btn-icon-row"'
        onclick = m.group(2) or ""
        return new_class + onclick
    new_text, n = pattern.subn(repl, text)
    if n > 0:
        text = new_text
        replacements_made += n
        print(f"   ✓ [btn-icon-row] thay {n} chỗ")
    else:
        print("   ⚠ [btn-icon-row] không tìm thấy")

    # ─────────────────────────────────────────────────────────
    # 6. SIDEBAR DIVIDER (4 lần)
    # ─────────────────────────────────────────────────────────
    print("\n[6] Sidebar divider")
    replace_exact(
        '<div style="width:32px;height:1px;background:rgba(255,255,255,0.08);margin:6px auto"></div>',
        '<div class="sidebar-divider"></div>',
        "sidebar-divider",
    )

    # ─────────────────────────────────────────────────────────
    # 7. STAT LABEL BOLD (3 lần — KPI dashboard cards)
    # ─────────────────────────────────────────────────────────
    print("\n[7] Stat label bold")
    replace_exact(
        '<div class="stat-label" style="text-transform:none;font-size:14px;font-weight:700;color:#344767;letter-spacing:-0.01em">',
        '<div class="stat-label stat-label-bold">',
        "stat-label-bold",
    )

    # ─────────────────────────────────────────────────────────
    # 8. AUTH FORM — input fields
    # ─────────────────────────────────────────────────────────
    print("\n[8] Auth form inputs")

    # Input style chung (không có padding-right:42px) — 4 lần
    auth_input_inline = (
        'style="width:100%;background:#f8fafc;border:1.5px solid #e2e8f0;'
        'border-radius:9px;padding:11px 14px;color:#0f172a;font-size:13.5px;'
        "font-family:'Inter',sans-serif;outline:none;box-sizing:border-box;"
        'transition:all 0.15s"\n'
        '              onfocus="this.style.borderColor=\'var(--teal)\';'
        'this.style.background=\'var(--teal-light)\'"\n'
        '              onblur="this.style.borderColor=\'#e2e8f0\';'
        'this.style.background=\'#f8fafc\'"'
    )
    # Có biến thể với indent khác — replace theo pattern thực tế trong file
    # Verify trước:
    cnt = text.count('background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:9px;padding:11px 14px;')
    print(f"   ℹ Tìm thấy {cnt} input có background:#f8fafc;border:1.5px ...")
    # Dùng regex linh hoạt hơn cho input fields:
    auth_input_re = re.compile(
        r'\s*style="width:100%;background:#f8fafc;border:1\.5px solid #e2e8f0;'
        r'border-radius:9px;padding:11px 14px;color:#0f172a;font-size:13\.5px;'
        r"font-family:'Inter',sans-serif;outline:none;box-sizing:border-box;"
        r'transition:all 0\.15s"\s*\n?\s*'
        r'onfocus="this\.style\.borderColor=\'var\(--teal\)\';'
        r'this\.style\.background=\'var\(--teal-light\)\'"\s*\n?\s*'
        r'onblur="this\.style\.borderColor=\'#e2e8f0\';this\.style\.background=\'#f8fafc\'"'
    )
    new_text, n = auth_input_re.subn(' class="auth-input"', text)
    if n > 0:
        text = new_text
        replacements_made += n
        print(f"   ✓ [auth-input] thay {n} chỗ")

    # Variant password (có padding-right:42px)
    auth_input_pw_re = re.compile(
        r'\s*style="width:100%;background:#f8fafc;border:1\.5px solid #e2e8f0;'
        r'border-radius:9px;padding:11px 42px 11px 14px;color:#0f172a;font-size:13\.5px;'
        r"font-family:'Inter',sans-serif;outline:none;box-sizing:border-box;"
        r'transition:all 0\.15s"\s*\n?\s*'
        r'onfocus="this\.style\.borderColor=\'var\(--teal\)\';'
        r'this\.style\.background=\'var\(--teal-light\)\'"\s*\n?\s*'
        r'onblur="this\.style\.borderColor=\'#e2e8f0\';this\.style\.background=\'#f8fafc\'"'
    )
    new_text, n = auth_input_pw_re.subn(' class="auth-input auth-input--password"', text)
    if n > 0:
        text = new_text
        replacements_made += n
        print(f"   ✓ [auth-input--password] thay {n} chỗ")

    # Auth label (5 lần)
    print("\n[8b] Auth labels")
    replace_exact(
        '<label style="display:block;color:#475569;font-size:12.5px;font-weight:600;margin-bottom:7px">',
        '<label class="auth-label">',
        "auth-label",
    )

    # ─────────────────────────────────────────────────────────
    # 9. SENTINEL — đánh dấu đã refactor
    # ─────────────────────────────────────────────────────────
    text = text.replace(
        '<html lang="vi">',
        '<html lang="vi" data-refactored-v1>',
        1,
    )

    # ─────────────────────────────────────────────────────────
    # WRITE
    # ─────────────────────────────────────────────────────────
    HTML_FILE.write_text(text, encoding="utf-8")
    new_len = len(text)
    saved = original_len - new_len
    print(f"\n━━━━━━━━ KẾT QUẢ ━━━━━━━━")
    print(f"  Replacements:  {replacements_made}")
    print(f"  index.html:    {original_len:,} → {new_len:,} bytes (giảm {saved:,})")
    print(f"  Backup:        {BACKUP_FILE.name}")
    print(f"\n✓ Done. Chạy `npm run dev` để test, hoặc `mv index.html.bak index.html` để rollback.")


if __name__ == "__main__":
    main()
