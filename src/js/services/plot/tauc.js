// src/js/services/plot/tauc.js
// Tauc plot transform cho UV-Vis DRS / UV-Vis.
//
// Input: data thô (wavelength λ in nm, reflectance R in % or absorbance)
// Output: data đã transform { x: hν (eV), y: (F(R)·hν)^(1/n) }
//
// Công thức:
//   F(R)   = (1 - R)² / (2R)        ← Kubelka-Munk (R là phân số 0-1)
//   E (eV) = 1240 / λ(nm)
//   Y      = (F(R) · E)^(1/n)
//
// Ý nghĩa n:
//   n = 1/2  → direct allowed   → Y = (F(R)·hν)²
//   n = 3/2  → direct forbidden → Y = (F(R)·hν)^(2/3)
//   n = 2    → indirect allowed → Y = (F(R)·hν)^(1/2)
//   n = 3    → indirect forbidden → Y = (F(R)·hν)^(1/3)

export const TAUC_PRESETS = [
  { value: 0.5, label: 'n = 1/2 — Direct allowed', exponent: '²' },
  { value: 1.5, label: 'n = 3/2 — Direct forbidden', exponent: '^(2/3)' },
  { value: 2,   label: 'n = 2 — Indirect allowed', exponent: '^(1/2)' },
  { value: 3,   label: 'n = 3 — Indirect forbidden', exponent: '^(1/3)' },
];

/**
 * Transform reflectance/absorbance data → Tauc plot.
 * @param {object} data - { x: λ(nm)[], y: R(%) or absorbance[] }
 * @param {number} n - exponent (0.5, 1.5, 2, 3, hoặc custom)
 * @param {string} mode - 'reflectance' | 'absorbance'
 * @returns {object} { x: hν(eV)[], y: Tauc-Y[], xLabel, yLabel }
 */
export function transformToTauc(data, n, mode = 'reflectance') {
  const { x: lambda, y: yRaw } = data;
  if (!lambda || !yRaw || lambda.length !== yRaw.length) {
    throw new Error('Dữ liệu không hợp lệ');
  }

  const exp = 1 / n;
  const X = [];
  const Y = [];

  for (let i = 0; i < lambda.length; i++) {
    const lam = lambda[i];
    const yv = yRaw[i];
    if (!isFinite(lam) || !isFinite(yv) || lam <= 0) continue;

    // 1) Photon energy
    const E = 1240 / lam;

    // 2) F(R) hoặc α
    let alpha;
    if (mode === 'reflectance') {
      // R có thể đang là % (0-100) hoặc fraction (0-1). Convert nếu cần.
      let R = yv;
      if (R > 1.5) R = R / 100; // % → fraction
      if (R <= 0 || R >= 1) continue; // skip invalid points
      alpha = ((1 - R) ** 2) / (2 * R);
    } else {
      // Absorbance mode: α ≈ A (đơn giản hóa, đủ cho Tauc plot estimate Eg)
      alpha = yv;
      if (alpha <= 0) continue;
    }

    // 3) Tauc Y
    const tauc = Math.pow(alpha * E, exp);
    if (!isFinite(tauc)) continue;

    X.push(E);
    Y.push(tauc);
  }

  // Sort by X ascending (Tauc plot luôn đi từ E thấp → cao)
  const sorted = X.map((xv, i) => ({ x: xv, y: Y[i] }))
                   .sort((a, b) => a.x - b.x);

  // Find label cho preset, fallback nếu n custom
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
 * Format n hiển thị (0.5 → "1/2", 1.5 → "3/2", etc.)
 */
export function formatN(n) {
  const map = { 0.5: '1/2', 1.5: '3/2' };
  return map[n] || String(n);
}
