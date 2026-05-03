#!/usr/bin/env python3
"""
apply_refactor_v3.py — Đợt 3: Dọn nốt inline styles còn lại

Phạm vi:
1. text-align:center trong <th> và <td> → class .th-center / .td-center
2. grid-column:1/-1 → class .form-group--full
3. margin-top:36px → class .btn-action-mt (đã định nghĩa ở đợt 1, chưa dùng!)
4. legend-item + legend-dot → tận dụng class đã định nghĩa
5. Image upload labels + previews → class
6. Chem search popover → class
7. Modal width → class .modal--md
8. Dashboard header → class
9. Filter selects min-width → class
10. text-3 helpers → class

KHÔNG động:
- style="display:none" đơn lẻ (initial state, JS control)
- style="display:none;margin-top:36px" composite (initial + spacing — phức tạp)
- inline JS handlers
- style trong inline SVG (stroke, fill — đó là attribute, không phải style)

Yêu cầu: đã chạy đợt 1, đợt 2 trước (sentinel data-refactored-v2).
"""

import re
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
HTML_FILE = ROOT / "index.html"
BACKUP_FILE = ROOT / "index.html.v3.bak"


def main():
    if not HTML_FILE.exists():
        print(f"❌ Không tìm thấy {HTML_FILE}")
        sys.exit(1)

    text = HTML_FILE.read_text(encoding="utf-8")

    if "data-refactored-v2" not in text:
        print("❌ index.html chưa qua đợt 2. Hãy chạy apply_refactor_v2.py trước.")
        sys.exit(1)

    if "data-refactored-v3" in text:
        print("⚠️  index.html đã refactor đợt 3 rồi. Bỏ qua.")
        sys.exit(0)

    shutil.copy(HTML_FILE, BACKUP_FILE)
    print(f"✓ Backup → {BACKUP_FILE.name}")

    original_len = len(text)
    replacements = 0

    def do_re(pattern, replacement, label, flags=0):
        nonlocal text, replacements
        new_text, n = re.subn(pattern, replacement, text, flags=flags)
        if n == 0:
            print(f"   ⚠ [{label}] không tìm thấy (regex)")
            return 0
        text = new_text
        replacements += n
        print(f"   ✓ [{label}] thay {n} chỗ")
        return n

    def do(needle, replacement, label):
        nonlocal text, replacements
        count = text.count(needle)
        if count == 0:
            print(f"   ⚠ [{label}] không tìm thấy")
            return 0
        text = text.replace(needle, replacement)
        print(f"   ✓ [{label}] thay {count} chỗ")
        replacements += count
        return count

    print("\n━━━━━━━━ ĐỢT 3 — REFACTOR ━━━━━━━━")

    # ═══════════════════════════════════════════════════════════
    # [1] <th ... style="text-align:center"> → th-center class
    # ═══════════════════════════════════════════════════════════
    print("\n[1] <th> text-align:center → class .th-center")

    # Pattern: <th scope="col" data-sort="..." style="text-align:center">
    # → bỏ style, thêm class="th-center"
    # Phải xử lý cả <th> đã có data-sort-type
    th_re = re.compile(
        r'<th scope="col"((?: data-[^>]*?)?) style="text-align:center">'
    )
    do_re(th_re, r'<th scope="col"\1 class="th-center">', "th[scope=col] text-align:center")

    # Cũng xử lý <th> không có scope (hiếm hơn)
    th_re2 = re.compile(
        r'<th((?: [a-z\-]+="[^"]*")*?) style="text-align:center">'
    )
    do_re(th_re2, r'<th\1 class="th-center">', "th text-align:center (fallback)")

    # <td style="text-align:center"> nếu có
    do_re(
        r'<td style="text-align:center">',
        r'<td class="td-center">',
        "td text-align:center",
    )

    # ═══════════════════════════════════════════════════════════
    # [2] grid-column:1/-1 → form-group--full
    # ═══════════════════════════════════════════════════════════
    print("\n[2] grid-column:1/-1 → class .form-group--full")

    # <div class="form-group" style="grid-column:1/-1">
    # → <div class="form-group form-group--full">
    do(
        '<div class="form-group" style="grid-column:1/-1">',
        '<div class="form-group form-group--full">',
        "form-group + grid-column",
    )

    # ═══════════════════════════════════════════════════════════
    # [3] margin-top:36px (ở các button + flex row) → class
    # ═══════════════════════════════════════════════════════════
    print("\n[3] margin-top:36px → class .btn-action-mt (button) hoặc inline class")

    # Button có class="btn ..." kèm style="margin-top:36px"
    # Pattern: class="btn btn-primary member-only btn-lg-action" onclick="..." style="margin-top:36px"
    # → bỏ style, thêm class .btn-action-mt
    btn_mt_re = re.compile(
        r'(<button class="btn[^"]*?")( onclick="[^"]*")? style="margin-top:36px">'
    )
    def repl_btn_mt(m):
        cls = m.group(1)
        onc = m.group(2) or ""
        # Inject btn-action-mt vào class hiện có
        new_cls = cls[:-1] + ' btn-action-mt"'
        return f'{new_cls}{onc}>'
    do_re(btn_mt_re, repl_btn_mt, "button btn-action-mt")

    # <div class="flex gap-2 mb-4 flex-wrap items-center" style="margin-top:36px">
    # → thêm class btn-action-mt (vì đã có class flex)
    do(
        '<div class="flex gap-2 mb-4 flex-wrap items-center" style="margin-top:36px">',
        '<div class="flex gap-2 mb-4 flex-wrap items-center btn-action-mt">',
        "flex row btn-action-mt",
    )

    # <div style="display:flex;gap:8px;margin-top:36px;margin-bottom:12px;align-items:center;flex-wrap:wrap"> → bookings tab bar
    # Pattern này khác, để nguyên.

    # ═══════════════════════════════════════════════════════════
    # [4] legend-item + legend-dot
    # ═══════════════════════════════════════════════════════════
    print("\n[4] legend-item (parent span)")

    # <span style="display:inline-flex;align-items:center;gap:4px"> → <span class="legend-item">
    do(
        '<span style="display:inline-flex;align-items:center;gap:4px">',
        '<span class="legend-item">',
        "legend-item",
    )

    print("\n[4b] legend-dot variants (4 màu)")
    # warn (245,158,11,0.6)
    do(
        '<span style="width:10px;height:10px;border-radius:3px;background:rgba(245,158,11,0.6);display:inline-block"></span>',
        '<span class="legend-dot legend-dot--warn"></span>',
        "legend-dot--warn",
    )
    # info (59,130,246,0.6)
    do(
        '<span style="width:10px;height:10px;border-radius:3px;background:rgba(59,130,246,0.6);display:inline-block"></span>',
        '<span class="legend-dot legend-dot--info"></span>',
        "legend-dot--info",
    )
    # success (16,185,129,0.6)
    do(
        '<span style="width:10px;height:10px;border-radius:3px;background:rgba(16,185,129,0.6);display:inline-block"></span>',
        '<span class="legend-dot legend-dot--success"></span>',
        "legend-dot--success",
    )
    # gray (100,116,139,0.4)
    do(
        '<span style="width:10px;height:10px;border-radius:3px;background:rgba(100,116,139,0.4);display:inline-block"></span>',
        '<span class="legend-dot legend-dot--gray"></span>',
        "legend-dot--gray",
    )

    # ═══════════════════════════════════════════════════════════
    # [5] Image upload labels & previews
    # ═══════════════════════════════════════════════════════════
    print("\n[5] Image upload labels & previews")

    # Label (4 chỗ)
    do(
        '<label style="color:var(--blue2);cursor:pointer;font-size:13px;font-weight:500">',
        '<label class="image-upload-label">',
        "image-upload-label",
    )
    # Variant không có font-size (1 chỗ)
    do(
        '<label style="color:var(--blue2);cursor:pointer;font-weight:500">',
        '<label class="image-upload-label--bare">',
        "image-upload-label--bare",
    )

    # Empty state image content (4 chỗ — đã có .empty-state-center từ đợt 1!)
    do(
        '<div style="text-align:center;min-height:200px">',
        '<div class="empty-state-center">',
        "empty-state-center (open)",
    )
    # Variant có id
    do_re(
        r'<div id="([^"]+)" style="text-align:center;min-height:200px">',
        r'<div id="\1" class="empty-state-center">',
        "empty-state-center (with id)",
    )

    # Image preview <img ...> 3 chỗ (hydro, electrode, ink)
    do_re(
        r'<img id="([^"]+)" src="" style="max-width:100%;border-radius:var\(--radius\);display:none;margin-top:10px">',
        r'<img id="\1" src="" class="image-preview">',
        "image-preview",
    )

    # ═══════════════════════════════════════════════════════════
    # [6] Chem dropdown popover (3 chỗ với width:220px)
    # ═══════════════════════════════════════════════════════════
    print("\n[6] Chem search popover")

    do(
        '<div class="chem-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:220px;max-height:180px;overflow-y:auto;display:none"></div>',
        '<div class="chem-dropdown search-popover search-popover--w220"></div>',
        "chem-dropdown popover w220",
    )

    # Electrode dropdown (1 chỗ với width:100%)
    do(
        '<div class="electrode-dropdown" style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);z-index:50;width:100%;max-height:180px;overflow-y:auto;display:none"></div>',
        '<div class="electrode-dropdown search-popover search-popover--w-full"></div>',
        "electrode-dropdown popover",
    )

    # td position:relative wrapper (3 chỗ trong chem-table)
    do(
        '<td style="position:relative">',
        '<td class="td-relative">',
        "td-relative",
    )

    # Readonly input with background:var(--surface2)
    do(
        ' style="background:var(--surface2)"',
        ' class="input-readonly"',
        "input-readonly bg",
    )

    # ═══════════════════════════════════════════════════════════
    # [7] Modal width
    # ═══════════════════════════════════════════════════════════
    print("\n[7] Modal width")

    do(
        '<div class="modal" style="width:min(480px,96vw)">',
        '<div class="modal modal--md">',
        "modal--md",
    )

    # ═══════════════════════════════════════════════════════════
    # [8] Dashboard header
    # ═══════════════════════════════════════════════════════════
    print("\n[8] Dashboard header")

    do(
        '<div style="margin-bottom:24px">\n    <h1 style="font-size:26px;font-weight:600;color:#0f172a;letter-spacing:-0.5px;line-height:1.2;margin-bottom:4px">Tổng quan Lab</h1>',
        '<div class="dashboard-header">\n    <h1 class="dashboard-title">Tổng quan Lab</h1>',
        "dashboard-header + title",
    )

    # ═══════════════════════════════════════════════════════════
    # [9] Filter selects min-width
    # ═══════════════════════════════════════════════════════════
    print("\n[9] Filter select min-width")

    # min-width:180px (3 chỗ ở các member-filter)
    do(
        ' style="min-width:180px"',
        ' class="filter-select"',
        "filter-select 180px",
    )

    # flex:0;min-width:180px (3 chỗ ở các status-filter và type-filter)
    do(
        ' style="flex:0;min-width:180px"',
        ' class="filter-select--narrow"',
        "filter-select--narrow",
    )

    # flex:0;min-width:160px (xuất hiện 2 chỗ ở hydro-status-filter, chem-status-filter)
    do(
        ' style="flex:0;min-width:160px"',
        ' class="filter-select--narrow" style="min-width:160px"',
        "filter-select--narrow + 160px override",
    )

    # ═══════════════════════════════════════════════════════════
    # [10] text-3 helpers
    # ═══════════════════════════════════════════════════════════
    print("\n[10] text-3 muted helpers")

    # color:var(--text-3);font-size:13px (3 chỗ)
    do(
        ' style="color:var(--text-3);font-size:13px"',
        ' class="muted-13"',
        "muted-13",
    )

    # color:var(--text-3);font-size:12px;margin-top:8px (3 chỗ)
    do(
        ' style="color:var(--text-3);font-size:12px;margin-top:8px"',
        ' class="muted-12-mt"',
        "muted-12-mt",
    )

    # ═══════════════════════════════════════════════════════════
    # [11] Sidebar section
    # ═══════════════════════════════════════════════════════════
    print("\n[11] Sidebar section padding")

    do(
        '<div style="padding:8px 0">',
        '<div class="sidebar-section">',
        "sidebar-section",
    )

    # ═══════════════════════════════════════════════════════════
    # [12] color:var(--danger) (5 chỗ)
    # ═══════════════════════════════════════════════════════════
    print("\n[12] color:var(--danger)")

    do(
        ' style="color:var(--danger)"',
        ' class="text-danger-color"',
        "text-danger-color",
    )

    # ═══════════════════════════════════════════════════════════
    # Sentinel
    # ═══════════════════════════════════════════════════════════
    text = text.replace(
        '<html lang="vi" data-refactored-v1 data-refactored-v2>',
        '<html lang="vi" data-refactored-v1 data-refactored-v2 data-refactored-v3>',
        1,
    )

    HTML_FILE.write_text(text, encoding="utf-8")
    new_len = len(text)
    saved = original_len - new_len
    print(f"\n━━━━━━━━ KẾT QUẢ ━━━━━━━━")
    print(f"  Replacements:  {replacements}")
    print(f"  index.html:    {original_len:,} → {new_len:,} bytes (giảm {saved:,})")
    print(f"  Backup:        {BACKUP_FILE.name}")
    print(f"\n✓ Done. Test localhost: npm run dev")
    print(f"  Rollback nếu cần: mv {BACKUP_FILE.name} index.html")


if __name__ == "__main__":
    main()
