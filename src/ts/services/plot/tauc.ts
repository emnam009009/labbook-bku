// src/ts/services/plot/tauc.ts
// Tauc plot transform cho UV-Vis DRS / UV-Vis.
//
// Input: data tho (wavelength lambda in nm, reflectance R in % or absorbance)
// Output: data da transform { x: hv (eV), y: (F(R).hv)^(1/n) }
//
// Cong thuc:
//   F(R)   = (1 - R)^2 / (2R)        <- Kubelka-Munk (R la phan so 0-1)
//   E (eV) = 1240 / lambda(nm)
//   Y      = (F(R) . E)^(1/n)
//
// Y nghia n:
//   n = 1/2  -> direct allowed   -> Y = (F(R).hv)^2
//   n = 3/2  -> direct forbidden -> Y = (F(R).hv)^(2/3)
//   n = 2    -> indirect allowed -> Y = (F(R).hv)^(1/2)
//   n = 3    -> indirect forbidden -> Y = (F(R).hv)^(1/3)

interface TaucPreset {
  value: number;
  label: string;
  exponent: string;
}

interface TaucData {
  x: number[];
  y: number[];
}

interface TaucResult {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  n: number;
  mode: string;
}

export const TAUC_PRESETS: TaucPreset[] = [
  { value: 0.5, label: 'n = 1/2 — Direct allowed', exponent: '²' },
  { value: 1.5, label: 'n = 3/2 — Direct forbidden', exponent: '^(2/3)' },
  { value: 2,   label: 'n = 2 — Indirect allowed', exponent: '^(1/2)' },
  { value: 3,   label: 'n = 3 — Indirect forbidden', exponent: '^(1/3)' },
];

/**
 * Transform reflectance/absorbance data -> Tauc plot.
 */
export function transformToTauc(data: TaucData, n: number, mode: string = 'reflectance'): TaucResult {
  const { x: lambda, y: yRaw } = data;
  if (!lambda || !yRaw || lambda.length !== yRaw.length) {
    throw new Error('Du lieu khong hop le');
  }

  const exp = 1 / n;
  const X: number[] = [];
  const Y: number[] = [];

  for (let i = 0; i < lambda.length; i++) {
    const lam = lambda[i];
    const yv = yRaw[i];
    if (!isFinite(lam) || !isFinite(yv) || lam <= 0) continue;

    // 1) Photon energy
    const E = 1240 / lam;

    // 2) F(R) hoac alpha
    let alpha: number;
    if (mode === 'reflectance') {
      // R co the dang la % (0-100) hoac fraction (0-1). Convert neu can.
      let R = yv;
      if (R > 1.5) R = R / 100; // % -> fraction
      if (R <= 0 || R >= 1) continue; // skip invalid points
      alpha = ((1 - R) ** 2) / (2 * R);
    } else {
      // Absorbance mode: alpha ~= A (don gian hoa, du cho Tauc plot estimate Eg)
      alpha = yv;
      if (alpha <= 0) continue;
    }

    // 3) Tauc Y
    const tauc = Math.pow(alpha * E, exp);
    if (!isFinite(tauc)) continue;

    X.push(E);
    Y.push(tauc);
  }

  // Sort by X ascending (Tauc plot luon di tu E thap -> cao)
  const sorted = X.map((xv, i) => ({ x: xv, y: Y[i] }))
                   .sort((a, b) => a.x - b.x);

  // Find label cho preset, fallback neu n custom
  const preset = TAUC_PRESETS.find(p => Math.abs(p.value - n) < 1e-9);
  const expLabel = preset?.exponent || `^(1/${n})`;
  const fr = mode === 'reflectance' ? 'F(R)' : 'α';

  return {
    x: sorted.map(p => p.x),
    y: sorted.map(p => p.y),
    xLabel: 'Energy (eV)',
    yLabel: `(${fr}·hν)${expLabel}`,
    n,
    mode,
  };
}

/**
 * Format n hien thi (0.5 -> "1/2", 1.5 -> "3/2", etc.)
 */
export function formatN(n: number): string {
  const map: Record<number, string> = { 0.5: '1/2', 1.5: '3/2' };
  return map[n] || String(n);
}
