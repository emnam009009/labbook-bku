// src/js/services/parsers/detect.ts
// Auto-detect loai phep phan tich tu file upload (XRD/Raman/FTIR/UV-Vis/PL/SEM/TEM).
//
// Layered detection — chay theo thu tu, dung khi tim duoc match dang tin:
//   Layer 1: Extension dac biet (HIGH)
//   Layer 2: Filename keyword (MEDIUM)
//   Layer 3: Content sniffing (HIGH cho text files)
//   Layer 4: Numeric range heuristic (MEDIUM)

import { readFileAsText, parseDelimited } from './parser-core.js';
import { isJcampJasco } from './jcamp-jasco.js';

export type DetectedCategory =
  | 'xrd' | 'raman' | 'ftir' | 'uvvis' | 'uvvis-drs' | 'pl'
  | 'sem' | 'tem' | 'other';

export type DetectConfidence = 'high' | 'medium' | 'low' | 'none';

export interface DetectResult {
  category: DetectedCategory;
  confidence: DetectConfidence;
  reason: string;  // Human-readable explanation, e.g. "extension .xrdml"
}

// ════════════════════════════════════════════════════════════
// Layer 1: Extension-based detection (high confidence)
// ════════════════════════════════════════════════════════════
function detectByExtension(filename: string): DetectResult | null {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const map: Record<string, DetectedCategory> = {
    // XRD instrument files
    'xrdml': 'xrd',
    'ras':   'xrd',
    'raw':   'xrd',  // Bruker RAW
    // FTIR
    'dpt':   'ftir',
    'spa':   'ftir',  // Thermo Scientific SPA
    // TEM
    'dm3':   'tem',
    'dm4':   'tem',
  };
  if (map[ext]) {
    return { category: map[ext], confidence: 'high', reason: `extension .${ext}` };
  }
  return null;
}

// ════════════════════════════════════════════════════════════
// Layer 2: Filename keyword detection (medium confidence)
// ════════════════════════════════════════════════════════════
function detectByFilename(filename: string): DetectResult | null {
  const lower = filename.toLowerCase();
  // Order matters: more specific patterns first.
  // Use (?:[^a-z]|$|^) instead of \b — \b treats _ as word char, so
  // "raman_test" wouldn't match \braman\b. Custom boundary handles _ as separator.
  const patterns: Array<[RegExp, DetectedCategory]> = [
    [/(?:^|[^a-z])(uvvis-?drs|drs)(?:[^a-z]|$)/i,         'uvvis-drs'],
    [/(?:^|[^a-z])(uv-?vis|uv_?vis|uvvis)(?:[^a-z]|$)/i,  'uvvis'],
    [/(?:^|[^a-z])(xrd)(?:[^a-z]|$)/i,                    'xrd'],
    [/(?:^|[^a-z])(ftir|ft-?ir)(?:[^a-z]|$)/i,            'ftir'],
    [/(?:^|[^a-z])(raman)(?:[^a-z]|$)/i,                  'raman'],
    [/(?:^|[^a-z])(pl|photoluminescence|emission-?spectrum)(?:[^a-z]|$)/i, 'pl'],
    [/(?:^|[^a-z])(sem)(?:[^a-z]|$)/i,                    'sem'],
    [/(?:^|[^a-z])(tem)(?:[^a-z]|$)/i,                    'tem'],
    [/(?:^|[^a-z])(infrared|infra-?red)(?:[^a-z]|$)/i,    'ftir'],
  ];
  for (const [re, cat] of patterns) {
    const m = lower.match(re);
    if (m) {
      return { category: cat, confidence: 'medium', reason: `filename match "${m[1]}"` };
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════
// Layer 3a: JCAMP-DX content detection (high confidence)
// ════════════════════════════════════════════════════════════
function detectFromJcamp(text: string): DetectResult | null {
  const head = text.slice(0, 2000);
  const xMatch = head.match(/##XUNITS\s*=\s*([^\r\n]+)/i);
  const yMatch = head.match(/##YUNITS\s*=\s*([^\r\n]+)/i);
  const dataTypeMatch = head.match(/##DATA\s*TYPE\s*=\s*([^\r\n]+)/i);
  if (!xMatch && !yMatch && !dataTypeMatch) return null;

  const xUnits = (xMatch?.[1] || '').trim().toUpperCase();
  const yUnits = (yMatch?.[1] || '').trim().toUpperCase();
  const dataType = (dataTypeMatch?.[1] || '').trim().toUpperCase();

  // DATA TYPE-based hints (most reliable)
  if (dataType.includes('RAMAN'))                   return { category: 'raman',     confidence: 'high', reason: 'JCAMP DATA TYPE = Raman' };
  if (dataType.includes('INFRARED') || dataType.includes('IR'))  return { category: 'ftir',      confidence: 'high', reason: 'JCAMP DATA TYPE = IR' };
  if (dataType.includes('UV') || dataType.includes('VIS'))       return { category: 'uvvis',     confidence: 'high', reason: 'JCAMP DATA TYPE = UV-Vis' };
  if (dataType.includes('FLUORESCENCE') || dataType.includes('PHOTOLUMIN')) return { category: 'pl',  confidence: 'high', reason: 'JCAMP DATA TYPE = PL' };
  if (dataType.includes('XRD') || dataType.includes('X-RAY DIFFRACT'))      return { category: 'xrd', confidence: 'high', reason: 'JCAMP DATA TYPE = XRD' };

  // X+Y units combination
  const isWavenumber = xUnits.includes('1/CM') || xUnits.includes('CM-1') || xUnits === 'WAVENUMBERS';
  const isNanometer  = xUnits.includes('NANOMETER') || xUnits === 'NM';
  const isDegree     = xUnits.includes('DEGREE') || xUnits.includes('2-THETA');

  if (isDegree)                                       return { category: 'xrd',       confidence: 'high', reason: 'JCAMP XUNITS = degrees' };
  if (isWavenumber && yUnits.includes('TRANSMIT'))    return { category: 'ftir',      confidence: 'high', reason: 'JCAMP XUNITS=cm⁻¹ + YUNITS=Transmittance' };
  if (isWavenumber && yUnits.includes('ABSORB'))      return { category: 'ftir',      confidence: 'high', reason: 'JCAMP XUNITS=cm⁻¹ + YUNITS=Absorbance' };
  if (isWavenumber && yUnits.includes('INTENSIT'))    return { category: 'raman',     confidence: 'high', reason: 'JCAMP XUNITS=cm⁻¹ + YUNITS=Intensity (Raman)' };
  if (isNanometer && yUnits.includes('REFLECT'))      return { category: 'uvvis-drs', confidence: 'high', reason: 'JCAMP XUNITS=nm + YUNITS=Reflectance' };
  if (isNanometer && yUnits.includes('ABSORB'))       return { category: 'uvvis',     confidence: 'high', reason: 'JCAMP XUNITS=nm + YUNITS=Absorbance' };
  if (isNanometer && yUnits.includes('TRANSMIT'))     return { category: 'uvvis',     confidence: 'high', reason: 'JCAMP XUNITS=nm + YUNITS=Transmittance' };
  if (isNanometer && (yUnits.includes('INTENSIT') || yUnits.includes('PL') || yUnits.includes('EMISS')))
                                                       return { category: 'pl',        confidence: 'high', reason: 'JCAMP XUNITS=nm + YUNITS=Intensity/PL' };

  return null;
}

// ════════════════════════════════════════════════════════════
// Layer 3b: CSV/TSV header keyword detection (high confidence)
// ════════════════════════════════════════════════════════════
function detectFromHeaders(headers: string[]): DetectResult | null {
  const joined = headers.join(' | ').toLowerCase();
  // 2-theta -> XRD (very strong)
  if (/\b2\s*[-]?\s*theta\b|2[θθ]/i.test(joined)) return { category: 'xrd', confidence: 'high', reason: 'header "2-theta"' };
  if (/\braman\s+shift\b/i.test(joined))           return { category: 'raman', confidence: 'high', reason: 'header "Raman shift"' };

  // Wavenumber + Transmit/Absorb -> FTIR
  const hasWavenumber = /\b(wavenumber|cm\s*[-⁻]\s*1|cm⁻¹)\b/i.test(joined);
  const hasNm = /\b(wavelength|nm|nanomet)\b/i.test(joined);
  const hasReflect = /\breflect/i.test(joined);
  const hasAbsorb = /\b(absorb|abs\.?)\b/i.test(joined);
  const hasTransmit = /\btransmit|%\s*t\b/i.test(joined);
  const hasIntensity = /\b(intensit|count|cps|pl\s*intensity|emission)\b/i.test(joined);

  if (hasWavenumber && (hasTransmit || hasAbsorb))   return { category: 'ftir', confidence: 'high', reason: 'header wavenumber+transmit/abs' };
  if (hasWavenumber && hasIntensity)                  return { category: 'raman', confidence: 'high', reason: 'header wavenumber+intensity' };
  if (hasNm && hasReflect)                            return { category: 'uvvis-drs', confidence: 'high', reason: 'header wavelength+reflectance' };
  if (hasNm && hasIntensity)                          return { category: 'pl', confidence: 'high', reason: 'header wavelength+intensity' };
  if (hasNm && (hasAbsorb || hasTransmit))            return { category: 'uvvis', confidence: 'high', reason: 'header wavelength+abs/transmit' };

  return null;
}

// ════════════════════════════════════════════════════════════
// Layer 4: Numeric range heuristic (medium confidence)
// ════════════════════════════════════════════════════════════
function detectFromXRange(rows: string[][], xIdx: number = 0): DetectResult | null {
  const xs: number[] = [];
  for (const r of rows) {
    const v = parseFloat(String(r[xIdx] ?? '').replace(',', '.'));
    if (!isNaN(v) && isFinite(v)) xs.push(v);
    if (xs.length >= 50) break;  // Sample first 50 numeric points is enough
  }
  if (xs.length < 5) return null;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const span = maxX - minX;
  const isDescending = xs[0] > xs[xs.length - 1];

  // XRD: degrees, typically 5-90 with span > 10
  if (minX >= 2 && maxX <= 130 && span > 10 && span < 130) {
    return { category: 'xrd', confidence: 'medium', reason: `X range [${minX.toFixed(1)}, ${maxX.toFixed(1)}] (degrees-like)` };
  }
  // FTIR: cm-1, typically 400-4000, often DESCENDING
  if (minX >= 100 && maxX <= 5000 && span > 500 && isDescending) {
    return { category: 'ftir', confidence: 'medium', reason: `X range [${minX.toFixed(0)}, ${maxX.toFixed(0)}] cm⁻¹ descending (FTIR-like)` };
  }
  // Raman: cm-1, typically 100-3500, ASCENDING
  if (minX >= 0 && minX < 200 && maxX > 800 && maxX <= 4000 && !isDescending) {
    return { category: 'raman', confidence: 'medium', reason: `X range [${minX.toFixed(0)}, ${maxX.toFixed(0)}] cm⁻¹ ascending (Raman-like)` };
  }
  // UV-Vis: nm, 200-800
  if (minX >= 180 && maxX <= 1100 && span > 100) {
    return { category: 'uvvis', confidence: 'medium', reason: `X range [${minX.toFixed(0)}, ${maxX.toFixed(0)}] nm (UV-Vis-like)` };
  }
  return null;
}

// ════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════

/**
 * Detect category from file. Runs 4 detection layers, returns first hit.
 * Falls back to { category: 'other', confidence: 'none' } if nothing matches.
 */
export async function detectCategory(file: File): Promise<DetectResult> {
  const filename = file.name || '';

  // Layer 1: extension (high confidence)
  const ext = detectByExtension(filename);
  if (ext) return ext;

  // For images, just use filename keyword (no content to sniff)
  const isImage = file.type.startsWith('image/') ||
    /\.(png|jpg|jpeg|gif|webp|bmp|tif|tiff)$/i.test(filename);

  // Layer 2: filename keyword
  const byName = detectByFilename(filename);
  if (isImage) {
    // For images, filename match is the best we can do (Layer 3/4 not applicable).
    // If no match, default to 'other' (Sem/Tem could be either; only filename hints it).
    return byName || { category: 'other', confidence: 'none', reason: 'image with no filename hint' };
  }

  // For text files: try Layer 3 (content) before Layer 2 (more reliable)
  const ext2 = (filename.split('.').pop() || '').toLowerCase();
  const isTextLike = ['txt', 'csv', 'tsv', 'dat', 'xy', 'asc', 'dpt'].includes(ext2);
  if (isTextLike) {
    try {
      const text = await readFileAsText(file);

      // Layer 3a: JCAMP-DX
      if (isJcampJasco(text) || /^##/m.test(text.slice(0, 200))) {
        const jcamp = detectFromJcamp(text);
        if (jcamp) return jcamp;
      }

      // Layer 3b: header keywords
      const parsed = parseDelimited(text);
      if (parsed.headers && parsed.headers.length >= 2) {
        const byHeader = detectFromHeaders(parsed.headers);
        if (byHeader) return byHeader;
      }

      // Filename hint takes precedence over numeric range guess
      if (byName) return byName;

      // Layer 4: X range heuristic
      if (parsed.rows && parsed.rows.length >= 5) {
        const byRange = detectFromXRange(parsed.rows);
        if (byRange) return byRange;
      }
    } catch (e: any) {
      // File read failed — fall through to filename hint or 'other'
      console.warn('[detectCategory] content read failed:', e.message);
    }
  }

  // Fallback to filename hint, then 'other'
  if (byName) return byName;
  return { category: 'other', confidence: 'none', reason: 'no signal matched' };
}

/**
 * Human-friendly toast message for detection result.
 */
export function detectionToastMessage(
  result: DetectResult,
  categoryLabel: string
): { msg: string; type: 'success' | 'info' | 'warn' } {
  if (result.confidence === 'high') {
    return {
      msg: `Tự nhận diện: ${categoryLabel}`,
      type: 'success',
    };
  }
  if (result.confidence === 'medium') {
    return {
      msg: `Đoán: ${categoryLabel} — đổi nếu sai`,
      type: 'info',
    };
  }
  if (result.confidence === 'low') {
    return {
      msg: `Không chắc — chọn: ${categoryLabel}. Sửa nếu sai.`,
      type: 'warn',
    };
  }
  return {
    msg: 'Không nhận diện được loại — chọn trong dropdown',
    type: 'warn',
  };
}
