// src/js/services/parsers/corrware.ts
// Parser cho CorrWare ASCII format (.cor) — CorrWare/Solartron output
// dung cho cac phep do dien hoa: CV, LSV, GCD, EIS.
//
// Cau truc file:
//   CORRW ASCII
//     CorrWare for Windows: Version X.Y
//     <ExperimentType>\t[params][config]\t<filename>
//     Date: ... Time: ...
//     ...
//     Begin Information:    Cell Information
//       ...key/value...
//     End Information:      Cell Information
//     Begin Pstat: ...
//       ...
//     End Pstat: ...
//     Begin Experiment: <type>
//       ...
//     End Experiment: <type>
//     Data Points: N
//     E(Volts)\tI(A/cm2)\tT(Seconds)
//   End Comments
//   <data rows tab-separated>
//
// Subtypes detected (from line 3 experiment type):
//   - "Cyclic Voltammogram" → cv (X=potential, Y=current)
//   - "Linear Sweep Voltammogram" → lsv (X=potential, Y=current)
//   - "Galvanic Cycle" / "Galvanostatic" / "Galvanostat" → gcd
//     (X=time, Y=potential)
//   - "Impedance" / "EIS" → eis (fallback to generic — file format differs)
//   - Default → unknown (fallback to CV-like axes)

interface CorrWareResult {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  xIdx: number;
  yIdx: number;
  headers: string[];
  matchedByHeuristic: boolean;
  _meta: Record<string, string>;
}

export type CorrWareSubtype = 'cv' | 'lsv' | 'gcd' | 'eis' | 'unknown';

/** Quick check if text looks like CorrWare ASCII output. */
export function isCorrWareFile(text: string): boolean {
  if (!text) return false;
  // First non-empty line should be exactly "CORRW ASCII"
  const head = text.slice(0, 100);
  return /^CORRW\s+ASCII\b/i.test(head.trim());
}

/** Extract experiment subtype from CorrWare header (line 3). */
export function detectCorrWareSubtype(text: string): CorrWareSubtype {
  // Line 3 typically: "  <ExperimentType>\t[params][config]\tFilename"
  const lines = text.split(/\r?\n/);
  // Look at first ~20 lines for experiment-type signature
  const head = lines.slice(0, 20).join('\n').toLowerCase();
  if (/cyclic\s*voltammog/i.test(head)) return 'cv';
  if (/linear\s*sweep|lsv\b/i.test(head)) return 'lsv';
  if (/galvanic\s*cycle|galvanostat/i.test(head)) return 'gcd';
  if (/impedance|nyquist|bode|\beis\b/i.test(head)) return 'eis';
  return 'unknown';
}

/** Format axes labels per subtype. */
function getAxesForSubtype(subtype: CorrWareSubtype): { xLabel: string; yLabel: string; xCol: 'E' | 'I' | 'T'; yCol: 'E' | 'I' | 'T' } {
  switch (subtype) {
    case 'gcd':
      // Galvanic charge-discharge: Y=Potential, X=Time
      return { xLabel: 'Time (s)', yLabel: 'Potential (V)', xCol: 'T', yCol: 'E' };
    case 'cv':
    case 'lsv':
    case 'eis':  // EIS in this format usually still has E/I — fallback to CV-like
    case 'unknown':
    default:
      // CV / LSV: Y=Current density, X=Potential
      return { xLabel: 'Potential (V)', yLabel: 'Current density (A/cm²)', xCol: 'E', yCol: 'I' };
  }
}

/**
 * Parse a CorrWare .cor file. Throws if format invalid.
 */
export function parseCorrWare(text: string): CorrWareResult & { _subtype: CorrWareSubtype } {
  const subtype = detectCorrWareSubtype(text);
  const axes = getAxesForSubtype(subtype);

  const lines = text.split(/\r?\n/);

  // Find "End Comments" marker — data starts on next line
  let dataStart = -1;
  let columnHeaderLine = '';
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === 'End Comments' || /^end\s+comments$/i.test(t)) {
      dataStart = i + 1;
      // Column header is usually 1-2 lines BEFORE "End Comments"
      // Look back up to 3 lines for the "E(Volts)\tI(...)\tT(...)" line
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const candidate = lines[j].trim();
        if (/E\s*\(\s*Volts/i.test(candidate) && /I\s*\(/i.test(candidate)) {
          columnHeaderLine = candidate;
          break;
        }
      }
      break;
    }
  }
  if (dataStart === -1) {
    throw new Error('File CorrWare khong tim thay marker "End Comments"');
  }

  // Parse meta into key-value pairs (best effort)
  const meta: Record<string, string> = {};
  for (let i = 0; i < dataStart; i++) {
    const line = lines[i];
    const m = line.match(/^\s*([A-Za-z #][A-Za-z0-9 #()'/\\-]*?):\s+(.+?)\s*$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      // Avoid overwriting Begin/End block markers
      if (key.startsWith('Begin ') || key.startsWith('End ')) continue;
      if (!meta[key]) meta[key] = val;
    }
  }
  meta._subtype = subtype;
  if (columnHeaderLine) meta._columnHeader = columnHeaderLine;

  // Determine column indices from header
  // Standard columns: E(Volts), I(A/cm2), T(Seconds) — usually in this order
  const headerCols = columnHeaderLine
    .split(/\t+/)
    .map(s => s.trim())
    .filter(Boolean);
  const colIdxOf = (target: 'E' | 'I' | 'T'): number => {
    for (let i = 0; i < headerCols.length; i++) {
      const h = headerCols[i].toUpperCase();
      if (target === 'E' && /^E\s*\(/i.test(h)) return i;
      if (target === 'I' && /^I\s*\(/i.test(h)) return i;
      if (target === 'T' && /^T\s*\(/i.test(h)) return i;
    }
    return -1;
  };
  let xColIdx = colIdxOf(axes.xCol);
  let yColIdx = colIdxOf(axes.yCol);
  // Fallbacks if header parsing failed
  if (xColIdx === -1 || yColIdx === -1) {
    // Standard CorrWare layout: 0=E, 1=I, 2=T
    const fallback = { E: 0, I: 1, T: 2 };
    xColIdx = fallback[axes.xCol];
    yColIdx = fallback[axes.yCol];
  }

  // Read data rows
  const x: number[] = [];
  const y: number[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    // Tab-separated. CorrWare uses scientific notation: -1.046052E+00
    const parts = raw.split(/\t+/).map(s => s.trim());
    if (parts.length < Math.max(xColIdx, yColIdx) + 1) continue;
    const vx = parseFloat(parts[xColIdx]);
    const vy = parseFloat(parts[yColIdx]);
    if (!isFinite(vx) || !isFinite(vy)) continue;
    x.push(vx);
    y.push(vy);
  }

  if (x.length < 2) {
    throw new Error(`File CorrWare khong doc duoc du lieu so (${x.length} diem)`);
  }

  // Use generic-looking headers list compatible with rest of pipeline.
  // headers are the actual column names from file (e.g. "E(Volts)", "I(A/cm2)").
  const headers = headerCols.length ? headerCols : ['E(Volts)', 'I(A/cm2)', 'T(Seconds)'];

  return {
    x, y,
    xLabel: axes.xLabel,
    yLabel: axes.yLabel,
    xIdx: xColIdx,
    yIdx: yColIdx,
    headers,
    matchedByHeuristic: true,
    _meta: meta,
    _subtype: subtype,
  };
}
