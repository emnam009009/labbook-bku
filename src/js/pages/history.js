/**
 * pages/history.js
 * Render History timeline — 50 sự kiện gần nhất
 *
 * Phase 2A — Bugfix:
 *  - sort `ts` as number (history-log.js giờ push ts: Date.now())
 *  - Hiển thị `email` thay vì `user` (rules mới yêu cầu uid+email)
 *  - Optional fallback: nếu legacy entries có `user` field thì vẫn hiển thị
 *
 * Phụ thuộc:
 *  - cache qua window.cache
 *  - vals từ utils/format.js
 */

import { vals } from '../utils/format.js'

export function renderHistory() {
  const cache = window.cache;
  if (!cache) return;

  const rows = vals(cache.history)
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
        // Display ưu tiên email (rules mới), fallback `user` cho legacy entries
        const who = r.email || r.user || '(không xác định)';
        return `<div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-date">${dt}</div>
          <div class="timeline-content">${r.action || ''}</div>
          <div class="timeline-sub">👤 ${who}</div>
          ${r.detail ? '<div class="timeline-change">' + r.detail + '</div>' : ''}
        </div>`;
      }).join('')
    : '<div style="color:var(--teal)">Chưa có lịch sử</div>';
}
