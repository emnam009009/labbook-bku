/**
 * Tests cho src/js/utils/format.js
 *
 * Chạy: npm test
 * Watch: npm test -- --watch
 * Coverage: npm test -- --coverage
 */

import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  escapeJs,
  vals,
  normalizeSub,
  fuzzy,
  formatChemical,
  fmtDate,
} from '../../src/js/utils/format.js'

// ─────────────────────────────────────────────────────────────────────────────
//  escapeHtml
// ─────────────────────────────────────────────────────────────────────────────
describe('escapeHtml', () => {
  it('escapes 5 ký tự HTML đặc biệt', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;')
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })

  it('xử lý null/undefined/empty an toàn', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml('')).toBe('')
  })

  it('chuyển number/boolean thành string', () => {
    expect(escapeHtml(42)).toBe('42')
    expect(escapeHtml(true)).toBe('true')
    expect(escapeHtml(0)).toBe('0')
  })

  it('giữ nguyên text không có ký tự đặc biệt', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World')
    expect(escapeHtml('Tiếng Việt có dấu')).toBe('Tiếng Việt có dấu')
  })

  it('escape đầy đủ XSS payload phổ biến', () => {
    const payload = '<img src=x onerror="alert(1)">'
    const result = escapeHtml(payload)
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).toContain('&lt;img')
    expect(result).toContain('&quot;alert(1)&quot;')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  escapeJs
// ─────────────────────────────────────────────────────────────────────────────
describe('escapeJs', () => {
  it('escape backslash và single quote', () => {
    expect(escapeJs("it's")).toBe("it\\'s")
    expect(escapeJs('a\\b')).toBe('a\\\\b')
  })

  it('escape newline và xóa carriage return', () => {
    expect(escapeJs('line1\nline2')).toBe('line1\\nline2')
    expect(escapeJs('line1\r\nline2')).toBe('line1\\nline2')
  })

  it('xử lý null/undefined an toàn', () => {
    expect(escapeJs(null)).toBe('')
    expect(escapeJs(undefined)).toBe('')
  })

  it('giữ nguyên double quote (chỉ escape single)', () => {
    expect(escapeJs('"hello"')).toBe('"hello"')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  vals
// ─────────────────────────────────────────────────────────────────────────────
describe('vals', () => {
  it('chuyển object Firebase thành array với _key', () => {
    const obj = {
      key1: { name: 'A', value: 1 },
      key2: { name: 'B', value: 2 },
    }
    const result = vals(obj)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ name: 'A', value: 1, _key: 'key1' })
    expect(result[1]).toEqual({ name: 'B', value: 2, _key: 'key2' })
  })

  it('trả về array rỗng khi obj null/undefined', () => {
    expect(vals(null)).toEqual([])
    expect(vals(undefined)).toEqual([])
  })

  it('xử lý object rỗng', () => {
    expect(vals({})).toEqual([])
  })

  it('giữ nguyên các field hiện có và thêm _key', () => {
    const obj = { abc: { _key: 'override-me', foo: 'bar' } }
    const result = vals(obj)
    expect(result[0]._key).toBe('abc') // _key bị override bởi key thật
    expect(result[0].foo).toBe('bar')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  normalizeSub
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeSub', () => {
  it('chuyển subscript Unicode thành digit thường', () => {
    expect(normalizeSub('H₂O')).toBe('H2O')
    expect(normalizeSub('CO₂')).toBe('CO2')
    expect(normalizeSub('H₂SO₄')).toBe('H2SO4')
  })

  it('chuyển superscript Unicode (range U+2070-2079) thành digit thường', () => {
    // ⁰¹²³⁴⁵⁶⁷⁸⁹ trong range U+2070-2079
    expect(normalizeSub('a⁰')).toBe('a0')
    expect(normalizeSub('a⁵')).toBe('a5')
    expect(normalizeSub('a⁹')).toBe('a9')
  })

  it('KNOWN ISSUE: ¹²³ (Latin-1 supplement) KHÔNG được map dù có trong SUB_MAP', () => {
    // SUB_MAP có entry cho ¹²³ (U+00B9, U+00B2, U+00B3) nhưng regex range
    // /[₀-₉⁰-⁹]/g chỉ cover U+2080-2089 và U+2070-2079 → bỏ sót ¹²³.
    // Test này document hành vi hiện tại; nếu fix code thì update test.
    expect(normalizeSub('x¹')).toBe('x¹') // hiện tại không đổi
    expect(normalizeSub('x²')).toBe('x²')
    expect(normalizeSub('x³')).toBe('x³')
  })

  it('giữ nguyên ký tự không phải sub/sup', () => {
    expect(normalizeSub('hello world')).toBe('hello world')
    expect(normalizeSub('CaCl2')).toBe('CaCl2') // digit thường, không đổi
  })

  it('xử lý empty/null', () => {
    expect(normalizeSub('')).toBe('')
    expect(normalizeSub(null)).toBe('')
    expect(normalizeSub(undefined)).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  fuzzy
// ─────────────────────────────────────────────────────────────────────────────
describe('fuzzy', () => {
  it('match khi query là substring', () => {
    expect(fuzzy('Hello World', 'World')).toBe(true)
    expect(fuzzy('Hello World', 'hello')).toBe(true) // case-insensitive
  })

  it('bỏ qua dấu tiếng Việt', () => {
    expect(fuzzy('Nguyễn Văn A', 'nguyen')).toBe(true)
    expect(fuzzy('Hóa chất', 'hoa chat')).toBe(true)
  })

  it('match subsequence (fuzzy) — query có thứ tự ký tự đúng trong str', () => {
    expect(fuzzy('Hello World', 'hlo')).toBe(true)
    expect(fuzzy('TypeScript', 'tpt')).toBe(true) // t→y→p→e→S→c→r→i→p→t: t..p..t ✓
    expect(fuzzy('abcdef', 'ace')).toBe(true)
  })

  it('không match khi thứ tự ký tự sai', () => {
    expect(fuzzy('TypeScript', 'tts')).toBe(false) // chỉ có 1 't' rồi không có 't' tiếp
    expect(fuzzy('abc', 'cba')).toBe(false)
  })

  it('không match khi thiếu ký tự', () => {
    expect(fuzzy('Hello', 'xyz')).toBe(false)
    expect(fuzzy('abc', 'abcd')).toBe(false)
  })

  it('match cả với subscript Unicode', () => {
    expect(fuzzy('H₂SO₄', 'h2so4')).toBe(true)
    expect(fuzzy('CO₂', 'co2')).toBe(true)
  })

  it('return false khi str hoặc q rỗng/null', () => {
    expect(fuzzy('', 'abc')).toBe(false)
    expect(fuzzy('abc', '')).toBe(false)
    expect(fuzzy(null, 'abc')).toBe(false)
    expect(fuzzy('abc', null)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  formatChemical
// ─────────────────────────────────────────────────────────────────────────────
describe('formatChemical', () => {
  it('thêm <sub> cho số sau ký tự chữ', () => {
    expect(formatChemical('H2O')).toBe('H<sub>2</sub>O')
    expect(formatChemical('H2SO4')).toBe('H<sub>2</sub>SO<sub>4</sub>')
    expect(formatChemical('CO2')).toBe('CO<sub>2</sub>')
  })

  it('xử lý công thức phức tạp', () => {
    expect(formatChemical('Ca(OH)2')).toContain('<sub>2</sub>')
    expect(formatChemical('Fe2O3')).toBe('Fe<sub>2</sub>O<sub>3</sub>')
  })

  it('không sub khi số đứng sau dấu chấm/phẩy/gạch ngang', () => {
    // Số sau dấu chấm không phải subscript (decimal)
    expect(formatChemical('1.5g')).not.toContain('<sub>')
    // Số sau dấu gạch ngang không phải subscript (range)
    expect(formatChemical('a-2')).not.toContain('<sub>')
  })

  it('xử lý empty/null', () => {
    expect(formatChemical('')).toBe('')
    expect(formatChemical(null)).toBe(null)
    expect(formatChemical(undefined)).toBe(undefined)
  })

  it('không đổi text không có pattern chữ-số', () => {
    expect(formatChemical('Hello')).toBe('Hello')
    expect(formatChemical('123')).toBe('123') // chỉ số, không có chữ trước
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  fmtDate
// ─────────────────────────────────────────────────────────────────────────────
describe('fmtDate', () => {
  it('return "—" cho falsy values', () => {
    expect(fmtDate(null)).toBe('—')
    expect(fmtDate(undefined)).toBe('—')
    expect(fmtDate(0)).toBe('—')
    expect(fmtDate('')).toBe('—')
  })

  it('format số timestamp thành chuỗi VN', () => {
    // 2024-01-15 10:30:45 UTC
    const ts = new Date('2024-01-15T10:30:45Z').getTime()
    const result = fmtDate(ts)
    expect(result).toContain('2024')
    expect(result).toContain('<br>')
    expect(result).toContain('<span')
  })

  it('format string ISO date', () => {
    const result = fmtDate('2024-06-15T08:00:00Z')
    expect(result).toContain('2024')
  })

  it('return original khi parse fail', () => {
    expect(fmtDate('not-a-date')).toBe('not-a-date')
  })
})
