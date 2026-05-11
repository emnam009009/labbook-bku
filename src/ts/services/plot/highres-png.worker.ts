/// <reference lib="webworker" />
// src/ts/services/plot/highres-png.worker.ts
// Round 89: render PNG 300 DPI trong Web Worker thread
// (KHONG block main thread).
//
// Worker nhan:
//   { parsed, opts, canvas: OffscreenCanvas }
// Tra ve:
//   { ok: true, blob }   tren success
//   { ok: false, error } tren that bai

// @ts-nocheck — Service layer — DOM event handlers + legacy patterns. Defer typing until UI rewrite.
import { Chart, registerables } from 'chart.js/auto';
Chart.register(...registerables);

// ─── Helper: trục có start từ 0 hay không ────
function _axisStartFromZero(category, xLabel) {
  if (!category) {
    if (typeof xLabel === 'string' && /Energy/i.test(xLabel)) return true;
    return false;
  }
  return ['uvvis', 'uvvis-drs', 'pl'].includes(category);
}

// ─── Build base Chart.js config ───
function buildChartConfig({ x, y, xLabel, yLabel, title, spec, bandgapFit, category, axisSettings }) {
  const points = x.map((xv, i) => ({ x: xv, y: y[i] }));
  const datasets = [{
    label: yLabel || 'Y',
    data: points,
    parsing: false,
    showLine: true,
    pointRadius: 0,
    borderColor: '#0d9488',
    borderWidth: 1.5,
    backgroundColor: 'rgba(13, 148, 136, 0.06)',
    tension: 0,
  }];

  // Bandgap fit (Tauc only): add second dataset (red line)
  if (bandgapFit && isFinite(bandgapFit.Eg)) {
    const { slope, intercept, x0, x1 } = bandgapFit;
    if (isFinite(slope) && isFinite(intercept) && isFinite(x0) && isFinite(x1)) {
      const fitPoints = [
        { x: x0, y: slope * x0 + intercept },
        { x: x1, y: slope * x1 + intercept },
      ];
      datasets.push({
        label: 'Linear fit (Eg)',
        data: fitPoints,
        parsing: false,
        showLine: true,
        pointRadius: 0,
        borderColor: '#dc2626',
        borderWidth: 2,
        borderDash: [],
        tension: 0,
        fill: false,
      });
    }
  }

  const startFromZero = _axisStartFromZero(category, xLabel);
  const reverseX = !!(spec && spec.reverseX);

  // Round 92: axis options synced with preview (plot-preview.ts) so
  // saved PNG matches preview exactly — no grid lines, custom plugins
  // handle tick rendering with hi-res scaling.
  const buildAxisOpts = (axis, axisLabel) => {
    const settings = axisSettings && axisSettings[axis];
    const opts: any = {
      type: 'linear',
      title: {
        display: !!axisLabel,
        text: axisLabel || '',
        font: { size: 14, weight: 'bold', family: 'Arial, sans-serif' },
        color: '#000000',
      },
      ticks: {
        color: '#000000',
        font: { size: 12, weight: 'bold', family: 'Arial, sans-serif' },
        // padding scaled later — see post-build pass below
      },
      // Round 92: NO grid lines — preview has display:false. Custom hires
      // plugins (xAxisTicksHires/yAxisTicksHires) draw ticks themselves.
      grid: { display: false, drawTicks: false, tickLength: 0 },
      border: { display: true, color: '#000000', width: 1 },
    };
    if (axis === 'x' && reverseX) opts.reverse = true;
    if (axis === 'y' && startFromZero) opts.beginAtZero = true;
    if (settings) {
      if (typeof settings.min === 'number' && isFinite(settings.min)) opts.min = settings.min;
      if (typeof settings.max === 'number' && isFinite(settings.max)) opts.max = settings.max;
      if (typeof settings.stepMajor === 'number' && settings.stepMajor > 0) {
        opts.ticks.stepSize = settings.stepMajor;
      }
    }
    return opts;
  };

  return {
    type: 'line',
    data: { datasets },
    options: {
      animation: false,
      maintainAspectRatio: false,
      responsive: false,
      devicePixelRatio: 1,
      interaction: { intersect: false },
      plugins: {
        title: {
          display: !!title,
          text: title || '',
          color: '#000',
          font: { size: 16, weight: 'bold', family: 'Arial, sans-serif' },
          padding: { top: 6, bottom: 12 },
        },
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: buildAxisOpts('x', xLabel),
        y: buildAxisOpts('y', yLabel),
      },
    },
    plugins: [],  // populated below in worker
  };
}

// ─── Render handler ───
async function renderToBlob({ parsed, opts, canvas }) {
  const widthIn = opts.widthIn || 8;
  const heightIn = opts.heightIn || 6;
  const dpi = opts.dpi || 300;  // Round 89: back to 300 (worker doesn't block UI)
  const w = Math.round(widthIn * dpi);
  const h = Math.round(heightIn * dpi);
  canvas.width = w;
  canvas.height = h;

  // Decimation for very dense data (>4000 points)
  let xData = parsed.x;
  let yData = parsed.y;
  const MAX_POINTS = 4000;
  if (xData.length > MAX_POINTS) {
    const stride = Math.ceil(xData.length / MAX_POINTS);
    const xs = [];
    const ys = [];
    for (let i = 0; i < xData.length; i += stride) {
      xs.push(xData[i]);
      ys.push(yData[i]);
    }
    if (xs[xs.length - 1] !== xData[xData.length - 1]) {
      xs.push(xData[xData.length - 1]);
      ys.push(yData[yData.length - 1]);
    }
    xData = xs;
    yData = ys;
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

  // Boost font sizes for hi-res
  const scale = dpi / 96;
  cfg.options.plugins.title.font = { size: 22 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  cfg.options.scales.x.title.font = { size: 20 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  cfg.options.scales.y.title.font = { size: 20 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  cfg.options.scales.x.ticks.font = { size: 18 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  cfg.options.scales.y.ticks.font = { size: 18 * scale, weight: 'bold', family: 'Arial, sans-serif' };
  cfg.data.datasets[0].borderWidth = 1.5 * scale;
  if (cfg.data.datasets[1]) cfg.data.datasets[1].borderWidth = 2 * scale;
  if (cfg.options.scales.x.border) cfg.options.scales.x.border.width = 1.5 * scale;
  if (cfg.options.scales.y.border) cfg.options.scales.y.border.width = 1.5 * scale;
  // Round 94: padding MUST exceed tickLength (8*scale) — otherwise tick
  // marks visually intrude into label area. Use 12*scale (~38px @ 300 DPI)
  // so labels sit clear of tick marks (which extend 8*scale ~25px from axis).
  if (cfg.options.scales.x.ticks) cfg.options.scales.x.ticks.padding = 12 * scale;
  if (cfg.options.scales.y.ticks) cfg.options.scales.y.ticks.padding = 12 * scale;
  // Title font padding scaled too
  if (cfg.options.plugins?.title?.padding) {
    cfg.options.plugins.title.padding = { top: 6 * scale, bottom: 12 * scale };
  }
  cfg.options.layout = cfg.options.layout || {};
  // Round 92: increase padding so last axis tick label (e.g. '90') doesn't
  // bleed into chart frame border. Right needs extra room for label width.
  cfg.options.layout.padding = {
    top: 32 * scale, right: 60 * scale, bottom: 32 * scale, left: 32 * scale,
  };

  // White background
  cfg.plugins.push({
    id: 'whiteBg',
    beforeDraw: (c) => {
      const ctx = c.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.restore();
    },
  });

  // Frame 4 cạnh
  cfg.plugins.push({
    id: 'chartFrameHires',
    afterDraw: (chart) => {
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(
        chartArea.left, chartArea.top,
        chartArea.right - chartArea.left,
        chartArea.bottom - chartArea.top,
      );
      ctx.restore();
    },
  });

  // X-axis ticks (major + minor)
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

  // Y-axis ticks
  cfg.plugins.push({
    id: 'yAxisTicksHires',
    afterDraw: (chart) => {
      const yScale = chart.scales.y;
      if (!yScale) return;
      const { ctx, chartArea } = chart;
      const ticks = yScale.ticks;
      if (!ticks || ticks.length < 2) return;
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5 * scale;
      const majorLen = 8 * scale;
      for (const t of ticks) {
        const y = yScale.getPixelForValue(t.value);
        if (y < chartArea.top || y > chartArea.bottom) continue;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.left - majorLen, y);
        ctx.stroke();
      }
      ctx.lineWidth = 1 * scale;
      const minorLen = 4 * scale;
      for (let i = 0; i < ticks.length - 1; i++) {
        const midValue = (ticks[i].value + ticks[i + 1].value) / 2;
        const y = yScale.getPixelForValue(midValue);
        if (y < chartArea.top || y > chartArea.bottom) continue;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.left - minorLen, y);
        ctx.stroke();
      }
      ctx.restore();
    },
  });

  // Eg annotation (Tauc)
  if (opts.bandgapFit && isFinite(opts.bandgapFit.Eg)) {
    cfg.plugins.push({
      id: 'egAnnotation',
      afterDraw: (chart) => {
        const xScale = chart.scales.x;
        if (!xScale) return;
        const Eg = opts.bandgapFit.Eg;
        const { ctx, chartArea } = chart;
        const x = xScale.getPixelForValue(Eg);
        if (x < chartArea.left || x > chartArea.right) return;
        ctx.save();
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1 * scale;
        ctx.setLineDash([6 * scale, 4 * scale]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
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

  cfg.options.responsive = false;
  cfg.options.devicePixelRatio = 1;

  const chart = new Chart(canvas, cfg);

  // Wait one tick for Chart.js to fully render before extract
  await new Promise(resolve => setTimeout(resolve, 0));

  const blob = await canvas.convertToBlob({ type: 'image/png', quality: 1.0 });
  chart.destroy();
  return blob;
}

// Worker message handler
(self as any).onmessage = async (e: MessageEvent) => {
  const { parsed, opts, canvas } = e.data || {};
  try {
    const blob = await renderToBlob({ parsed, opts, canvas });
    (self as any).postMessage({ ok: true, blob });
  } catch (err: any) {
    (self as any).postMessage({ ok: false, error: err?.message || String(err) });
  }
};
