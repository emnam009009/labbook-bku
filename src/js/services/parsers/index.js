// src/js/services/parsers/index.js
// Dispatcher: chọn spec theo category.

import { parseFileWithSpec } from './parser-core.js';
import { isJcampJasco, parseJcampJasco } from './jcamp-jasco.js';
import { readFileAsText } from './parser-core.js';

export const PARSER_SPECS = Object.freeze({
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

export function getSpec(category) {
  return PARSER_SPECS[category] || null;
}

/**
 * Check if category supports auto-plot.
 */
export function canAutoPlot(category) {
  return category in PARSER_SPECS;
}

/**
 * Check if file extension is parseable as text/excel data.
 */
export function isParseableFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ['txt', 'csv', 'tsv', 'dat', 'xy', 'xlsx', 'xls', 'xlsm', 'asc', 'dpt'].includes(ext);
}

/**
 * Parse file according to category spec.
 * Returns enriched result with spec info attached.
 */
export async function parseDataFile(file, category) {
  const spec = getSpec(category);
  if (!spec) throw new Error(`Không hỗ trợ auto-plot cho loại: ${category}`);

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
    } catch (e) {
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
 * @param {object} parsed - previous parseDataFile result (must include `headers` and raw rows)
 * @param {File} file - same file
 * @param {number} xIdx
 * @param {number} yIdx
 */
export async function reparseWithColumns(file, category, xIdx, yIdx) {
  const spec = getSpec(category);
  if (!spec) throw new Error(`Không hỗ trợ: ${category}`);

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isExcel = ['xlsx', 'xls', 'xlsm'].includes(ext);

  const { readFileAsText, readExcelAsRows, parseDelimited } = await import('./parser-core.js');
  let parsed;
  if (isExcel) {
    parsed = await readExcelAsRows(file);
  } else {
    const text = await readFileAsText(file);
    parsed = parseDelimited(text);
  }
  const { headers, rows } = parsed;
  const x = [], y = [];
  for (const r of rows) {
    const vx = parseFloat(String(r[xIdx] ?? '').replace(',', '.'));
    const vy = parseFloat(String(r[yIdx] ?? '').replace(',', '.'));
    if (isNaN(vx) || isNaN(vy)) continue;
    x.push(vx); y.push(vy);
  }
  if (x.length < 2) throw new Error('Cột đã chọn không có dữ liệu số');

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

