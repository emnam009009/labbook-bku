/**
 * pages/users.ts
 * Render Users — quan ly tai khoan (admin only)
 *  - Pending users table (cho duyet)
 *  - All users table (da duyet) voi role badges, change role select, delete button (super only)
 */

import { fmtDate, escapeHtml, escapeJs } from '../utils/format.js'

const SUPER_ADMIN_EMAIL = 'nvhn.7202@gmail.com';

interface UserRecord {
  uid: string;
  email?: string;
  displayName?: string;
  role?: string;
  createdAt?: string | number;
  deleted?: boolean;
  [k: string]: unknown;
}

// Helper: render nut xoa tai khoan (chi super admin thay, an neu target la super)
function renderDeleteBtn(uid: string, email: string | undefined, displayName: string | undefined): string {
  const currentAuth = (window.currentAuth || {}) as any;
  if (currentAuth.role !== 'superadmin') return '';
  // target user la superadmin -> khong cho xoa
  if (email === SUPER_ADMIN_EMAIL) return '';
  const safeName = escapeJs(displayName || email || '');
  const safeUid = escapeJs(uid);
  return `<button class="del-btn" onclick="deleteUserAccount('${safeUid}','${safeName}')" title="Xoa tai khoan"><svg class="w-4 h-4 fill-none stroke-white" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke-linejoin="round" stroke-linecap="round"></path></svg></button>`;
}

export function renderUsers(): void {
  const cache = window.cache as any;
  if (!cache) return;
  const currentAuth = (window.currentAuth || {}) as any;
  if (!currentAuth.isAdmin) return;

  const data: Record<string, any> = cache._users || {};
  const users: UserRecord[] = Object.entries(data).map(([uid, val]: [string, any]) => ({ uid, ...val }));
  const pending = users.filter(u => u.role === 'pending' && !u.deleted);
  const all     = users.filter(u => u.role !== 'pending' && !u.deleted);

  // Pending count badge
  const countEl = document.getElementById('pending-count');
  if (countEl) countEl.textContent = String(pending.length);

  // Card pending: hien luon (khong thu gon nua — Round 10 fix)
  const pendingCard = document.querySelector<HTMLElement>('#page-users .card.mb-4');
  if (pendingCard) pendingCard.style.display = '';

  // ── Pending table ─────────────────────────────────────
  const pendingTbody = document.getElementById('pending-tbody');
  if (pendingTbody) {
    pendingTbody.innerHTML = pending.length
      ? pending.map(u => `
        <tr>
          <td><strong>${escapeHtml(u.displayName || '—')}</strong></td>
          <td class="mono">${escapeHtml(u.email || '—')}</td>
          <td>${fmtDate(u.createdAt as any)}</td>
          <td class="action-cell">
            <button class="btn btn-xs btn-primary" onclick="approveUser('${escapeJs(u.uid)}','member')">✓ Member</button>
            <button class="btn btn-xs btn-gold" onclick="approveUser('${escapeJs(u.uid)}','viewer')">👁 Viewer</button>
            <button class="btn btn-xs btn-danger" onclick="approveUser('${escapeJs(u.uid)}','rejected')">✕ Tu choi</button>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="padding:24px;font-size:13px"><center style="color:#94a3b8">Khong co tai khoan cho duyet</center></td></tr>';
  }

  // ── All users table ───────────────────────────────────
  const usersTbody = document.getElementById('users-tbody');
  if (!usersTbody) return;

  const roleLabel: Record<string, string> = { admin: 'Admin', member: 'Member', viewer: 'Viewer', rejected: 'Tu choi' };
  const roleIcon: Record<string, string> = {
    admin:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    member:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    viewer:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    rejected: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };
  const roleBadge: Record<string, string> = { admin: 'badge-info', member: 'badge-success', viewer: 'badge-gray', rejected: 'badge-danger' };

  usersTbody.innerHTML = all.length
    ? all.map(u => {
        const isSuper = u.role === 'superadmin';
        // Superadmin co badge gradient cam rieng (khong cho phep doi role/xoa)
        const badge = isSuper
          ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:linear-gradient(135deg,#f59e0b,#d97706);color:white"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Superadmin</span>`
          : `<span class="badge ${roleBadge[u.role || ''] || 'badge-gray'}" style="display:inline-flex;align-items:center;gap:4px">${roleIcon[u.role || ''] || ''}${roleLabel[u.role || ''] || u.role}</span>`;
        return `
        <tr style="vertical-align:middle${isSuper ? ';background:linear-gradient(90deg,rgba(245,158,11,0.05),transparent)' : ''}">
          <td><strong>${escapeHtml(u.displayName || '—')}</strong></td>
          <td class="mono">${escapeHtml(u.email || '—')}</td>
          <td>${badge}</td>
          <td>${fmtDate(u.createdAt as any)}</td>
          <td style="text-align:left;padding-left:8px">${isSuper ? '' : `
            <select onchange="changeUserRole('${escapeJs(u.uid)}',this.value)"
                    style="border:1.5px solid var(--border);border-radius:var(--radius);font-size:12px;background:var(--surface);color:var(--text);padding:4px 0">
              <option value="admin"    ${u.role === 'admin'    ? 'selected' : ''}>Admin</option>
              <option value="member"   ${u.role === 'member'   ? 'selected' : ''}>Member</option>
              <option value="viewer"   ${u.role === 'viewer'   ? 'selected' : ''}>Viewer</option>
              <option value="rejected" ${u.role === 'rejected' ? 'selected' : ''}>Tu choi</option>
            </select>`}</td>
          <td style="width:80px">${isSuper ? '' : renderDeleteBtn(u.uid, u.email, u.displayName)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--teal);padding:24px">Chua co tai khoan nao</td></tr>';
}
