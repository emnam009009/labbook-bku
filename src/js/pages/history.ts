/**
 * pages/history.ts
 * Render History timeline — 50 su kien gan nhat
 *
 * Phase 2A — Bugfix:
 *  - sort `ts` as number (history-log.js gio push ts: Date.now())
 *  - Hien thi `email` thay vi `user` (rules moi yeu cau uid+email)
 *  - Optional fallback: neu legacy entries co `user` field thi van hien thi
 */

import { vals, escapeHtml } from '../utils/format.js'

interface HistoryRow {
  ts?: number | string;
  email?: string;
  user?: string;
  action?: string;
  detail?: string;
  [k: string]: unknown;
}

export function renderHistory(): void {
  const cache = window.cache as any;
  if (!cache) return;

  const rows = (vals(cache.history) as HistoryRow[])
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))   // sort by number desc
    .slice(0, 50);

  const tl = document.getElementById('history-timeline');
  if (!tl) return;

  tl.innerHTML = rows.length
    ? rows.map(r => {
        const ts = Number(r.ts);
        const d = ts ? new Date(ts) : null;
        const dt = d
          ? `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN')}`
          : '—';
        // Display uu tien email (rules moi), fallback `user` cho legacy entries
        const who = r.email || r.user || '(khong xac dinh)';
        return `<div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-date">${dt}</div>
          <div class="timeline-content">${escapeHtml(r.action || '')}</div>
          <div class="timeline-sub">👤 ${escapeHtml(who)}</div>
          ${r.detail ? '<div class="timeline-change">' + escapeHtml(r.detail) + '</div>' : ''}
        </div>`;
      }).join('')
    : '<div style="color:var(--teal)">Chua co lich su</div>';
}
