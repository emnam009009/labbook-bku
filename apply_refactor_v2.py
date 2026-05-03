#!/usr/bin/env python3
"""
apply_refactor_v2.py — Đợt 2: Refactor sâu hơn

Phạm vi:
1. Fix bug HTML: <div id="login-screen"> có 2 thuộc tính style chồng nhau
2. Login screen: extract toàn bộ styles → class
3. Avatar dropdown menu: extract 240px menu + buttons
4. Floating topbar: search box + bell + bell dropdown
5. Tab login/register: dùng class .auth-tab-btn (đã định nghĩa từ đợt 1)
6. Auth submit button: dùng .auth-submit-btn (đã định nghĩa từ đợt 1)

Yêu cầu: đã chạy đợt 1 trước (có sentinel data-refactored-v1).
Sau khi chạy: thêm sentinel data-refactored-v2.
"""

import re
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
HTML_FILE = ROOT / "index.html"
BACKUP_FILE = ROOT / "index.html.v2.bak"


def main():
    if not HTML_FILE.exists():
        print(f"❌ Không tìm thấy {HTML_FILE}")
        sys.exit(1)

    text = HTML_FILE.read_text(encoding="utf-8")

    # Phải chạy đợt 1 trước
    if "data-refactored-v1" not in text:
        print("❌ index.html chưa qua đợt 1. Hãy chạy apply_refactor.py trước.")
        sys.exit(1)

    # Idempotent
    if "data-refactored-v2" in text:
        print("⚠️  index.html đã refactor đợt 2 rồi. Bỏ qua.")
        sys.exit(0)

    shutil.copy(HTML_FILE, BACKUP_FILE)
    print(f"✓ Backup → {BACKUP_FILE.name}")

    original_len = len(text)
    replacements = 0

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

    def do_re(pattern, replacement, label, flags=0):
        nonlocal text, replacements
        new_text, n = re.subn(pattern, replacement, text, flags=flags)
        if n == 0:
            print(f"   ⚠ [{label}] không tìm thấy (regex)")
            return 0
        text = new_text
        replacements += n
        print(f"   ✓ [{label}] thay {n} chỗ (regex)")
        return n

    print("\n━━━━━━━━ ĐỢT 2 — REFACTOR ━━━━━━━━")

    # ═══════════════════════════════════════════════════════════
    # [1] FIX BUG: login-screen có 2 attribute style chồng nhau
    # ═══════════════════════════════════════════════════════════
    print("\n[1] Fix bug HTML + login screen wrapper")
    do(
        '<div id="login-screen" class="fixed inset-0 z-[500] items-center justify-center" style="display:none"\n'
        '       style="background:#ffffff;overflow-y:auto;padding:40px 20px;align-items:center">',
        '<div id="login-screen" class="fixed inset-0 z-[500] items-center justify-center login-screen" style="display:none">',
        "login-screen wrapper (fix double-style bug)",
    )

    # Login glow background
    do(
        '<div style="position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(circle at 50% 0%,rgba(56,193,182,0.45) 0%,transparent 65%);filter:blur(40px)"></div>',
        '<div class="login-glow"></div>',
        "login-glow",
    )

    # Login frame (centered)
    do(
        '<div style="width:min(396px,90vw);position:fixed;top:120px;left:50%;transform:translateX(-50%);z-index:1;text-align:center">',
        '<div class="login-frame">',
        "login-frame",
    )

    # Logo wrap
    do(
        '<div style="margin-bottom:16px">',
        '<div class="login-logo-wrap">',
        "login-logo-wrap",
    )

    # Logo image
    do(
        '<img src="/icons/icon.svg" alt="LabBook logo" width="112" height="112" style="border-radius:26px;box-shadow:0 12px 36px rgba(13,148,136,0.3);display:block;margin:0 auto">',
        '<img src="/icons/icon.svg" alt="LabBook logo" width="112" height="112" class="login-logo">',
        "login-logo img",
    )

    # Login title + tagline
    do(
        '<div style="font-family:\'Inter\',sans-serif;font-size:34px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;line-height:1">LabBook</div>',
        '<div class="login-title">LabBook</div>',
        "login-title",
    )
    do(
        '<div style="color:#64748b;font-size:13px;margin-top:6px">Lab Vật liệu — ĐH Bách Khoa HCM</div>',
        '<div class="login-tagline">Lab Vật liệu — ĐH Bách Khoa HCM</div>',
        "login-tagline",
    )

    # Card chứa form
    do(
        '<div style="background:white;border-radius:20px;padding:32px;box-shadow:0 8px 40px rgba(var(--teal-rgb), 0.12),0 2px 8px rgba(0,0,0,0.06);border:1px solid rgba(var(--teal-rgb), 0.1);margin-top:24px">',
        '<div class="login-card">',
        "login-card",
    )

    # Auth tabs container
    do(
        '<div style="display:flex;background:#f1f5f9;border-radius:10px;padding:4px;margin-bottom:28px">',
        '<div class="auth-tabs">',
        "auth-tabs container",
    )

    # Tab login button (active)
    do(
        '<button id="tab-login-btn" onclick="switchAuthTab(\'login\')"\n'
        '                  style="flex:1;padding:9px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;background:var(--teal);color:white;font-family:\'Inter\',sans-serif">',
        '<button id="tab-login-btn" class="auth-tab-btn active" onclick="switchAuthTab(\'login\')">',
        "tab-login-btn",
    )
    # Tab register button (inactive)
    do(
        '<button id="tab-register-btn" onclick="switchAuthTab(\'register\')"\n'
        '                  style="flex:1;padding:9px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;background:transparent;color:#475569;font-family:\'Inter\',sans-serif">',
        '<button id="tab-register-btn" class="auth-tab-btn" onclick="switchAuthTab(\'register\')">',
        "tab-register-btn",
    )

    # Login form attribute
    do(
        '<form id="auth-login-form" style="text-align:left" onsubmit="doLogin();return false;">',
        '<form id="auth-login-form" class="auth-form" onsubmit="doLogin();return false;">',
        "auth-login-form",
    )
    # Register form attribute
    do(
        '<form id="auth-register-form" onsubmit="doRegister();return false;" style="display:none;text-align:left">',
        '<form id="auth-register-form" class="auth-form" onsubmit="doRegister();return false;" style="display:none">',
        "auth-register-form",
    )

    # Auth field wrappers — login
    do(
        '<div style="margin-bottom:16px">',
        '<div class="auth-field">',
        "auth-field (mb-16)",
    )
    do(
        '<div style="margin-bottom:20px">',
        '<div class="auth-field auth-field--last">',
        "auth-field--last (mb-20)",
    )
    do(
        '<div style="margin-bottom:14px">',
        '<div class="auth-field auth-field--register">',
        "auth-field--register (mb-14)",
    )
    do(
        '<div style="margin-bottom:22px">',
        '<div class="auth-field auth-field--register-last">',
        "auth-field--register-last (mb-22)",
    )

    # Password wrapper (position:relative)
    do(
        '<div style="position:relative">',
        '<div class="auth-pw-wrap">',
        "auth-pw-wrap",
    )

    # Password eye toggle
    do(
        '<button onclick="togglePasswordVisibility()" tabindex="-1"\n'
        '                      style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#475569;padding:0">',
        '<button onclick="togglePasswordVisibility()" tabindex="-1" class="auth-pw-toggle" aria-label="Hiện/ẩn mật khẩu">',
        "auth-pw-toggle",
    )

    # Login error / register error / register success
    do(
        '<div id="login-error" style="display:none;background:#fef2f2;border:1.5px solid #fecaca;border-radius:9px;padding:10px 14px;color:#dc2626;font-size:12.5px;margin-bottom:16px"></div>',
        '<div id="login-error" class="auth-alert auth-alert--error" role="alert"></div>',
        "login-error",
    )
    do(
        '<div id="reg-error" style="display:none;background:#fef2f2;border:1.5px solid #fecaca;border-radius:9px;padding:10px 14px;color:#dc2626;font-size:12.5px;margin-bottom:16px"></div>',
        '<div id="reg-error" class="auth-alert auth-alert--error" role="alert"></div>',
        "reg-error",
    )
    do(
        '<div id="reg-success" style="display:none;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:9px;padding:10px 14px;color:#15803d;font-size:12.5px;margin-bottom:16px;text-align:center"></div>',
        '<div id="reg-success" class="auth-alert auth-alert--success" role="status"></div>',
        "reg-success",
    )

    # Login submit button
    do(
        '<button onclick="doLogin()" id="login-btn"\n'
        '                  style="width:100%;background:var(--teal);color:white;border:none;border-radius:9px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;transition:background 0.15s"\n'
        '                  onmouseover="this.style.background=\'#0f766e\'" onmouseout="this.style.background=\'var(--teal)\'">',
        '<button onclick="doLogin()" id="login-btn" class="auth-submit-btn">',
        "login-btn",
    )
    # Register submit button
    do(
        '<button onclick="doRegister()" id="reg-btn"\n'
        '                  style="width:100%;background:var(--teal);color:white;border:none;border-radius:9px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;transition:background 0.15s"\n'
        '                  onmouseover="this.style.background=\'#0f766e\'" onmouseout="this.style.background=\'var(--teal)\'">',
        '<button onclick="doRegister()" id="reg-btn" class="auth-submit-btn">',
        "reg-btn",
    )

    # Helper text + footer
    do(
        '<div style="text-align:center;margin-top:14px;color:#475569;font-size:12px;line-height:1.6">',
        '<div class="auth-helper-text">',
        "auth-helper-text",
    )
    do(
        '<div style="text-align:center;margin-top:20px;color:#475569;font-size:11.5px">',
        '<div class="auth-footer">',
        "auth-footer",
    )

    # ═══════════════════════════════════════════════════════════
    # [2] AVATAR DROPDOWN MENU
    # ═══════════════════════════════════════════════════════════
    print("\n[2] Avatar dropdown menu (sidebar footer)")

    # Wrapper — giữ inline style.display để khớp với avatar.js (toggleAvatarMenu)
    do(
        '<div style="position:relative" id="avatar-wrapper" onmouseenter="clearTimeout(window._avatarTimer);document.getElementById(\'avatar-menu\').style.display=\'block\'" onmouseleave="window._avatarTimer=setTimeout(()=>document.getElementById(\'avatar-menu\').style.display=\'none\',200)">',
        '<div class="avatar-wrapper" id="avatar-wrapper" '
        'onmouseenter="clearTimeout(window._avatarTimer);document.getElementById(\'avatar-menu\').style.display=\'block\'" '
        'onmouseleave="window._avatarTimer=setTimeout(()=>document.getElementById(\'avatar-menu\').style.display=\'none\',200)">',
        "avatar-wrapper",
    )

    # Avatar button (vòng tròn)
    do(
        '<button id="avatar-btn"\n'
        '                style="width:36px;height:36px;border-radius:50%;border:2px solid #e2e8f0;background:linear-gradient(135deg,var(--teal),var(--teal-3));display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;transition:border 0.15s;flex-shrink:0"\n'
        '                onmouseover="this.style.borderColor=\'var(--teal)\'" onmouseout="this.style.borderColor=\'#e2e8f0\'">',
        '<button id="avatar-btn" class="avatar-btn" aria-label="Mở menu tài khoản">',
        "avatar-btn",
    )

    # Avatar img + initials
    do(
        '<img id="avatar-img" src="" alt="" style="width:100%;height:100%;object-fit:cover;display:none;border-radius:50%">',
        '<img id="avatar-img" class="avatar-btn-img" src="" alt="">',
        "avatar-btn-img",
    )
    do(
        '<span id="avatar-initials" style="font-size:13px;font-weight:600;color:white"></span>',
        '<span id="avatar-initials" class="avatar-btn-initials"></span>',
        "avatar-btn-initials",
    )

    # Avatar menu container — giữ display:none để JS show/hide qua style.display
    do(
        '<div id="avatar-menu" style="display:none;position:fixed;left:55px;bottom:20px;width:240px;background:white;border-radius:10px;padding:12px 0;box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:9999;border:1px solid #e2e8f0">',
        '<div id="avatar-menu" class="avatar-menu" role="menu" style="display:none">',
        "avatar-menu",
    )

    # Avatar menu header
    do(
        '<div style="padding:8px 14px 12px;border-bottom:1px solid #f1f5f9;margin-bottom:6px">',
        '<div class="avatar-menu-header">',
        "avatar-menu-header",
    )
    do(
        '<div id="menu-name" style="font-size:13px;font-weight:600;color:#0f172a;display:flex;align-items:center;justify-content:space-between"></div>',
        '<div id="menu-name" class="avatar-menu-name"></div>',
        "avatar-menu-name",
    )
    do(
        '<div id="menu-email" style="font-size:11px;color:#64748b;margin-top:2px"></div>',
        '<div id="menu-email" class="avatar-menu-email"></div>',
        "avatar-menu-email",
    )
    do(
        '<span id="admin-badge" style="display:none;background:rgba(var(--teal-rgb), 0.15);color:var(--teal-3);border:1px solid rgba(var(--teal-rgb), 0.3);font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px;margin-top:6px;cursor:pointer" onclick="toggleHistory()">Admin</span>',
        '<span id="admin-badge" class="admin-badge" onclick="toggleHistory()">Admin</span>',
        "admin-badge",
    )

    # Avatar menu section (with gap:4px)
    do(
        '<div style="padding:0 10px;display:flex;flex-direction:column;gap:4px">',
        '<div class="avatar-menu-section">',
        "avatar-menu-section (with gap)",
    )

    # File upload label (Đổi ảnh đại diện)
    do(
        '<label style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;color:#0f172a;transition:all 0.2s"\n'
        '                   onmouseover="this.style.background=\'var(--teal)\';this.style.color=\'white\';this.style.transform=\'translate(1px,-1px)\'"\n'
        '                   onmouseout="this.style.background=\'\';this.style.color=\'#0f172a\';this.style.transform=\'\'">',
        '<label class="avatar-menu-file-label">',
        "avatar-menu-file-label",
    )

    # Hidden file input
    do(
        '<input type="file" accept="image/*" style="display:none" onchange="changeAvatar(this)">',
        '<input type="file" accept="image/*" class="avatar-menu-file-input" onchange="changeAvatar(this)">',
        "avatar-menu-file-input",
    )

    # Hai nút avatar-menu-btn còn inline-style (Ảnh mặc định, Đổi mật khẩu)
    # Các nút này đã có class="avatar-menu-btn" nhưng vẫn có inline-style → loại bỏ inline-style
    do(
        '<button onclick="resetAvatar()" class="avatar-menu-btn" style="width:100%;display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#0f172a;text-align:left;transition:all 0.2s">',
        '<button onclick="resetAvatar()" class="avatar-menu-btn">',
        "resetAvatar btn (remove inline)",
    )
    do(
        '<button onclick="openChangePassword()" class="avatar-menu-btn" style="width:100%;display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#0f172a;text-align:left;transition:all 0.2s">',
        '<button onclick="openChangePassword()" class="avatar-menu-btn">',
        "openChangePassword btn (remove inline)",
    )

    # Avatar menu section padding-only (không gap)
    do(
        '<div style="padding:0 10px">',
        '<div class="avatar-menu-section--no-gap">',
        "avatar-menu-section--no-gap",
    )

    # Dividers trong avatar menu
    do(
        '<div style="height:1px;background:#f1f5f9;margin:6px 0"></div>',
        '<div class="avatar-menu-divider" style="margin:6px 0"></div>',
        "avatar-menu-divider 6px",
    )
    do(
        '<div style="height:1px;background:#f1f5f9;margin:4px 0"></div>',
        '<div class="avatar-menu-divider"></div>',
        "avatar-menu-divider 4px",
    )

    # Theme picker row
    do(
        '<div style="display:flex;align-items:center;gap:8px;padding:7px 8px">',
        '<div class="theme-picker-row">',
        "theme-picker-row",
    )
    do(
        '<span style="font-size:12px;color:#64748b;flex:1">Màu giao diện</span>',
        '<span class="theme-picker-label">Màu giao diện</span>',
        "theme-picker-label",
    )

    # Dark mode toggle row
    do(
        '<div style="display:flex;align-items:center;gap:10px;padding:7px 8px">',
        '<div class="dark-toggle-row">',
        "dark-toggle-row",
    )

    # Logout button (đỏ)
    do(
        '<button onclick="doLogout()" id="logout-btn" style="width:100%;display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:#ef4444;text-align:left;transition:all 0.2s"\n'
        '                    onmouseover="this.style.background=\'#fef2f2\';this.style.transform=\'translate(1px,-1px)\'"\n'
        '                    onmouseout="this.style.background=\'\';this.style.transform=\'\'">',
        '<button onclick="doLogout()" id="logout-btn" class="avatar-menu-btn avatar-menu-btn--logout">',
        "logout-btn",
    )

    # ═══════════════════════════════════════════════════════════
    # [3] FLOATING TOPBAR
    # ═══════════════════════════════════════════════════════════
    print("\n[3] Floating topbar (search + bell)")

    # Floating wrapper
    do(
        '<div id="floating-topbar" style="position:fixed;top:14px;right:32px;z-index:50;display:flex;align-items:center;gap:10px">',
        '<div id="floating-topbar" class="floating-topbar">',
        "floating-topbar",
    )

    # Header search wrap
    do(
        '<div id="header-search-wrap" style="position:relative;display:flex;align-items:center">',
        '<div id="header-search-wrap" class="header-search-wrap">',
        "header-search-wrap",
    )

    # Header search box (BIG block với onmouseenter/leave)
    # Style cũ chứa transition + width:40px etc., handlers tự đổi width/border manually.
    # → Thay bằng class .header-search-box; xóa hết inline handlers (CSS :hover/focus-within sẽ lo)
    old_search_box = (
        '<div id="header-search-box" onmouseenter="clearTimeout(window._srchTimer);'
        "const i=document.getElementById('header-search-input');const b=this;"
        "b.style.width='240px';b.style.borderColor='var(--teal)';b.style.borderRadius='20px';"
        "i.style.width='180px';i.style.padding='0 8px 0 0';i.focus()\" "
        'onmouseleave="window._srchTimer=setTimeout(()=>{'
        "const i=document.getElementById('header-search-input');"
        "if(!i.value){i.blur();const b=document.getElementById('header-search-box');"
        "b.style.width='40px';b.style.borderColor='#e2e8f0';b.style.borderRadius='50%';"
        "i.style.width='0';i.style.padding='0';}},400)\" "
        'style="display:flex;align-items:center;overflow:hidden;width:40px;height:40px;'
        'border:1.5px solid #e2e8f0;border-radius:50%;background:white;'
        'transition:width 0.3s cubic-bezier(.4,0,.2,1),border-color 0.2s,border-radius 0.3s"\n'
        '             onmouseenter="this.style.borderColor=\'var(--teal)\'"\n'
        '             onmouseleave="if(!document.getElementById(\'header-search-input\').matches(\':focus\'))'
        "this.style.borderColor='#e2e8f0'\">"
    )
    do(
        old_search_box,
        '<div id="header-search-box" class="header-search-box">',
        "header-search-box",
    )

    # Search icon button
    do(
        '<button type="button" aria-label="Tìm kiếm" onclick="document.getElementById(\'header-search-input\').focus()"\n'
        '                  style="width:34px;height:34px;min-width:34px;flex-shrink:0;border-radius:50%;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;margin-left:3px">',
        '<button type="button" aria-label="Tìm kiếm" class="header-search-icon-btn" onclick="document.getElementById(\'header-search-input\').focus()">',
        "header-search-icon-btn",
    )

    # Header search input
    old_search_input = (
        '<input id="header-search-input" type="text" placeholder="Tìm kiếm..."\n'
        '                 style="border:none;outline:none;background:none;font-size:13px;color:#0f172a;width:0;padding:0;transition:width 0.3s,padding 0.3s;font-family:\'Inter\',sans-serif"\n'
        '                 onfocus="const b=document.getElementById(\'header-search-box\');'
        "b.style.width='240px';b.style.borderColor='var(--teal)';b.style.borderRadius='20px';"
        "this.style.width='180px';this.style.padding='0 8px 0 0'\"\n"
        '                 onblur="setTimeout(()=>{if(!this.value){'
        "const b=document.getElementById('header-search-box');b.style.width='40px';"
        "b.style.borderColor='#e2e8f0';b.style.borderRadius='50%';"
        "this.style.width='0';this.style.padding='0';}},300)\">"
    )
    do(
        old_search_input,
        '<input id="header-search-input" type="text" placeholder="Tìm kiếm..." class="header-search-input">',
        "header-search-input",
    )

    # Bell wrapper — giữ inline style.display để khớp với notifications.js
    do(
        '<div id="bell-wrapper" style="position:relative;display:none" '
        'onmouseenter="clearTimeout(window._bellTimer);document.getElementById(\'bell-dropdown\').style.display=\'block\';'
        "if(typeof window.renderNotificationsList==='function')window.renderNotificationsList()\" "
        'onmouseleave="window._bellTimer=setTimeout(()=>document.getElementById(\'bell-dropdown\').style.display=\'none\',200)">',
        '<div id="bell-wrapper" class="bell-wrapper" style="display:none" '
        'onmouseenter="clearTimeout(window._bellTimer);document.getElementById(\'bell-dropdown\').style.display=\'block\';'
        "if(typeof window.renderNotificationsList==='function')window.renderNotificationsList()\" "
        'onmouseleave="window._bellTimer=setTimeout(()=>document.getElementById(\'bell-dropdown\').style.display=\'none\',200)">',
        "bell-wrapper",
    )

    # Bell button
    do(
        '<button id="bell-btn" type="button" aria-label="Mở thông báo" onclick="window.toggleBellDropdown()" '
        'style="width:40px;height:40px;border-radius:50%;border:1px solid #e2e8f0;background:white;'
        'display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;'
        'transition:all 0.15s;flex-shrink:0"\n'
        '                onmouseover="this.style.background=\'var(--teal-light)\';this.style.borderColor=\'var(--teal-3)\'"\n'
        '                onmouseout="this.style.background=\'white\';this.style.borderColor=\'#e2e8f0\'" title="Thông báo">',
        '<button id="bell-btn" type="button" class="bell-btn" aria-label="Mở thông báo" onclick="window.toggleBellDropdown()" title="Thông báo">',
        "bell-btn",
    )

    # Bell badge
    do(
        '<span id="bell-badge" style="display:none;position:absolute;top:2px;right:2px;min-width:18px;height:18px;'
        'padding:0 5px;background:#ef4444;color:white;border-radius:9px;border:2px solid white;'
        'font-size:10px;font-weight:700;align-items:center;justify-content:center;'
        'box-sizing:border-box;line-height:1">0</span>',
        '<span id="bell-badge" class="bell-badge">0</span>',
        "bell-badge",
    )

    # Bell dropdown — giữ style.display để JS notifications.js control được
    do(
        '<div id="bell-dropdown" style="display:none;position:absolute;top:48px;right:0;width:340px;max-height:480px;'
        'background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);'
        'border:1px solid #e2e8f0;z-index:200;overflow:hidden;display:none">',
        '<div id="bell-dropdown" class="bell-dropdown" role="dialog" aria-label="Thông báo" style="display:none">',
        "bell-dropdown",
    )

    # Bell dropdown header
    do(
        '<div style="padding:14px 16px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">',
        '<div class="bell-dropdown-header">',
        "bell-dropdown-header",
    )
    do(
        '<div style="font-size:14px;font-weight:600;color:var(--text)">Thông báo</div>',
        '<div class="bell-dropdown-title">Thông báo</div>',
        "bell-dropdown-title",
    )
    do(
        '<div style="display:inline-flex;gap:10px;align-items:center">',
        '<div class="bell-dropdown-actions">',
        "bell-dropdown-actions",
    )
    do(
        '<button onclick="window.markAllNotificationsRead()" style="background:none;border:none;color:var(--teal);font-size:11.5px;cursor:pointer;font-weight:500" title="Đánh dấu đã đọc tất cả">Đã đọc tất cả</button>',
        '<button onclick="window.markAllNotificationsRead()" class="bell-dropdown-action bell-dropdown-action--read" title="Đánh dấu đã đọc tất cả">Đã đọc tất cả</button>',
        "bell-action--read",
    )
    do(
        '<span style="color:var(--border);font-size:11.5px">|</span>',
        '<span class="bell-dropdown-sep">|</span>',
        "bell-dropdown-sep",
    )
    do(
        '<button onclick="window.clearAllNotifications()" style="background:none;border:none;color:var(--danger);font-size:11.5px;cursor:pointer;font-weight:500" title="Xóa tất cả thông báo">Xóa tất cả</button>',
        '<button onclick="window.clearAllNotifications()" class="bell-dropdown-action bell-dropdown-action--clear" title="Xóa tất cả thông báo">Xóa tất cả</button>',
        "bell-action--clear",
    )
    do(
        '<div id="bell-list" style="max-height:400px;overflow-y:auto">',
        '<div id="bell-list" class="bell-list">',
        "bell-list",
    )
    do(
        '<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px">',
        '<div class="bell-list-empty">',
        "bell-list-empty",
    )
    do(
        '<svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;margin-bottom:8px">',
        '<svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="bell-list-empty-icon">',
        "bell-list-empty-icon",
    )

    # ═══════════════════════════════════════════════════════════
    # [4] auth.js / theme.js cần biết về class .is-open / .is-visible
    # → Tạo một hàm helper trong window để toggle bell-badge bằng class
    # NHƯNG: vì JS hiện tại set element.style.display='flex'/'none',
    # ta cần đảm bảo CSS .bell-badge.is-visible thắng. Đã thêm rule trong CSS.
    # JS hiện tại có thể vẫn set display='flex' (sẽ override .bell-badge { display:none }).
    # → KHÔNG cần đổi JS ở đợt này. Compatibility OK.
    # ═══════════════════════════════════════════════════════════

    # Sentinel
    text = text.replace(
        '<html lang="vi" data-refactored-v1>',
        '<html lang="vi" data-refactored-v1 data-refactored-v2>',
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
