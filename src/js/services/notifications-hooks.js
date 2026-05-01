/**
 * services/notifications-hooks.js
 *
 * Hook vào các function user management hiện có (approveUser, deleteUserAccount,
 * changeUserRole) để emit notifications cho admin/superadmin khi có thay đổi member.
 *
 * Cách hoạt động: wrap các window.* function gốc, gọi nguyên hàm trước, sau đó emit notif.
 * Điều này tránh phải sửa file duplicate-delete.js.
 *
 * Phải được import SAU notifications.js trong main.js.
 */

(function setupNotificationHooks() {
  // Đợi window.createNotification + các target functions sẵn sàng
  function ready() {
    return typeof window.createNotification === 'function'
      && typeof window.notifyAdmins === 'function';
  }

  function tryHook() {
    if (!ready()) return false;

    // ── Hook approveUser ──────────────────────────────────────
    if (typeof window.approveUser === 'function' && !window.approveUser._notifHooked) {
      const orig = window.approveUser;
      window.approveUser = async function(uid, role) {
        const result = await orig.apply(this, arguments);
        try {
          // Tìm tên user vừa duyệt
          const userInfo = window.cache?.users?.[uid] || {};
          const userName = userInfo.displayName || userInfo.email || 'Người dùng';
          await window.notifyAdmins(
            'member_added',
            uid,
            'Thành viên mới được duyệt',
            `${userName} đã được duyệt với quyền ${role || 'member'}.`
          );
        } catch (e) {
          console.error('[notif-hook approveUser]', e);
        }
        return result;
      };
      window.approveUser._notifHooked = true;
    }

    // ── Hook deleteUserAccount ────────────────────────────────
    if (typeof window.deleteUserAccount === 'function' && !window.deleteUserAccount._notifHooked) {
      const orig = window.deleteUserAccount;
      window.deleteUserAccount = async function(uid, ...rest) {
        // Lấy info TRƯỚC khi xóa (vì sau khi xóa cache không còn)
        const userInfo = window.cache?.users?.[uid] || {};
        const userName = userInfo.displayName || userInfo.email || 'Người dùng';
        const result = await orig.apply(this, arguments);
        try {
          await window.notifyAdmins(
            'member_removed',
            uid,
            'Thành viên bị xóa',
            `${userName} đã bị xóa khỏi hệ thống.`
          );
        } catch (e) {
          console.error('[notif-hook deleteUserAccount]', e);
        }
        return result;
      };
      window.deleteUserAccount._notifHooked = true;
    }

    // ── Hook changeUserRole ───────────────────────────────────
    if (typeof window.changeUserRole === 'function' && !window.changeUserRole._notifHooked) {
      const orig = window.changeUserRole;
      window.changeUserRole = async function(uid, newRole, ...rest) {
        const userInfo = window.cache?.users?.[uid] || {};
        const userName = userInfo.displayName || userInfo.email || 'Người dùng';
        const oldRole = userInfo.role || '?';
        const result = await orig.apply(this, arguments);
        try {
          await window.notifyAdmins(
            'member_role_changed',
            uid,
            'Đổi quyền thành viên',
            `${userName}: ${oldRole} → ${newRole}.`
          );
        } catch (e) {
          console.error('[notif-hook changeUserRole]', e);
        }
        return result;
      };
      window.changeUserRole._notifHooked = true;
    }

    // ── Hook deleteMemberSafe ─────────────────────────────────
    // (Nếu xóa member không phải user — ví dụ thành viên không có account)
    if (typeof window.deleteMemberSafe === 'function' && !window.deleteMemberSafe._notifHooked) {
      const orig = window.deleteMemberSafe;
      window.deleteMemberSafe = async function(memberKey, ...rest) {
        const memberInfo = window.cache?.members?.[memberKey] || {};
        const memberName = memberInfo.name || 'Thành viên';
        const result = await orig.apply(this, arguments);
        try {
          await window.notifyAdmins(
            'member_removed',
            memberKey,
            'Xóa thành viên',
            `${memberName} đã bị xóa.`
          );
        } catch (e) {
          console.error('[notif-hook deleteMemberSafe]', e);
        }
        return result;
      };
      window.deleteMemberSafe._notifHooked = true;
    }

    return true;
  }

  // Try ngay, sau đó retry vì các function expose từ main.js có thể chậm
  if (!tryHook()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryHook() || attempts > 20) clearInterval(interval);
    }, 200);
  }
})();

console.log('[notif-hooks] loaded');
