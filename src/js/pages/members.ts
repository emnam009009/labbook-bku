/**
 * pages/members.ts
 * Render Members (Thanh vien) — danh sach thanh vien dang card grid
 */

import { vals, escapeHtml, escapeJs } from '../utils/format.js'

interface MemberRecord {
  _key: string;
  name?: string;
  email?: string;
  uid?: string;
  role?: string;
  phone?: string;
  studentId?: string;
  topic?: string;
  program?: string;
  [k: string]: unknown;
}

export function renderMembers(): void {
  const cache = window.cache as any;
  if (!cache) return;
  const currentAuth = (window.currentAuth || {}) as any;

  const rows = vals(cache.members) as MemberRecord[];
  const isDark = document.documentElement.classList.contains('dark');

  // Palette: dark mode dung background toi + text sang; light dung pastel
  const colors: Array<[string, string]> = isDark
    ? [['rgba(59,130,246,0.2)', '#93c5fd'], ['rgba(16,185,129,0.2)', '#6ee7b7'], ['rgba(245,158,11,0.2)', '#fcd34d'], ['rgba(239,68,68,0.2)', '#fca5a5'], ['rgba(139,92,246,0.2)', '#c4b5fd']]
    : [['#EFF6FF', '#1E40AF'], ['#F0FDF4', '#166534'], ['#FFFBEB', '#92400E'], ['#FFF5F5', '#991B1B'], ['#F5F3FF', '#5B21B6']];

  const grid = document.getElementById('members-grid') as HTMLElement | null;
  if (!grid) return;

  // SVG icons inline
  const iMail    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 7l10 7 10-7"/></svg>`;
  const iPhone   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 10.8a15.05 15.05 0 006.6 6.6l2.2-2.2a1 1 0 011.1-.2 11.5 11.5 0 003.6 1.1 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3a1 1 0 011 1 11.5 11.5 0 001.1 3.6 1 1 0 01-.2 1.1z"/></svg>`;
  const iId      = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;
  const iTopic   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
  const iProgram = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;

  grid.innerHTML = rows.length ? rows.map((m, i) => {
    const initials = (m.name || '').split(' ').slice(-2).map(w => w[0] || '').join('');
    const [bg, tc] = colors[i % colors.length];
    const canEdit = currentAuth.isAdmin || currentAuth.uid === m.uid;
    const isSuper = m.role === 'superadmin' || ((window as any).__superAdminUid && m.uid === (window as any).__superAdminUid);
    const showDelete = currentAuth.isAdmin && !isSuper;

    // Round 52 XSS fix: escape moi user-controlled string
    const safeKey = escapeJs(m._key);
    const safeName = escapeHtml(m.name || '');
    const safeNameJs = escapeJs(m.name || '');
    const safeUid = escapeJs(m.uid || '');
    const safeRole = escapeHtml(m.role || '—');
    const safeEmail = escapeHtml(m.email || '—');
    const safeProgram = escapeHtml(m.program || '');
    const safePhone = escapeHtml(m.phone || '—');
    const safeStudentId = escapeHtml(m.studentId || '—');
    const safeTopic = escapeHtml(m.topic || '');
    const safeInitials = escapeHtml(initials);

    return `<div class="member-card" ${canEdit ? `data-action="edit-member" data-key="${safeKey}"` : ''} style="cursor:${canEdit ? 'pointer' : 'default'}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="member-avatar" style="background:${bg};color:${tc};flex-shrink:0;width:46px;height:46px;font-size:15px;border-radius:14px">${safeInitials}</div>
        <div style="min-width:0">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)">${safeName}</div>
          <div style="font-size:11.5px;color:var(--teal);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;font-weight:500">${safeRole}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-2);overflow:hidden">
          ${iMail}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeEmail}</span>
        </div>
        ${m.program ? `<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-2)">${iProgram}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeProgram}</span></div>` : ''}
        <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-2)">
          ${iPhone}<span>${safePhone}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-2)">
          ${iId}<span>${safeStudentId}</span>
        </div>
        ${m.topic ? `<div style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--text-2)">${iTopic}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeTopic}</span></div>` : ''}
      </div>
      ${showDelete ? `<button class="member-del-btn" data-action="delete-member" data-key="${safeKey}" data-name="${safeNameJs}" data-uid="${safeUid}"><span class="member-del-btn__text">Xoa</span><span class="member-del-btn__icon"><svg class="w-4 h-4 fill-none stroke-white" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke-linejoin="round" stroke-linecap="round"/></svg></span></button>` : ''}
    </div>`;
  }).join('') : '<div style="color:var(--teal);font-size:13px">Chua co thanh vien</div>';

  // Round 55 (CSP): event delegation thay cho inline onclick
  attachMembersDelegation();
}

// ── Event delegation cho members grid ──────────────
function attachMembersDelegation(): void {
  const grid = document.getElementById('members-grid') as any;
  if (!grid || grid._delegated) return;
  grid._delegated = true;

  grid.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    const action = target.dataset.action;
    const key = target.dataset.key;

    if (action === 'edit-member') {
      // Khong stopPropagation -> behaviour giong onclick cu tren root card
      if (typeof (window as any).editMember === 'function') {
        (window as any).editMember(key);
      }
    } else if (action === 'delete-member') {
      e.stopPropagation();
      const name = target.dataset.name || '';
      const uid = target.dataset.uid || '';
      if (typeof (window as any).deleteMemberSafe === 'function') {
        (window as any).deleteMemberSafe(key, name, uid);
      }
    }
  });
}
