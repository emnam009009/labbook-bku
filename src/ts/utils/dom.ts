/**
 * utils/dom.ts
 * Tiny DOM helpers — wrap querySelector / innerHTML / animation
 */

// Flash highlight 1 row (dùng sau khi vừa thêm/sửa)
export function flashRow(tr: HTMLElement | null | undefined): void {
  if (!tr) return;
  tr.classList.remove('row-flash');
  void tr.offsetWidth; // trigger reflow để restart animation
  tr.classList.add('row-flash');
  setTimeout(() => tr.classList.remove('row-flash'), 400);
}

// Set textContent an toàn (không bắn lỗi nếu element không tồn tại)
export function setText(id: string, value: string | number): void {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

// Set innerHTML an toàn (caller chịu trách nhiệm escape)
export function setHtml(id: string, html: string): void {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
