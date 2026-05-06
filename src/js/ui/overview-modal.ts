// src/js/ui/overview-modal.ts
// Round 77b + Round 78 refactor: per-experiment overview modal.
// Render the same 6 analysis groups using shared classifier utility.

import { listAttachments } from '../services/attachments.js';
import { escapeHtml } from '../utils/format.js';
import {
  GROUPS,
  filterDisplayable,
  classifyByGroup,
  renderAccordionGroup,
  type ClassifierItem,
} from '../services/attachment-classifier.js';

const EMPTY_MSG_PER_EXP =
  'Chưa có ảnh nào trong nhóm này. Hãy upload ảnh hoặc bấm "Lưu đồ thị" trong preview.';

export async function openOverviewModal({
  refType, refId, title = '',
}: { refType: string; refId: string; title?: string }): Promise<void> {
  const modalId = 'modal-overview';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="${modalId}-title">
        <div class="modal-header">
          <div class="modal-title" id="${modalId}-title">Tổng quan đồ thị</div>
          <button class="modal-close" type="button" aria-label="Đóng" data-att-action="close-modal" data-modal-id="${modalId}">✕</button>
        </div>
        <div class="modal-body att-overview-body" style="padding:16px"></div>
      </div>
    `;
    document.body.appendChild(modal);
    // Click overlay → close
    modal.addEventListener('click', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.modal')) return;
      (window as any).closeModal?.(modalId);
    });
    // Accordion toggle delegation
    modal.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement)?.closest<HTMLButtonElement>('[data-action="overview-toggle"]');
      if (!btn) return;
      const section = btn.closest<HTMLElement>('.att-overview-group');
      if (!section) return;
      const newState = section.dataset.state === 'open' ? 'closed' : 'open';
      section.dataset.state = newState;
      btn.setAttribute('aria-expanded', String(newState === 'open'));
    });
  }

  const header = modal.querySelector(`#${modalId}-title`) as HTMLElement;
  const body = modal.querySelector('.att-overview-body') as HTMLElement;
  header.textContent = title ? `Tổng quan đồ thị — ${title}` : 'Tổng quan đồ thị';
  body.innerHTML = '<p class="att-overview-loading">Đang tải...</p>';

  (window as any).openModal?.(modalId);

  try {
    const items = await listAttachments(refType, refId) as unknown as ClassifierItem[];
    const displayable = filterDisplayable(items);
    const groups = classifyByGroup(displayable);

    let html = `
      <div class="att-overview-summary">
        <span class="att-overview-summary-total">${displayable.length}</span> ảnh /
        <span>${items.length} file</span> trong thí nghiệm này
      </div>
      <div class="att-overview-accordion">
    `;
    for (const g of GROUPS) {
      html += renderAccordionGroup(g, groups[g.key], { emptyMessage: EMPTY_MSG_PER_EXP });
    }
    if (groups._other.length) {
      html += renderAccordionGroup(
        { key: '_other', label: 'Khác', categories: [] },
        groups._other,
      );
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (e: any) {
    console.error('[overview-modal] load failed:', e);
    body.innerHTML = `<p class="att-overview-error">Lỗi tải dữ liệu: ${escapeHtml(e?.message || 'unknown')}</p>`;
  }
}
