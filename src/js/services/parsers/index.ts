// src/js/services/parsers/index.ts
// Dispatcher: chon spec theo category.

import { parseFileWithSpec, readFileAsText, readExcelAsRows, parseDelimited } from './parser-core.js';
import { isJcampJasco, parseJcampJasco } from './jcamp-jasco.js';

export interface ParserSpec {
  xKeywords: string[];
  yKeywords: string[];
  xLabel: string;
  yLabel: string;
  chartType: string;
  reverseX?: boolean;
  [k: string]: unknown;
}

export interface ParseResult {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  xIdx: number;
  yIdx: number;
  headers: string[];
  matchedByHeuristic: boolean;
  category?: string;
  spec?: ParserSpec;
  plotXLabel?: string;
  plotYLabel?: string;
  _jcamp?: boolean;
  _meta?: Record<string, string>;
}

export const PARSER_SPECS: Readonly<Record<string, ParserSpec>> = Object.freeze({
  xrd: {
    xKeywords: ['2theta', '2-theta', '2 theta', '2θ', 'angle', 'position', 'theta'],
    yKeywords: ['intensity', 'count', 'cps', 'int.', 'i'],
    xLabel: '2-Theta (degree)',
    yLabel: 'Intensity (a.u.)',
    chartType: 'line',
  },
  raman: {
    xKeywords: ['raman shift', 'shift', 'wavenumber', 'cm-1', 'cm⁻¹', 'raman'],
    yKeywords: ['intensity', 'count', 'cps'],
    xLabel: 'Raman shift (cm⁻¹)',
    yLabel: 'Intensity (a.u.)',
    chartType: 'line',
  },
  ftir: {
    xKeywords: ['wavenumber', 'cm-1', 'cm⁻¹'],
    yKeywords: ['transmittance', '%t', 't%', 'absorbance', 'abs'],
    xLabel: 'Wavenumber (cm⁻¹)',
    yLabel: 'Transmittance (%)',
    chartType: 'line',
    reverseX: true, // FTIR convention: X axis decreasing
  },
  uvvis: {
    xKeywords: ['wavelength', 'nm', 'lambda', 'λ'],
    yKeywords: ['absorbance', 'abs', 'transmittance', '%t'],
    xLabel: 'Wavelength (nm)',
    yLabel: 'Absorbance (a.u.)',
    chartType: 'line',
  },
  'uvvis-drs': {
    xKeywords: ['wavelength', 'nm', 'lambda', 'energy', 'ev'],
    yKeywords: ['reflectance', 'r%', '%r', 'f(r)', 'kubelka', 'absorbance'],
    xLabel: 'Wavelength (nm)',
    yLabel: 'Reflectance (%)',
    chartType: 'line',
  },
  pl: {
    xKeywords: ['wavelength', 'nm', 'lambda', 'λ'],
    yKeywords: ['intensity', 'count', 'pl'],
    xLabel: 'Wavelength (nm)',
    yLabel: 'PL Intensity (a.u.)',
    chartType: 'line',
  },
});

export function getSpec(category: string): ParserSpec | null {
  return PARSER_SPECS[category] || null;
}

/**
 * Check if category supports auto-plot.
 */
export function canAutoPlot(category: string): boolean {
  return category in PARSER_SPECS;
}

/**
 * Check if file extension is parseable as text/excel data.
 */
export function isParseableFile(file: File): boolean {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ['txt', 'csv', 'tsv', 'dat', 'xy', 'xlsx', 'xls', 'xlsm', 'asc', 'dpt'].includes(ext);
}

/**
 * Parse file according to category spec.
 * Returns enriched result with spec info attached.
 */
export async function parseDataFile(file: File, category: string): Promise<ParseResult> {
  const spec = getSpec(category);
  if (!spec) throw new Error(`Khong ho tro auto-plot cho loai: ${category}`);

  // Try JCAMP-DX format first (JASCO UV-Vis output) for txt files in UV/PL categories
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const maybeJcamp = ext === 'txt' && (
    category === 'uvvis' || category === 'uvvis-drs' || category === 'pl'
  );
  if (maybeJcamp) {
    try {
      const text = await readFileAsText(file);
      if (isJcampJasco(text)) {
        const r = parseJcampJasco(text);
        return {
          ...r,
          category, spec,
          plotXLabel: r.xLabel || spec.xLabel,
          plotYLabel: r.yLabel || spec.yLabel,
        };
      }
    } catch (e: any) {
      // Fall through to generic parser
      console.warn('[parser] JCAMP detection failed, fallback:', e.message);
    }
  }

  const result = await parseFileWithSpec(file, spec);
  return {
    ...result,
    category,
    spec,
    plotXLabel: spec.xLabel,
    plotYLabel: spec.yLabel,
  };
}

/**
 * Re-parse already-loaded data with manually selected columns.
 * Used when heuristic gets it wrong and user picks columns from dropdown.
 */
export async function reparseWithColumns(
  file: File,
  category: string,
  xIdx: number,
  yIdx: number
): Promise<ParseResult> {
  const spec = getSpec(category);
  if (!spec) throw new Error(`Khong ho tro: ${category}`);

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isExcel = ['xlsx', 'xls', 'xlsm'].includes(ext);

  let parsed: { headers: string[]; rows: string[][] };
  if (isExcel) {
    parsed = await readExcelAsRows(file);
  } else {
    const text = await readFileAsText(file);
    parsed = parseDelimited(text);
  }
  const { headers, rows } = parsed;
  const x: number[] = [];
  const y: number[] = [];
  for (const r of rows) {
    const vx = parseFloat(String(r[xIdx] ?? '').replace(',', '.'));
    const vy = parseFloat(String(r[yIdx] ?? '').replace(',', '.'));
    if (isNaN(vx) || isNaN(vy)) continue;
    x.push(vx); y.push(vy);
  }
  if (x.length < 2) throw new Error('Cot da chon khong co du lieu so');

  return {
    x, y,
    xLabel: headers[xIdx] || 'X',
    yLabel: headers[yIdx] || 'Y',
    xIdx, yIdx,
    headers,
    matchedByHeuristic: false,
    category, spec,
    plotXLabel: spec.xLabel,
    plotYLabel: spec.yLabel,
  };
}
