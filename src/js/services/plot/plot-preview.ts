// src/js/services/plot/plot-preview.ts
// @ts-nocheck
// Render data preview chart using Chart.js. Designed for both:
//   - on-screen preview (small canvas)
//   - export PNG @ 300 DPI (offscreen high-res canvas)

let _chartLib = null;
async function loadChart() {
  if (_chartLib) return _chartLib;
  const mod = await import('chart.js/auto');
  _chartLib = mod.default || mod.Chart || mod;
  return _chartLib;
}

// ─── Helper: quyết định trục có start từ 0 hay không ────
function _axisStartFromZero(category, xLabel) {
  if (!category) {
    if (typeof xLabel === 'string' && /Energy/i.test(xLabel)) return true;
    return false;
  }
  return ['uvvis', 'uvvis-drs', 'pl'].includes(category);
}


/**
 * Build Chart.js config from parsed data.
 */
function buildChartConfig({ x, y, xLabel, yLabel, title, spec, bandgapFit, category, axisSettings }) {
  const points = x.map((xv, i) => ({ x: xv, y: y[i] }));

  const datasets = [{
    label: title || yLabel,
    data: points,
    borderColor: '#0d9488',
    backgroundColor: 'rgba(13, 148, 136, 0.08)',
    borderWidth: 1.5,
    pointRadius: 0,
    pointHoverRadius: 3,
    tension: 0,
    fill: false,
  }];

  // Overlay extrapolation line if bandgap fit provided
  if (bandgapFit && isFinite(bandgapFit.Eg)) {
    const { slope, intercept, Eg, fitStart, fitEnd } = bandgapFit;
    // Line from Eg to slightly past fitEnd
    const xLineStart = Eg;
    const xLineEnd = fitEnd + (fitEnd - fitStart) * 0.2;
    datasets.push({
      label: `Linear fit (Eg)`,
      data: [
        { x: xLineStart, y: 0 },
        { x: xLineEnd, y: slope * xLineEnd + intercept },
      ],
      borderColor: '#000000',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
      fill: false,
    });
  }

  return {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { display: false },
        title: {
          display: !!title,
          text: title,
          color: '#000000',
          font: { size: 22, weight: 'bold', family: 'Arial, sans-serif' },
        },
        tooltip: { enabled: true },
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: xLabel,
            color: '#000000',
            font: { size: 20, weight: 'bold', family: 'Arial, sans-serif' },
          },
          // axisSettings.x overrides; otherwise fall back to category-based default
          ...(axisSettings?.x?.min !== undefined && axisSettings?.x?.min !== null
            ? { min: axisSettings.x.min }
            : (_axisStartFromZero(category, xLabel) ? { min: 0 } : {})),
          ...(axisSettings?.x?.max !== undefined && axisSettings?.x?.max !== null
            ? { max: axisSettings.x.max }
            : {}),
          reverse: !!spec?.reverseX,
          grid: { display: false, drawTicks: true, tickLength: 8, tickWidth: 1.5, tickColor: '#000000' },
          border: { color: '#000000', width: 1.5 },
          ticks: {
            color: '#000000',
            font: { size: 18, weight: 'bold', family: 'Arial, sans-serif' },
            padding: 6,
            ...(axisSettings?.x?.stepMajor && axisSettings.x.stepMajor > 0
              ? { stepSize: axisSettings.x.stepMajor }
              : {}),
          },
        },
        y: {
          title: {
            display: true,
            text: yLabel,
            color: '#000000',
            font: { size: 20, weight: 'bold', family: 'Arial, sans-serif' },
          },
          ...(axisSettings?.y?.min !== undefined && axisSettings?.y?.min !== null
            ? { min: axisSettings.y.min }
            : (_axisStartFromZero(category, xLabel) ? { min: 0 } : {})),
          ...(axisSettings?.y?.max !== undefined && axisSettings?.y?.max !== null
            ? { max: axisSettings.y.max }
            : {}),
          grid: { display: false, drawTicks: true, tickLength: 8, tickWidth: 1.5, tickColor: '#000000' },
          border: { color: '#000000', width: 1.5 },
          ticks: {
            color: '#000000',
            font: { size: 18, weight: 'bold', family: 'Arial, sans-serif' },
            ...(axisSettings?.y?.stepMajor && axisSettings.y.stepMajor > 0
              ? { stepSize: axisSettings.y.stepMajor }
              : {}),
          },
        },
      },
    },
  };
}

/**
 * Render preview chart in given canvas. Returns Chart instance (caller can
 * destroy() it).
 */
export async function renderPreview(canvas, parsed, opts = {}) {
  const Chart = await loadChart();
  // Destroy existing
  const existing = Chart.getChart?.(canvas);
  if (existing) existing.destroy();

  // Round 88: decimate data if very dense to speed up render
  // Strategy: LTTB (Largest-Triangle-Three-Buckets) preserves visual shape
  // We use simple stride sampling for speed (LTTB requires extra dep)
  let xData = parsed.x;
  let yData = parsed.y;
  const MAX_POINTS_FOR_HIRES = 4000;
  if (xData.length > MAX_POINTS_FOR_HIRES) {
    const stride = Math.ceil(xData.length / MAX_POINTS_FOR_HIRES);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < xData.length; i += stride) {
      xs.push(xData[i]);
      ys.push(yData[i]);
    }
    // Always include last point
    if (xs[xs.length - 1] !== xData[xData.length - 1]) {
      xs.push(xData[xData.length - 1]);
      ys.push(yData[yData.length - 1]);
    }
    xData = xs;
    yData = ys;
    console.log(`[hires] decimated ${parsed.x.length} -> ${xs.length} points (stride ${stride})`);
  }

  const cfg = buildChartConfig({
    x: xData,
    y: yData,
    xLabel: parsed.plotXLabel || parsed.xLabel,
    yLabel: parsed.plotYLabel || parsed.yLabel,
    title: opts.title || '',
    spec: parsed.spec,
    category: parsed.category,
    bandgapFit: opts.bandgapFit || null,
    axisSettings: opts.axisSettings || null,
  });

  // Plugin: vẽ frame 4 cạnh quanh chart area
  cfg.plugins = cfg.plugins || [];
  cfg.plugins.push({
    id: 'chartFrame',
    afterDraw: (chart) => {
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        chartArea.left,
        chartArea.top,
        chartArea.right - chartArea.left,
        chartArea.bottom - chartArea.top
      );
      ctx.restore();
    },
  });

  // Helper de ve major + minor ticks tren 1 truc (X hoac Y)
  // minorPerMajor: so subdivision giua 2 major. Vd 4 -> 3 minor ticks giua, 2 -> 1 minor o midpoint.
  const _drawAxisTicks = (chart, axisName, minorPerMajor) => {
    const scale = chart.scales[axisName];
    if (!scale) return;
    const { ctx, chartArea } = chart;
    const ticks = scale.ticks;
    if (!ticks || ticks.length < 2) return;
    ctx.save();
    ctx.strokeStyle = '#000000';

    const isX = axisName === 'x';
    const subdivisions = Math.max(1, Math.min(10, minorPerMajor || 2));

    // Major ticks
    ctx.lineWidth = 1.5;
    const majorLen = 8;
    for (const t of ticks) {
      if (isX) {
        const x = scale.getPixelForValue(t.value);
        if (x < chartArea.left || x > chartArea.right) continue;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.bottom);
        ctx.lineTo(x, chartArea.bottom + majorLen);
        ctx.stroke();
      } else {
        const y = scale.getPixelForValue(t.value);
        if (y < chartArea.top || y > chartArea.bottom) continue;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.left - majorLen, y);
        ctx.stroke();
      }
    }

    // Minor ticks: chia [tick_i, tick_{i+1}] thanh `subdivisions` phan -> (subdivisions-1) minor ticks
    ctx.lineWidth = 1;
    const minorLen = 4;
    for (let i = 0; i < ticks.length - 1; i++) {
      const v0 = ticks[i].value;
      const v1 = ticks[i + 1].value;
      const dv = (v1 - v0) / subdivisions;
      for (let k = 1; k < subdivisions; k++) {
        const v = v0 + dv * k;
        if (isX) {
          const x = scale.getPixelForValue(v);
          if (x < chartArea.left || x > chartArea.right) continue;
          ctx.beginPath();
          ctx.moveTo(x, chartArea.bottom);
          ctx.lineTo(x, chartArea.bottom + minorLen);
          ctx.stroke();
        } else {
          const y = scale.getPixelForValue(v);
          if (y < chartArea.top || y > chartArea.bottom) continue;
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.left - minorLen, y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  };

  // Plugin: ve major + minor ticks tren ca 2 truc X va Y
  const _xMinor = opts.axisSettings?.x?.minorPerMajor ?? 2;
  const _yMinor = opts.axisSettings?.y?.minorPerMajor ?? 2;
  cfg.plugins.push({
    id: 'axisTicks',
    afterDraw: (chart) => {
      _drawAxisTicks(chart, 'x', _xMinor);
      _drawAxisTicks(chart, 'y', _yMinor);
    },
  });

  // Optional Eg annotation via afterDraw plugin
  if (opts.bandgapFit && isFinite(opts.bandgapFit.Eg)) {
    cfg.plugins = cfg.plugins || [];
    cfg.plugins.push({
      id: 'egAnnotation',
      afterDraw: (chart) => {
        const { ctx, chartArea, scales } = chart;
        const Eg = opts.bandgapFit.Eg;
        const x = scales.x.getPixelForValue(Eg);
        if (x < chartArea.left || x > chartArea.right) return;
        ctx.save();
        // Vertical line at Eg
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.bottom);
        ctx.lineTo(x, chartArea.top);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label: "E" + g_subscript + " = X.XX eV  (R²=Y.YYY)"
        const r2 = opts.bandgapFit.r2;
        const valuePart = ` = ${Eg.toFixed(3)} eV` + (isFinite(r2) ? `  (R²=${r2.toFixed(3)})` : '');
        ctx.fillStyle = '#dc2626';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const baseY = chartArea.top + 16;
        let cursorX = x + 6;
        // Vẽ "E" với font chính
        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.fillText('E', cursorX, baseY);
        cursorX += ctx.measureText('E').width;
        // Vẽ "g" subscript (font nhỏ hơn + offset y xuống)
        ctx.font = 'bold 9px Arial, sans-serif';
        ctx.fillText('g', cursorX, baseY + 3);
        cursorX += ctx.measureText('g').width + 0.5;
        // Vẽ phần value
        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.fillText(valuePart, cursorX, baseY);
        ctx.restore();
      },
    });
  }

  return new Chart(canvas, cfg);
}

/**
 * Render high-resolution PNG (~300 DPI equivalent for an 8" × 6" image).
 * Returns Blob (PNG).
 *
 * Math: 300 DPI × 8 in = 2400 px wide, × 6 in = 1800 px tall.
 */
export async function renderHighResPNG(parsed, opts = {}) {
  const Chart = await loadChart();
  const widthIn = opts.widthIn || 8;
  const heightIn = opts.heightIn || 6;
  // Round 88: default DPI 300 -> 220 (van la print-quality cho bao cao A4,
  // giam ~46% pixel count -> ~50% nhanh hon)
  const dpi = opts.dpi || 220;
  const w = Math.round(widthIn * dpi);
  const h = Math.round(heightIn * dpi);

  // Round 88: yield event loop truoc khi block render
  // de browser ve overlay message moi nhat ('Đang xuất PNG...')
  await new Promise(resolve => setTimeout(resolve, 16));

  // Offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  // Avoid attaching to DOM; Chart.js works on detached canvas with explicit size.

  // Round 88: decimate data if very dense to speed up render
  // Strategy: LTTB (Largest-Triangle-Three-Buckets) preserves visual shape
  // We use simple stride sampling for speed (LTTB requires extra dep)
  let xData = parsed.x;
  let yData = parsed.y;
  const MAX_POINTS_FOR_HIRES = 4000;
  if (xData.length > MAX_POINTS_FOR_HIRES) {
    const stride = Math.ceil(xData.length / MAX_POINTS_FOR_HIRES);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < xData.length; i += stride) {
      xs.push(xData[i]);
      ys.push(yData[i]);
    }
    // Always include last point
    if (xs[xs.length - 1] !== xData[xData.length - 1]) {
      xs.push(xData[xData.length - 1]);
      ys.push(yData[yData.length - 1]);
    }
    xData = xs;
    yData = ys;
    console.log(`[hires] decimated ${parsed.x.length} -> ${xs.length} points (stride ${stride})`);
  }

  const cfg = buildChartConfig({
    x: xData,
    y: yData,
    xLabel: parsed.plotXLabel || parsed.xLabel,
    yLabel: parsed.plotYLabel || parsed.yLabel,
    title: opts.title || '',
    spec: parsed.spec,
    category: parsed.category,
    bandgapFit: opts.bandgapFit || null,
    axisSettings: opts.axisSettings || null,
  });
  // Boost font sizes for high-res so text is legible
  const scale = dpi / 96; // CSS px to 300dpi
  cfg.options.plugins.title.font = { size: 22 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  cfg.options.scales.x.title.font = { size: 20 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  cfg.options.scales.y.title.font = { size: 20 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  cfg.options.scales.x.ticks.font = { size: 18 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  cfg.options.scales.y.ticks.font = { size: 18 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  // Scale tất cả border/line widths cho high-res
  cfg.data.datasets[0].borderWidth = 1.5 * scale;
  // Đường tuyến tính fit Eg (datasets[1] nếu có)
  if (cfg.data.datasets[1]) {
    cfg.data.datasets[1].borderWidth = 2 * scale;
  }
  // Border axis (đường đen quanh chart)
  if (cfg.options.scales.x.border) {
    cfg.options.scales.x.border.width = 1.5 * scale;
  }
  if (cfg.options.scales.y.border) {
    cfg.options.scales.y.border.width = 1.5 * scale;
  }
  cfg.options.responsive = false;
  cfg.options.devicePixelRatio = 1;

  // Margin trong canvas (giữa mép canvas và chart area) — 10px CSS scaled
  cfg.options.layout = cfg.options.layout || {};
  // 10px outer + 10px inner = 20px tổng cách mép canvas
  cfg.options.layout.padding = {
    top: 20 * scale,
    right: 20 * scale,
    bottom: 20 * scale,
    left: 20 * scale,
  };

  // White background plugin (PNG export thường trong suốt → trắng cho chuẩn lab report)
  const whiteBgPlugin = {
    id: 'whiteBg',
    beforeDraw: (c) => {
      const ctx = c.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.restore();
    },
  };
  cfg.plugins = [whiteBgPlugin];

  // Frame 4 cạnh cho high-res
  cfg.plugins.push({
    id: 'chartFrameHires',
    afterDraw: (chart) => {
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(
        chartArea.left,
        chartArea.top,
        chartArea.right - chartArea.left,
        chartArea.bottom - chartArea.top
      );
      ctx.restore();
    },
  });

  // High-res: major + minor ticks X (scaled)
  cfg.plugins.push({
    id: 'xAxisTicksHires',
    afterDraw: (chart) => {
      const xScale = chart.scales.x;
      if (!xScale) return;
      const { ctx, chartArea } = chart;
      const ticks = xScale.ticks;
      if (!ticks || ticks.length < 2) return;
      ctx.save();
      ctx.strokeStyle = '#000000';

      // Major
      ctx.lineWidth = 1.5 * scale;
      const majorLen = 8 * scale;
      for (const t of ticks) {
        const x = xScale.getPixelForValue(t.value);
        if (x < chartArea.left || x > chartArea.right) continue;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.bottom);
        ctx.lineTo(x, chartArea.bottom + majorLen);
        ctx.stroke();
      }

      // Minor
      ctx.lineWidth = 1 * scale;
      const minorLen = 4 * scale;
      for (let i = 0; i < ticks.length - 1; i++) {
        const midValue = (ticks[i].value + ticks[i + 1].value) / 2;
        const x = xScale.getPixelForValue(midValue);
        if (x < chartArea.left || x > chartArea.right) continue;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.bottom);
        ctx.lineTo(x, chartArea.bottom + minorLen);
        ctx.stroke();
      }
      ctx.restore();
    },
  });

  // Eg annotation for high-res export
  if (opts.bandgapFit && isFinite(opts.bandgapFit.Eg)) {
    const scale = dpi / 96;
    cfg.plugins.push({
      id: 'egAnnotationHires',
      afterDraw: (chart) => {
        const { ctx, chartArea, scales } = chart;
        const Eg = opts.bandgapFit.Eg;
        const x = scales.x.getPixelForValue(Eg);
        if (x < chartArea.left || x > chartArea.right) return;
        ctx.save();
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.5 * scale;
        ctx.setLineDash([4 * scale, 3 * scale]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.bottom);
        ctx.lineTo(x, chartArea.top);
        ctx.stroke();
        ctx.setLineDash([]);
        const r2 = opts.bandgapFit.r2;
        const valuePart = ` = ${Eg.toFixed(3)} eV` + (isFinite(r2) ? `  (R²=${r2.toFixed(3)})` : '');
        ctx.fillStyle = '#dc2626';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const baseY = chartArea.top + 16 * scale;
        let cursorX = x + 6 * scale;
        ctx.font = `bold ${12 * scale}px Arial, sans-serif`;
        ctx.fillText('E', cursorX, baseY);
        cursorX += ctx.measureText('E').width;
        ctx.font = `bold ${9 * scale}px Arial, sans-serif`;
        ctx.fillText('g', cursorX, baseY + 3 * scale);
        cursorX += ctx.measureText('g').width + 0.5 * scale;
        ctx.font = `bold ${12 * scale}px Arial, sans-serif`;
        ctx.fillText(valuePart, cursorX, baseY);
        ctx.restore();
      },
    });
  }

  const chart = new Chart(canvas, cfg);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png', 1.0);
  });
  chart.destroy();
  return blob;
}
