// src/js/services/parsers/parser-core.js
// Helpers chung cho tất cả parsers.

/**
 * Parse text content (CSV/TSV/space-delimited) into 2D array of strings.
 * Auto-detect delimiter: comma, tab, semicolon, multiple spaces.
 */
export function parseDelimited(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };

  // Detect delimiter from first non-comment line
  const sample = lines.find(l => !l.startsWith('#') && !l.startsWith(';')) || lines[0];
  let delim = '\t';
  if (sample.includes(',') && sample.split(',').length > 1) delim = ',';
  else if (sample.includes(';') && sample.split(';').length > 1) delim = ';';
  else if (sample.includes('\t')) delim = '\t';
  else delim = /\s+/; // multi-space

  // Filter out comment lines
  const dataLines = lines.filter(l => !l.startsWith('#') && !l.startsWith(';') && !l.startsWith('//'));

  const split = (l) => (delim instanceof RegExp ? l.split(delim) : l.split(delim))
    .map(s => s.trim());

  // Detect header: first line where any cell is non-numeric AND not empty
  const isNumeric = (s) => {
    if (!s) return false;
    const n = parseFloat(s.replace(',', '.'));
    return !isNaN(n) && isFinite(n);
  };

  let headers = [];
  let dataStart = 0;
  const firstCells = split(dataLines[0]);
  const firstAllNumeric = firstCells.every(isNumeric);
  if (!firstAllNumeric && firstCells.length >= 2) {
    headers = firstCells.map(h => h.replace(/^["']|["']$/g, ''));
    dataStart = 1;
  } else {
    headers = firstCells.map((_, i) => `col${i + 1}`);
  }

  const rows = [];
  for (let i = dataStart; i < dataLines.length; i++) {
    const cells = split(dataLines[i]);
    if (cells.length < 2) continue;
    rows.push(cells);
  }

  return { headers, rows };
}

/**
 * Convert string cells to numbers. Returns indices that have numeric values.
 */
export function toNumericColumns(headers, rows) {
  const cols = headers.map((_, i) => rows.map(r => {
    const v = r[i];
    if (v == null) return NaN;
    const n = parseFloat(String(v).replace(',', '.'));
    return n;
  }));
  return cols;
}

/**
 * Detect X and Y column indices using keyword heuristic.
 * Strategy:
 *   1) Excluded columns (index/no/stt/#) are never picked.
 *   2) "X" (exact, possibly with unit in parens) → top priority for X.
 *      "Y" (exact, possibly with unit in parens) → top priority for Y.
 *   3) Otherwise scan keywords in order; first match wins.
 *   4) Avoid picking same column for both axes.
 *   5) Fallback: first non-excluded col = X, next non-excluded = Y.
 *
 * @param {string[]} headers
 * @param {string[]} xKeywords - lowercase keywords for X
 * @param {string[]} yKeywords - lowercase keywords for Y
 * @returns {{xIdx, yIdx, xLabel, yLabel, matchedByHeuristic: boolean}}
 */
export function detectColumns(headers, xKeywords, yKeywords) {
  const lower = headers.map(h => String(h || '').toLowerCase().trim());

  // Cols to never pick (index/sequence)
  const EXCLUDE = ['index', 'idx', 'no.', 'no ', 'stt', '#', 'số thứ tự', 'thứ tự'];
  const isExcluded = (h) => {
    if (!h) return true;
    if (h === 'no' || h === '#' || h === 'idx' || h === 'index' || h === 'stt') return true;
    return EXCLUDE.some(k => h.startsWith(k) || h === k.trim());
  };

  // Match exact "x" or "x (unit)" or "x [unit]"
  const isExactAxis = (h, axis) => {
    const a = axis.toLowerCase();
    if (h === a) return true;
    // Strip trailing "(...)" or "[...]"
    const stripped = h.replace(/\s*[\(\[].*[\)\]]\s*$/, '').trim();
    return stripped === a;
  };

  const findExact = (axis) => lower.findIndex((h, i) => !isExcluded(h) && isExactAxis(h, axis));

  const findByKeyword = (keywords, skipIdx = -1) => {
    for (let i = 0; i < lower.length; i++) {
      if (i === skipIdx) continue;
      if (isExcluded(lower[i])) continue;
      if (keywords.some(k => lower[i].includes(k))) return i;
    }
    return -1;
  };

  // Priority 1: exact X / Y header
  let xIdx = findExact('x');
  let yIdx = findExact('y');

  // Priority 2: keywords (skip if already found by exact)
  if (xIdx === -1) xIdx = findByKeyword(xKeywords, yIdx);
  if (yIdx === -1) yIdx = findByKeyword(yKeywords, xIdx);

  const matched = (xIdx !== -1) && (yIdx !== -1) && (xIdx !== yIdx);

  // Fallback: first 2 non-excluded columns
  if (!matched) {
    const nonExcluded = lower
      .map((h, i) => ({ h, i }))
      .filter(o => !isExcluded(o.h));
    if (nonExcluded.length >= 2) {
      return {
        xIdx: nonExcluded[0].i,
        yIdx: nonExcluded[1].i,
        xLabel: headers[nonExcluded[0].i] || 'X',
        yLabel: headers[nonExcluded[1].i] || 'Y',
        matchedByHeuristic: false,
      };
    }
    return {
      xIdx: 0, yIdx: 1,
      xLabel: headers[0] || 'X', yLabel: headers[1] || 'Y',
      matchedByHeuristic: false,
    };
  }

  return {
    xIdx, yIdx,
    xLabel: headers[xIdx],
    yLabel: headers[yIdx],
    matchedByHeuristic: true,
  };
}

/**
 * Read file as text (UTF-8).
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Read Excel file as 2D array using SheetJS.
 */
export async function readExcelAsRows(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  if (!rows.length) return { headers: [], rows: [] };

  const isNumeric = (v) => {
    if (v === '' || v == null) return false;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return !isNaN(n) && isFinite(n);
  };

  const firstAllNumeric = rows[0].every(isNumeric);
  let headers, dataRows;
  if (firstAllNumeric) {
    headers = rows[0].map((_, i) => `col${i + 1}`);
    dataRows = rows;
  } else {
    headers = rows[0].map(v => String(v).trim());
    dataRows = rows.slice(1);
  }
  return { headers, rows: dataRows.map(r => r.map(c => String(c))) };
}

/**
 * Common entry: parse a file using a "spec" of x/y keywords.
 * Returns { x, y, xLabel, yLabel, headers, rows, matchedByHeuristic }
 * or throws if file cannot be parsed as 2D numeric.
 */
export async function parseFileWithSpec(file, spec) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isExcel = ['xlsx', 'xls', 'xlsm'].includes(ext);

  let parsed;
  if (isExcel) {
    parsed = await readExcelAsRows(file);
  } else {
    const text = await readFileAsText(file);
    parsed = parseDelimited(text);
  }

  const { headers, rows } = parsed;
  if (!rows.length || headers.length < 2) {
    throw new Error('File không có đủ 2 cột dữ liệu');
  }

  const det = detectColumns(headers, spec.xKeywords, spec.yKeywords);
  const x = [];
  const y = [];
  for (const r of rows) {
    const vx = parseFloat(String(r[det.xIdx] ?? '').replace(',', '.'));
    const vy = parseFloat(String(r[det.yIdx] ?? '').replace(',', '.'));
    if (isNaN(vx) || isNaN(vy)) continue;
    x.push(vx);
    y.push(vy);
  }
  if (x.length < 2) {
    throw new Error('Không đọc được dữ liệu số hợp lệ');
  }

  return {
    x, y,
    xLabel: det.xLabel,
    yLabel: det.yLabel,
    xIdx: det.xIdx,
    yIdx: det.yIdx,
    headers,
    matchedByHeuristic: det.matchedByHeuristic,
  };
}
