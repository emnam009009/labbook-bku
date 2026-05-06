/**
 * utils/format.ts
 * String formatting & escape helpers — không phụ thuộc DOM/Firebase
 */

// ── XSS-safe HTML escape ─────────────────────────────────
// Dùng cho mọi user-controlled string trước khi nhúng vào innerHTML
export function escapeHtml(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Dùng cho string nhúng vào attribute onclick="...'${x}'..." (escape thêm \\ và ')
export function escapeJs(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

// ── Object → array (dùng với Firebase realtime data) ────
// T extends object: input là Record<string, T>, return là (T & {_key: string})[]
export function vals<T extends Record<string, unknown> = Record<string, unknown>>(
  obj: Record<string, T> | null | undefined
): Array<T & { _key: string }> {
  return obj ? Object.entries(obj).map(([k, v]) => ({ ...(v as T), _key: k })) : [];
}

// ── Fuzzy search (bỏ dấu, hỗ trợ subscript Unicode) ─────
// LƯU Ý: regex /[₀-₉⁰-⁹]/g chỉ cover U+2080-2089 và U+2070-2079.
// SUB_MAP có entry cho ¹²³ (U+00B9, U+00B2, U+00B3) nhưng regex bỏ sót.
// Đây là "known issue" được document trong test - giữ nguyên behavior.
const SUB_MAP: Record<string, string> = {
  '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4',
  '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9',
  '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2074': '4',
  '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
};

export function normalizeSub(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/[\u2080-\u2089\u2070-\u2079]/g, c => SUB_MAP[c] || c);
}

export function fuzzy(str: string | null | undefined, q: string | null | undefined): boolean {
  if (!str || !q) return false;
  const s = normalizeSub(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const query = normalizeSub(q).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes(query)) return true;
  let si = 0;
  for (let i = 0; i < query.length; i++) {
    const idx = s.indexOf(query[i], si);
    if (idx === -1) return false;
    si = idx + 1;
  }
  return true;
}

// ── Format chemical formula với <sub> cho chỉ số ────────
// VD: "H2SO4" → "H<sub>2</sub>SO<sub>4</sub>"
export function formatChemical(str: string | null | undefined): string | null | undefined {
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
export function fmtDate(ts: number | string | Date | null | undefined): string {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts as any);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + '<br><span style="font-size:11px;color:var(--text-3)">'
    + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '</span>';
}

// ── Auto-thêm prefix cho mã (HT, E, EC, INK...) ─────────
export function autoPrefix(input: HTMLInputElement, prefix: string): void {
  let val = input.value;
  if (val.toUpperCase().startsWith(prefix)) {
    val = val.slice(prefix.length);
  }
  val = val.replace(/\D/g, '');
  input.value = val ? prefix + val : '';
}
