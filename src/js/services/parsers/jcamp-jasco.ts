// src/js/services/parsers/jcamp-jasco.ts
// Parser cho JCAMP-DX format (JASCO UV-Vis spectrometer output).
//
// Cau truc file:
//   TITLE\t<value>
//   DATA TYPE\tULTRAVIOLET SPECTRUM
//   ...
//   XUNITS\tNANOMETERS
//   YUNITS\tABSORBANCE | REFLECTANCE | ...
//   NPOINTS\t<n>
//   DELTAX\t<-1 | 1>
//   XYDATA
//   <x1>\t<y1>
//   <x2>\t<y2>
//   ...
//   [footer metadata: Light source, Filter exchange, ...]
//
// Detect: file bat dau bang "TITLE\t" hoac chua "XYDATA" marker.

interface JcampResult {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  xIdx: number;
  yIdx: number;
  headers: string[];
  matchedByHeuristic: boolean;
  _jcamp: boolean;
  _meta: Record<string, string>;
}

/**
 * Quick check if text content looks like JCAMP-DX format.
 */
export function isJcampJasco(text: string): boolean {
  if (!text) return false;
  const head = text.slice(0, 200);
  // Must have TITLE at start AND XYDATA marker somewhere
  return /^TITLE\b/i.test(head) && /\bXYDATA\b/i.test(text);
}

/**
 * Parse JCAMP-DX text. Returns the same shape as parseFileWithSpec result.
 */
export function parseJcampJasco(text: string): JcampResult {
  // Normalize line endings
  const lines = text.split(/\r?\n/);

  // Parse header until XYDATA
  const meta: Record<string, string> = {};
  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^XYDATA\s*$/i.test(line)) {
      dataStart = i + 1;
      break;
    }
    // Header lines: KEY\tVALUE  (or KEY  VALUE with spaces)
    const m = line.match(/^([A-Z][A-Z0-9 ./_-]*?)\s*\t\s*(.*)$/);
    if (m) {
      meta[m[1].trim().toUpperCase()] = m[2].trim();
    }
  }
  if (dataStart === -1) {
    throw new Error('Khong tim thay marker XYDATA trong file JCAMP-DX');
  }

  // Parse data rows until non-numeric line (footer starts)
  const x: number[] = [];
  const y: number[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/[\s\t,;]+/);
    if (parts.length < 2) {
      // Could be footer line — stop
      break;
    }
    const xv = parseFloat(parts[0]);
    const yv = parseFloat(parts[1]);
    if (isNaN(xv) || isNaN(yv)) {
      // Reached footer
      break;
    }
    x.push(xv);
    y.push(yv);
  }

  if (x.length < 2) {
    throw new Error('JCAMP-DX: khong doc duoc du lieu so');
  }

  // Determine labels from metadata
  const xunits = (meta.XUNITS || '').toUpperCase();
  const yunits = (meta.YUNITS || '').toUpperCase();
  let xLabel = 'X';
  let yLabel = 'Y';
  if (/NANOMETER|NM/i.test(xunits)) xLabel = 'Wavelength (nm)';
  else if (xunits) xLabel = xunits.toLowerCase();

  if (yunits.includes('ABSORB')) yLabel = 'Absorbance (a.u.)';
  else if (yunits.includes('REFLECT')) yLabel = 'Reflectance (%)';
  else if (yunits.includes('TRANSMIT')) yLabel = 'Transmittance (%)';
  else if (yunits) yLabel = yunits.toLowerCase();

  // If DELTAX < 0, data is descending — reverse so the plot reads left-to-right
  const deltaX = parseFloat(meta.DELTAX);
  if (!isNaN(deltaX) && deltaX < 0) {
    x.reverse();
    y.reverse();
  } else if (x.length >= 2 && x[0] > x[x.length - 1]) {
    x.reverse();
    y.reverse();
  }

  return {
    x, y,
    xLabel, yLabel,
    xIdx: 0, yIdx: 1,
    headers: [xLabel, yLabel],
    matchedByHeuristic: true,
    _jcamp: true,
    _meta: meta,
  };
}
