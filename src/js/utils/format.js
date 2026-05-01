/**
 * utils/format.js
 * String formatting & escape helpers — không phụ thuộc DOM/Firebase
 */

// ── XSS-safe HTML escape ─────────────────────────────────
// Dùng cho mọi user-controlled string trước khi nhúng vào innerHTML
export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Dùng cho string nhúng vào attribute onclick="...'${x}'..." (escape thêm \ và ')
export function escapeJs(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

// ── Object → array (dùng với Firebase realtime data) ────
export function vals(obj) {
  return obj ? Object.entries(obj).map(([k, v]) => ({ ...v, _key: k })) : [];
}

// ── Fuzzy search (bỏ dấu, hỗ trợ subscript Unicode) ─────
const SUB_MAP = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

export function normalizeSub(s) {
  if (!s) return '';
  return s.replace(/[₀-₉⁰-⁹]/g, c => SUB_MAP[c] || c);
}

export function fuzzy(str, q) {
  if (!str || !q) return false;
  str = normalizeSub(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  q = normalizeSub(q).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (str.includes(q)) return true;
  let si = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = str.indexOf(q[i], si);
    if (idx === -1) return false;
    si = idx + 1;
  }
  return true;
}

// ── Format chemical formula với <sub> cho chỉ số ────────
// VD: "H2SO4" → "H<sub>2</sub>SO<sub>4</sub>"
export function formatChemical(str) {
  if (!str) return str;
  return str.replace(/([A-Za-z\)])(\d+)/g, (match, before, digits, offset, full) => {
    const charBefore = offset > 0 ? full[offset - 1] : '';
    const charAfter = full[offset + match.length] || '';
    if (charBefore === '.' || charBefore === '-' || charBefore === ',' ||
        charAfter === '-' || charAfter === ',') return match;
    return `${before}<sub>${digits}</sub>`;
  });
}

// ── Format ngày giờ kiểu Việt Nam (có HTML xuống dòng) ─
export function fmtDate(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + '<br><span style="font-size:11px;color:var(--text-3)">'
    + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '</span>';
}

// ── Auto-thêm prefix cho mã (HT, E, EC, INK...) ─────────
export function autoPrefix(input, prefix) {
  let val = input.value;
  if (val.toUpperCase().startsWith(prefix)) {
    val = val.slice(prefix.length);
  }
  val = val.replace(/\D/g, '');
  input.value = val ? prefix + val : '';
}
