/**
 * pages/reports.js
 *
 * Trang Reports — phân tích lịch sử thí nghiệm theo khoảng thời gian.
 *
 * Phase 3A — Foundation (giữ):
 *   - Date range picker (3 modes: tháng / quý / custom)
 *   - Card 1: Số lượng TN theo loại (hydro/electrode/electrochem)
 *
 * Phase 3B — Chemicals consumption (mới):
 *   - Card 2: Top 10 hóa chất tiêu thụ nhiều nhất + bảng chi tiết
 *   - Parse từ /history entries với pattern "Trừ tồn kho: <name>" + "-Xg (TN: ...)"
 *   - Net = subtractions - returns ("Hoàn tồn kho")
 *   - Group by chemical + unit (vì g/ml không gộp được)
 *
 * Phụ thuộc:
 *   - cache qua window.cache (hydro, electrode, electrochem, history)
 *   - Chart.js lazy-loaded
 *   - history chỉ có cho admin/superadmin (rule .read)
 *
 * State module-level:
 *   - _filterMode, _filterFrom, _filterTo: range filter
 *   - _typeChartInstance, _chemChartInstance: Chart.js refs
 */

import { vals } from '../utils/format.js'

// ── State ─────────────────────────────────────────────────
let _filterMode = 'month'
let _filterFrom = null
let _filterTo = null
let _typeChartInstance = null
let _chemChartInstance = null

// ── Chart.js lazy loader ──────────────────────────────────
let _chartJsPromise = null
function loadChartJs() {
  if (!_chartJsPromise) {
    _chartJsPromise = import('chart.js/auto').then(m => m.default)
  }
  return _chartJsPromise
}

// ── Date helpers ──────────────────────────────────────────
function parseDateAny(v) {
  if (!v) return null
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v)
    return isNaN(d) ? null : d
  }
  if (typeof v === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(v)) {
    const [dd, mm, yyyy] = v.split('/')
    const d = new Date(+yyyy, +mm - 1, +dd)
    return isNaN(d) ? null : d
  }
  const d = new Date(v)
  return isNaN(d) ? null : d
}

function recordDate(r) {
  return parseDateAny(r.date) || parseDateAny(r.createdAt)
}

function fmtDateInput(d) {
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }
function startOfQuarter(d) { const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3, 1) }
function endOfQuarter(d) { const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999) }

function _initDefaultRange() {
  if (_filterFrom && _filterTo) return
  const now = new Date()
  _filterFrom = startOfMonth(now)
  _filterTo = endOfMonth(now)
}

function _filterByDate(records) {
  if (!_filterFrom || !_filterTo) return records
  const fromMs = _filterFrom.getTime()
  const toMs = _filterTo.getTime()
  return records.filter(r => {
    const d = recordDate(r)
    if (!d) return false
    const t = d.getTime()
    return t >= fromMs && t <= toMs
  })
}

// ── Phase 3B: Aggregate chemicals từ /history ─────────────
//
// Pattern lookup từ save-handlers.js, duplicate-delete.js:
//   action: "Trừ tồn kho: NaOH"  hoặc  "Hoàn tồn kho: NaOH"
//   detail: "-100g (TN: HYD-001)"  hoặc  "+100g (Xóa TN: HYD-001)"
//
// Net consumption = subtractions - returns
const RX_ACTION_SUBTRACT = /^Tr\u1eeb t\u1ed3n kho:\s*(.+)$/
const RX_ACTION_RETURN = /^Ho\u00e0n t\u1ed3n kho:\s*(.+)$/
const RX_DETAIL_AMOUNT = /^([+-])(\d+(?:\.\d+)?)\s*([a-zA-Z\u00c0-\u1ef9]+)/

function aggregateChemicalsFromHistory() {
  const cache = window.cache || {}
  const history = vals(cache.history)

  // Filter theo date range (history.ts là number — Date.now())
  const fromMs = _filterFrom?.getTime() ?? 0
  const toMs = _filterTo?.getTime() ?? Number.POSITIVE_INFINITY
  const inRange = history.filter(h => {
    const ts = Number(h.ts)
    return ts >= fromMs && ts <= toMs
  })

  // Aggregate by (chem name, unit)
  // Map<chemName, Map<unit, {totalNet, count, subtotal, returntotal}>>
  const agg = new Map()

  inRange.forEach(h => {
    const action = String(h.action || '')
    const detail = String(h.detail || '')

    let chemName = null
    let isReturn = false

    let m = action.match(RX_ACTION_SUBTRACT)
    if (m) {
      chemName = m[1].trim()
    } else {
      m = action.match(RX_ACTION_RETURN)
      if (m) {
        chemName = m[1].trim()
        isReturn = true
      }
    }
    if (!chemName) return  // Skip non-chemical history

    // Parse detail: "+100g (...)" or "-100g (...)"
    const md = detail.match(RX_DETAIL_AMOUNT)
    if (!md) return  // Skip if can't parse amount
    const sign = md[1]
    const amount = parseFloat(md[2])
    const unit = md[3].toLowerCase()
    if (!isFinite(amount) || amount <= 0) return

    // Tính net delta:
    //   - "Trừ tồn kho" + "-100g" → net consumption +100 (subtract more)
    //   - "Trừ tồn kho" + "+50g" → net consumption -50 (rare: correction)
    //   - "Hoàn tồn kho" + "+100g" → net consumption -100 (return reduces total)
    //   - "Hoàn tồn kho" + "-..." → unusual, treat as return
    let netDelta = 0
    if (!isReturn) {
      // "Trừ tồn kho": consumption = absolute value with sign
      netDelta = sign === '-' ? amount : -amount
    } else {
      // "Hoàn tồn kho": ngược lại (return)
      netDelta = sign === '+' ? -amount : amount
    }

    // Record
    if (!agg.has(chemName)) agg.set(chemName, new Map())
    const unitMap = agg.get(chemName)
    if (!unitMap.has(unit)) {
      unitMap.set(unit, { totalNet: 0, count: 0 })
    }
    const stat = unitMap.get(unit)
    stat.totalNet += netDelta
    stat.count += 1
  })

  // Flatten + filter (chỉ giữ entries có totalNet > 0 = thực sự tiêu thụ)
  const result = []
  agg.forEach((unitMap, chemName) => {
    unitMap.forEach((stat, unit) => {
      if (stat.totalNet > 0.0001) {  // ignore zero/negative net
        result.push({
          name: chemName,
          unit,
          total: stat.totalNet,
          count: stat.count,
        })
      }
    })
  })

  // Sort desc by total, take top 10
  result.sort((a, b) => b.total - a.total)
  return result
}

// ── Render: Date range picker (giữ Phase 3A) ──────────────
function renderDatePicker() {
  const card = document.getElementById('report-filter-card')
  if (!card) return

  const isMonthMode = _filterMode === 'month'
  const isQuarterMode = _filterMode === 'quarter'
  const isCustomMode = _filterMode === 'custom'

  const btn = (mode, label) => {
    const active = _filterMode === mode
    const bg = active ? 'var(--teal)' : 'var(--surface-2, #f1f5f9)'
    const fg = active ? '#fff' : '#475569'
    return `<button onclick="window._reportsSetMode('${mode}')" style="padding:7px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:${bg};color:${fg};transition:all 0.15s">${label}</button>`
  }

  let monthPicker = ''
  if (isMonthMode) {
    const now = new Date()
    const months = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`
      const isSelected = _filterFrom && _filterFrom.getFullYear() === d.getFullYear() && _filterFrom.getMonth() === d.getMonth()
      const bg = isSelected ? 'var(--teal-light, #f0fdfa)' : 'transparent'
      const fg = isSelected ? 'var(--teal)' : '#0f172a'
      const border = isSelected ? '1.5px solid var(--teal)' : '1px solid #e2e8f0'
      months.push(`<button onclick="window._reportsSetMonth(${d.getFullYear()}, ${d.getMonth()})" style="padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;background:${bg};color:${fg};border:${border};transition:all 0.15s">${label}</button>`)
    }
    monthPicker = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">${months.join('')}</div>`
  }

  let quarterPicker = ''
  if (isQuarterMode) {
    const now = new Date()
    const currentQuarter = Math.floor(now.getMonth() / 3)
    const quarters = []
    for (let i = 0; i < 8; i++) {
      const totalQ = currentQuarter - i + now.getFullYear() * 4
      const year = Math.floor(totalQ / 4)
      const q = totalQ % 4
      const label = `Q${q + 1}/${year}`
      const isSelected = _filterFrom && _filterFrom.getFullYear() === year && Math.floor(_filterFrom.getMonth() / 3) === q
      const bg = isSelected ? 'var(--teal-light, #f0fdfa)' : 'transparent'
      const fg = isSelected ? 'var(--teal)' : '#0f172a'
      const border = isSelected ? '1.5px solid var(--teal)' : '1px solid #e2e8f0'
      quarters.push(`<button onclick="window._reportsSetQuarter(${year}, ${q})" style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;background:${bg};color:${fg};border:${border};transition:all 0.15s">${label}</button>`)
    }
    quarterPicker = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">${quarters.join('')}</div>`
  }

  let customPicker = ''
  if (isCustomMode) {
    customPicker = `
      <div style="display:flex;gap:12px;align-items:center;margin-top:12px;flex-wrap:wrap">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#64748b">
          Từ ngày
          <input type="date" id="report-date-from" value="${fmtDateInput(_filterFrom)}"
                 onchange="window._reportsSetCustomRange()"
                 style="padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#64748b">
          Đến ngày
          <input type="date" id="report-date-to" value="${fmtDateInput(_filterTo)}"
                 onchange="window._reportsSetCustomRange()"
                 style="padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px">
        </label>
      </div>
    `
  }

  const rangeDisplay = (_filterFrom && _filterTo)
    ? `${_filterFrom.toLocaleDateString('vi-VN')} → ${_filterTo.toLocaleDateString('vi-VN')}`
    : 'Chưa chọn'

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color:var(--teal);"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Khoảng thời gian báo cáo</h3>
      <span style="font-size:13px;color:#64748b;font-weight:500">${rangeDisplay}</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${btn('month', 'Theo tháng')}
      ${btn('quarter', 'Theo quý')}
      ${btn('custom', 'Tùy chọn')}
    </div>
    ${monthPicker}
    ${quarterPicker}
    ${customPicker}
  `
}

// ── Render: Card 1 — Số lượng TN theo loại (giữ Phase 3A) ─
async function renderTypeCountCard() {
  const card = document.getElementById('report-type-count-card')
  if (!card) return

  const cache = window.cache || {}
  const hydro = _filterByDate(vals(cache.hydro))
  const electrode = _filterByDate(vals(cache.electrode))
  const electrochem = _filterByDate(vals(cache.electrochem))
  const total = hydro.length + electrode.length + electrochem.length

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color:#6366f1;"><path d="M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0M5.58 16.5h12.85"/></svg>Số lượng thí nghiệm theo loại</h3>
      <span style="font-size:14px;color:#64748b;font-weight:600">Tổng: <strong style="color:var(--teal)">${total}</strong></span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px;margin-bottom:16px">
      <div style="padding:12px;background:rgba(13,148,136,0.08);border-radius:8px;border-left:3px solid var(--teal)">
        <div style="font-size:11.5px;color:#64748b;font-weight:600;text-transform:uppercase">Thủy nhiệt</div>
        <div style="font-size:24px;font-weight:700;color:var(--teal);margin-top:4px">${hydro.length}</div>
      </div>
      <div style="padding:12px;background:rgba(99,102,241,0.08);border-radius:8px;border-left:3px solid #6366f1">
        <div style="font-size:11.5px;color:#64748b;font-weight:600;text-transform:uppercase">Điện cực</div>
        <div style="font-size:24px;font-weight:700;color:#6366f1;margin-top:4px">${electrode.length}</div>
      </div>
      <div style="padding:12px;background:rgba(249,115,22,0.08);border-radius:8px;border-left:3px solid #f97316">
        <div style="font-size:11.5px;color:#64748b;font-weight:600;text-transform:uppercase">Điện hóa</div>
        <div style="font-size:24px;font-weight:700;color:#f97316;margin-top:4px">${electrochem.length}</div>
      </div>
    </div>
    <div style="position:relative;height:280px">
      <canvas id="report-type-chart"></canvas>
    </div>
  `

  if (total === 0) {
    const wrapper = card.querySelector('canvas').parentElement
    wrapper.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:13px;text-align:center">
      Không có thí nghiệm nào trong khoảng thời gian đã chọn
    </div>`
    return
  }

  const Chart = await loadChartJs()
  const canvas = document.getElementById('report-type-chart')
  if (!canvas) return

  if (_typeChartInstance) {
    _typeChartInstance.destroy()
    _typeChartInstance = null
  }

  _typeChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Thủy nhiệt', 'Điện cực', 'Điện hóa'],
      datasets: [{
        data: [hydro.length, electrode.length, electrochem.length],
        backgroundColor: ['rgba(13,148,136,0.85)', 'rgba(99,102,241,0.85)', 'rgba(249,115,22,0.85)'],
        borderColor: ['#0d9488', '#6366f1', '#f97316'],
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => {
              const value = ctx.raw
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0
              return ` ${value} thí nghiệm (${pct}%)`
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 12 }, color: '#475569' } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, stepSize: 1, font: { size: 11 }, color: '#94a3b8' },
          grid: { color: '#e2e8f0', lineWidth: 0.5 }
        }
      }
    }
  })
}

// ── Phase 3B: Card 2 — Tiêu thụ hóa chất ──────────────────
async function renderChemicalsCard() {
  const card = document.getElementById('report-chemicals-card')
  if (!card) return

  // Yêu cầu admin (history chỉ admin đọc được)
  const isAdmin = !!(window.currentAuth?.isAdmin)
  if (!isAdmin) {
    card.innerHTML = `
      <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color:#0d9488;"><path d="M7 19a3 3 0 0 1-2-5.243L5 13l2-2 2 2 1 .757a3 3 0 0 1-3 5.243"/><path d="M12.56 6.6a10 10 0 0 1 .203-.495 11 11 0 0 1 1.196-2.054 11 11 0 0 1 1.196 2.054 10 10 0 0 1 1.063 4.024c0 1.31-.4 2.535-1.082 3.541"/><path d="M17 9c0-3-2-7-5-7s-5 4-5 7"/></svg>Tiêu thụ hóa chất</h3>
      <div style="margin-top:12px;padding:14px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:6px;font-size:13px;color:#92400e">
        Báo cáo này chỉ dành cho admin/superadmin (cần quyền đọc lịch sử thao tác).
      </div>
    `
    return
  }

  const data = aggregateChemicalsFromHistory()
  const top10 = data.slice(0, 10)

  // Header
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color:#0d9488;"><path d="M7 19a3 3 0 0 1-2-5.243L5 13l2-2 2 2 1 .757a3 3 0 0 1-3 5.243"/><path d="M12.56 6.6a10 10 0 0 1 .203-.495 11 11 0 0 1 1.196-2.054 11 11 0 0 1 1.196 2.054 10 10 0 0 1 1.063 4.024c0 1.31-.4 2.535-1.082 3.541"/><path d="M17 9c0-3-2-7-5-7s-5 4-5 7"/></svg>Tiêu thụ hóa chất</h3>
      <span style="font-size:14px;color:#64748b;font-weight:600">${data.length} loại đã dùng</span>
    </div>
  `

  // Empty state
  if (top10.length === 0) {
    html += `
      <div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">
        Không có hóa chất nào được tiêu thụ trong khoảng thời gian đã chọn.
      </div>
    `
    card.innerHTML = html
    if (_chemChartInstance) { _chemChartInstance.destroy(); _chemChartInstance = null }
    return
  }

  // Chart container + table
  html += `
    <div style="position:relative;height:${Math.max(220, top10.length * 32)}px;margin-bottom:18px">
      <canvas id="report-chem-chart"></canvas>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--surface-2,#f8fafc);color:#475569">
            <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-weight:600">Hóa chất</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:600">Tổng tiêu thụ</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600">Đơn vị</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600">Số lần</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((row, i) => `
            <tr style="${i % 2 ? 'background:rgba(248,250,252,0.5)' : ''}">
              <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-weight:500">${row.name}</td>
              <td style="padding:7px 12px;text-align:right;border-bottom:1px solid #f1f5f9;font-family:'Courier New',monospace;color:var(--teal);font-weight:600">${row.total.toFixed(2)}</td>
              <td style="padding:7px 12px;text-align:center;border-bottom:1px solid #f1f5f9;color:#64748b">${row.unit}</td>
              <td style="padding:7px 12px;text-align:center;border-bottom:1px solid #f1f5f9;color:#94a3b8">${row.count}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  card.innerHTML = html

  // Chart top 10 (horizontal bar)
  const Chart = await loadChartJs()
  const canvas = document.getElementById('report-chem-chart')
  if (!canvas) return

  if (_chemChartInstance) {
    _chemChartInstance.destroy()
    _chemChartInstance = null
  }

  _chemChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top10.map(r => r.name + ' (' + r.unit + ')'),
      datasets: [{
        data: top10.map(r => r.total),
        backgroundColor: 'rgba(13,148,136,0.75)',
        borderColor: '#0d9488',
        borderWidth: 1.2,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',  // horizontal bar
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => {
              const row = top10[ctx.dataIndex]
              return ` ${row.total.toFixed(2)} ${row.unit} (${row.count} lần)`
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { font: { size: 11 }, color: '#94a3b8' },
          grid: { color: '#e2e8f0', lineWidth: 0.5 }
        },
        y: { grid: { display: false }, ticks: { font: { size: 11.5 }, color: '#475569' } }
      }
    }
  })
}

// ── Public API ────────────────────────────────────────────
export function renderReports() {
  _initDefaultRange()
  renderDatePicker()
  renderTypeCountCard()
  renderChemicalsCard()  // Phase 3B
}

// ── Window handlers ───────────────────────────────────────
if (typeof window !== 'undefined') {
  window._reportsSetMode = function(mode) {
    _filterMode = mode
    const now = new Date()
    if (mode === 'month') {
      _filterFrom = startOfMonth(now)
      _filterTo = endOfMonth(now)
    } else if (mode === 'quarter') {
      _filterFrom = startOfQuarter(now)
      _filterTo = endOfQuarter(now)
    }
    renderReports()
  }

  window._reportsSetMonth = function(year, month) {
    _filterFrom = new Date(year, month, 1)
    _filterTo = new Date(year, month + 1, 0, 23, 59, 59, 999)
    renderReports()
  }

  window._reportsSetQuarter = function(year, q) {
    _filterFrom = new Date(year, q * 3, 1)
    _filterTo = new Date(year, q * 3 + 3, 0, 23, 59, 59, 999)
    renderReports()
  }

  window._reportsSetCustomRange = function() {
    const fromInput = document.getElementById('report-date-from')
    const toInput = document.getElementById('report-date-to')
    if (!fromInput || !toInput) return
    const from = parseDateAny(fromInput.value)
    const to = parseDateAny(toInput.value)
    if (!from || !to) return
    if (from > to) {
      _filterFrom = to
      _filterTo = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59, 999)
    } else {
      _filterFrom = from
      _filterTo = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)
    }
    // Re-render data cards (giữ picker focus)
    renderTypeCountCard()
    renderChemicalsCard()
  }
}

// ── Auto re-render khi data update ────────────────────────
window.addEventListener('cache-update', (e) => {
  const col = e.detail?.col
  // Type-count quan tâm: hydro/electrode/electrochem
  // Chemicals quan tâm: history
  const reportsPage = document.getElementById('page-reports')
  if (!reportsPage || !reportsPage.classList.contains('active')) return

  if (['hydro', 'electrode', 'electrochem'].includes(col)) {
    renderTypeCountCard()
  }
  if (col === 'history') {
    renderChemicalsCard()
  }
})

window.addEventListener('themechange', () => {
  const reportsPage = document.getElementById('page-reports')
  if (reportsPage && reportsPage.classList.contains('active')) {
    renderReports()
  }
})
