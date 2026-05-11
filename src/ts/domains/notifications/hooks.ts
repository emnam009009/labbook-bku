/**
 * services/notifications-hooks.ts
 *
 * Hook vao cac function user management hien co (approveUser, deleteUserAccount,
 * changeUserRole) de emit notifications cho admin/superadmin khi co thay doi member.
 *
 * Cach hoat dong: wrap cac window.* function goc, goi nguyen ham truoc, sau do emit notif.
 * Dieu nay tranh phai sua file duplicate-delete.js.
 *
 * Phai duoc import SAU notifications.js trong main.js.
 */

(function setupNotificationHooks() {
  const w = window as any;

  // Doi window.createNotification + cac target functions san sang
  function ready(): boolean {
    return typeof w.createNotification === 'function'
      && typeof w.notifyAdmins === 'function';
  }

  function tryHook(): boolean {
    if (!ready()) return false;

    // ── Hook approveUser ──────────────────────────────────────
    if (typeof w.approveUser === 'function' && !w.approveUser._notifHooked) {
      const orig = w.approveUser;
      w.approveUser = async function(this: unknown, uid: string, role: string) {
        const result = await orig.apply(this, arguments as any);
        try {
          // Tim ten user vua duyet
          const userInfo = w.cache?.users?.[uid] || {};
          const userName = userInfo.displayName || userInfo.email || 'Nguoi dung';
          await w.notifyAdmins(
            'member_added',
            uid,
            'Thanh vien moi duoc duyet',
            `${userName} da duoc duyet voi quyen ${role || 'member'}.`
          );
        } catch (e) {
          console.error('[notif-hook approveUser]', e);
        }
        return result;
      };
      w.approveUser._notifHooked = true;
    }

    // ── Hook deleteUserAccount ────────────────────────────────
    if (typeof w.deleteUserAccount === 'function' && !w.deleteUserAccount._notifHooked) {
      const orig = w.deleteUserAccount;
      w.deleteUserAccount = async function(this: unknown, uid: string, ..._rest: unknown[]) {
        // Lay info TRUOC khi xoa (vi sau khi xoa cache khong con)
        const userInfo = w.cache?.users?.[uid] || {};
        const userName = userInfo.displayName || userInfo.email || 'Nguoi dung';
        const result = await orig.apply(this, arguments as any);
        try {
          await w.notifyAdmins(
            'member_removed',
            uid,
            'Thanh vien bi xoa',
            `${userName} da bi xoa khoi he thong.`
          );
        } catch (e) {
          console.error('[notif-hook deleteUserAccount]', e);
        }
        return result;
      };
      w.deleteUserAccount._notifHooked = true;
    }

    // ── Hook changeUserRole ───────────────────────────────────
    if (typeof w.changeUserRole === 'function' && !w.changeUserRole._notifHooked) {
      const orig = w.changeUserRole;
      w.changeUserRole = async function(this: unknown, uid: string, newRole: string, ..._rest: unknown[]) {
        const userInfo = w.cache?.users?.[uid] || {};
        const userName = userInfo.displayName || userInfo.email || 'Nguoi dung';
        const oldRole = userInfo.role || '?';
        const result = await orig.apply(this, arguments as any);
        try {
          await w.notifyAdmins(
            'member_role_changed',
            uid,
            'Doi quyen thanh vien',
            `${userName}: ${oldRole} -> ${newRole}.`
          );
        } catch (e) {
          console.error('[notif-hook changeUserRole]', e);
        }
        return result;
      };
      w.changeUserRole._notifHooked = true;
    }

    // ── Hook deleteMemberSafe ─────────────────────────────────
    // (Neu xoa member khong phai user — vi du thanh vien khong co account)
    if (typeof w.deleteMemberSafe === 'function' && !w.deleteMemberSafe._notifHooked) {
      const orig = w.deleteMemberSafe;
      w.deleteMemberSafe = async function(this: unknown, memberKey: string, ..._rest: unknown[]) {
        const memberInfo = w.cache?.members?.[memberKey] || {};
        const memberName = memberInfo.name || 'Thanh vien';
        const result = await orig.apply(this, arguments as any);
        try {
          await w.notifyAdmins(
            'member_removed',
            memberKey,
            'Xoa thanh vien',
            `${memberName} da bi xoa.`
          );
        } catch (e) {
          console.error('[notif-hook deleteMemberSafe]', e);
        }
        return result;
      };
      w.deleteMemberSafe._notifHooked = true;
    }

    return true;
  }

  // Try ngay, sau do retry vi cac function expose tu main.js co the cham
  if (!tryHook()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryHook() || attempts > 20) clearInterval(interval);
    }, 200);
  }
})();

console.log('[notif-hooks] loaded');

// Module marker
export {};
