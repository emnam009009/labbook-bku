// src/ts/services/parsers/parser-core.ts
// Helpers chung cho tat ca parsers.

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

interface DetectedColumns {
  xIdx: number;
  yIdx: number;
  xLabel: string;
  yLabel: string;
  matchedByHeuristic: boolean;
}

interface ParseFileResult {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  xIdx: number;
  yIdx: number;
  headers: string[];
  matchedByHeuristic: boolean;
}

interface ParserSpecForCore {
  xKeywords: string[];
  yKeywords: string[];
  [k: string]: unknown;
}

/**
 * Parse text content (CSV/TSV/space-delimited) into 2D array of strings.
 * Auto-detect delimiter: comma, tab, semicolon, multiple spaces.
 */
export function parseDelimited(text: string): ParsedTable {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };

  // Detect delimiter from first non-comment line
  const sample = lines.find(l => !l.startsWith('#') && !l.startsWith(';')) || lines[0];
  let delim: string | RegExp = '\t';
  if (sample.includes(',') && sample.split(',').length > 1) delim = ',';
  else if (sample.includes(';') && sample.split(';').length > 1) delim = ';';
  else if (sample.includes('\t')) delim = '\t';
  else delim = /\s+/; // multi-space

  // Filter out comment lines
  const dataLines = lines.filter(l => !l.startsWith('#') && !l.startsWith(';') && !l.startsWith('//'));

  const split = (l: string): string[] => (delim instanceof RegExp ? l.split(delim) : l.split(delim))
    .map((s: string) => s.trim());

  // Detect header: first line where any cell is non-numeric AND not empty
  const isNumeric = (s: string): boolean => {
    if (!s) return false;
    const n = parseFloat(s.replace(',', '.'));
    return !isNaN(n) && isFinite(n);
  };

  let headers: string[] = [];
  let dataStart = 0;
  const firstCells = split(dataLines[0]);
  const firstAllNumeric = firstCells.every(isNumeric);
  if (!firstAllNumeric && firstCells.length >= 2) {
    headers = firstCells.map(h => h.replace(/^["']|["']$/g, ''));
    dataStart = 1;
  } else {
    headers = firstCells.map((_, i) => `col${i + 1}`);
  }

  const rows: string[][] = [];
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
export function toNumericColumns(headers: string[], rows: string[][]): number[][] {
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
 */
export function detectColumns(
  headers: string[],
  xKeywords: string[],
  yKeywords: string[]
): DetectedColumns {
  const lower = headers.map(h => String(h || '').toLowerCase().trim());

  // Cols to never pick (index/sequence)
  const EXCLUDE = ['index', 'idx', 'no.', 'no ', 'stt', '#', 'so thu tu', 'thu tu'];
  const isExcluded = (h: string): boolean => {
    if (!h) return true;
    if (h === 'no' || h === '#' || h === 'idx' || h === 'index' || h === 'stt') return true;
    return EXCLUDE.some(k => h.startsWith(k) || h === k.trim());
  };

  // Match exact "x" or "x (unit)" or "x [unit]"
  const isExactAxis = (h: string, axis: string): boolean => {
    const a = axis.toLowerCase();
    if (h === a) return true;
    // Strip trailing "(...)" or "[...]"
    const stripped = h.replace(/\s*[\(\[].*[\)\]]\s*$/, '').trim();
    return stripped === a;
  };

  const findExact = (axis: string): number => lower.findIndex((h) => !isExcluded(h) && isExactAxis(h, axis));

  const findByKeyword = (keywords: string[], skipIdx = -1): number => {
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
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Read Excel file as 2D array using SheetJS.
 */
export async function readExcelAsRows(file: File): Promise<ParsedTable> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  if (!rows.length) return { headers: [], rows: [] };

  const isNumeric = (v: unknown): boolean => {
    if (v === '' || v == null) return false;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return !isNaN(n) && isFinite(n);
  };

  const firstAllNumeric = rows[0].every(isNumeric);
  let headers: string[];
  let dataRows: any[][];
  if (firstAllNumeric) {
    headers = rows[0].map((_: unknown, i: number) => `col${i + 1}`);
    dataRows = rows;
  } else {
    headers = rows[0].map((v: unknown) => String(v).trim());
    dataRows = rows.slice(1);
  }
  return { headers, rows: dataRows.map(r => r.map((c: unknown) => String(c))) };
}

/**
 * Common entry: parse a file using a "spec" of x/y keywords.
 * Returns { x, y, xLabel, yLabel, headers, rows, matchedByHeuristic }
 * or throws if file cannot be parsed as 2D numeric.
 */
export async function parseFileWithSpec(file: File, spec: ParserSpecForCore): Promise<ParseFileResult> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isExcel = ['xlsx', 'xls', 'xlsm'].includes(ext);

  let parsed: ParsedTable;
  if (isExcel) {
    parsed = await readExcelAsRows(file);
  } else {
    const text = await readFileAsText(file);
    parsed = parseDelimited(text);
  }

  const { headers, rows } = parsed;
  if (!rows.length || headers.length < 2) {
    throw new Error('File khong co du 2 cot du lieu');
  }

  const det = detectColumns(headers, spec.xKeywords, spec.yKeywords);
  const x: number[] = [];
  const y: number[] = [];
  for (const r of rows) {
    const vx = parseFloat(String(r[det.xIdx] ?? '').replace(',', '.'));
    const vy = parseFloat(String(r[det.yIdx] ?? '').replace(',', '.'));
    if (isNaN(vx) || isNaN(vy)) continue;
    x.push(vx);
    y.push(vy);
  }
  if (x.length < 2) {
    throw new Error('Khong doc duoc du lieu so hop le');
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
