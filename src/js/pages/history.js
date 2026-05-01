/**
 * pages/history.js
 * Render History timeline — 50 sự kiện gần nhất
 *
 * Phụ thuộc:
 *  - cache qua window.cache
 *  - vals từ utils/format.js
 *
 * Đặc trưng:
 *  - Sort theo timestamp giảm dần, lấy 50 entries mới nhất
 *  - Hiển thị dạng timeline với dot, ngày giờ, action, user, optional detail
 */

import { vals } from '../utils/format.js'

export function renderHistory() {
  const cache = window.cache;
  if (!cache) return;

  const rows = vals(cache.history)
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
    .slice(0, 50);

  const tl = document.getElementById('history-timeline');
  if (!tl) return;

  tl.innerHTML = rows.length
    ? rows.map(r => {
        const d = new Date(r.ts);
        const dt = `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN')}`;
        return `<div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-date">${dt}</div>
          <div class="timeline-content">${r.action}</div>
          <div class="timeline-sub">👤 ${r.user}</div>
          ${r.detail ? '<div class="timeline-change">' + r.detail + '</div>' : ''}
        </div>`;
      }).join('')
    : '<div style="color:var(--teal)">Chưa có lịch sử</div>';
}
