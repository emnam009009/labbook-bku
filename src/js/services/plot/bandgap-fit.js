// src/js/services/plot/bandgap-fit.js
// Auto-fit bandgap (Eg) từ Tauc plot bằng linear extrapolation.
//
// Thuật toán:
//   1. Smooth Y bằng moving average (window 5)
//   2. Tính dY/dX → tìm điểm có slope dương lớn nhất (= "knee point")
//   3. Lấy window ~25 điểm quanh đó (vùng tuyến tính)
//   4. Linear regression → m, b
//   5. Eg = -b/m
//   6. Trả về { Eg, slope, intercept, fitStart, fitEnd } để vẽ extrapolation

const SMOOTH_WINDOW = 5;
const FIT_WINDOW = 25;

/**
 * Moving average smoothing.
 */
function smooth(y, w) {
  const half = Math.floor(w / 2);
  const out = new Array(y.length);
  for (let i = 0; i < y.length; i++) {
    let sum = 0, count = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(y.length - 1, i + half); k++) {
      sum += y[k];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

/**
 * Numerical derivative dY/dX.
 */
function derivative(x, y) {
  const dy = new Array(x.length);
  for (let i = 1; i < x.length - 1; i++) {
    dy[i] = (y[i + 1] - y[i - 1]) / (x[i + 1] - x[i - 1]);
  }
  dy[0] = dy[1] || 0;
  dy[dy.length - 1] = dy[dy.length - 2] || 0;
  return dy;
}

/**
 * Linear regression on points (x[i0..i1], y[i0..i1]).
 * Returns { slope, intercept, r2 }.
 */
function linearRegression(x, y, i0, i1) {
  const n = i1 - i0 + 1;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (let i = i0; i <= i1; i++) {
    sx += x[i];
    sy += y[i];
    sxy += x[i] * y[i];
    sxx += x[i] * x[i];
    syy += y[i] * y[i];
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  // R² for confidence
  const meanY = sy / n;
  let ssRes = 0, ssTot = 0;
  for (let i = i0; i <= i1; i++) {
    const yp = slope * x[i] + intercept;
    ssRes += (y[i] - yp) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

/**
 * Auto-fit bandgap from Tauc plot data.
 * @param {number[]} x - photon energy (eV), ascending
 * @param {number[]} y - Tauc Y values
 * @returns {object} { Eg, slope, intercept, r2, fitStart, fitEnd, peakIdx } or null on failure
 */
export function autoFitBandgap(x, y) {
  if (!x || !y || x.length < FIT_WINDOW * 2) {
    return null;
  }

  // 1. Smooth
  const yS = smooth(y, SMOOTH_WINDOW);

  // 2. Derivative
  const dy = derivative(x, yS);

  // 3. Find peak of derivative (excluding edges)
  let peakIdx = -1;
  let peakVal = -Infinity;
  const margin = Math.floor(FIT_WINDOW / 2);
  for (let i = margin; i < dy.length - margin; i++) {
    if (dy[i] > peakVal) {
      peakVal = dy[i];
      peakIdx = i;
    }
  }
  if (peakIdx === -1 || peakVal <= 0) return null;

  // 4. Fit window centered on peak
  const i0 = Math.max(0, peakIdx - Math.floor(FIT_WINDOW / 2));
  const i1 = Math.min(x.length - 1, peakIdx + Math.floor(FIT_WINDOW / 2));

  // 5. Linear regression
  const { slope, intercept, r2 } = linearRegression(x, yS, i0, i1);
  if (slope <= 0) return null;

  // 6. Eg = -b/m
  const Eg = -intercept / slope;

  // Sanity check: Eg should be in reasonable range (0 - 10 eV typically)
  if (!isFinite(Eg) || Eg < 0 || Eg > 10) return null;

  return {
    Eg,
    slope,
    intercept,
    r2,
    fitStart: x[i0],
    fitEnd: x[i1],
    peakIdx,
    peakX: x[peakIdx],
  };
}

/**
 * Fit using user-selected x range.
 */
export function fitBandgapInRange(x, y, xMin, xMax) {
  if (!x || !y) return null;
  let i0 = -1, i1 = -1;
  for (let i = 0; i < x.length; i++) {
    if (i0 === -1 && x[i] >= xMin) i0 = i;
    if (x[i] <= xMax) i1 = i;
  }
  if (i0 === -1 || i1 === -1 || i1 - i0 < 5) return null;

  const { slope, intercept, r2 } = linearRegression(x, y, i0, i1);
  if (slope <= 0) return null;
  const Eg = -intercept / slope;
  if (!isFinite(Eg) || Eg < 0 || Eg > 10) return null;

  return {
    Eg, slope, intercept, r2,
    fitStart: x[i0], fitEnd: x[i1],
    peakX: (x[i0] + x[i1]) / 2,
  };
}
