/**
 * pages/reports.js
 *
 * Trang Reports — phân tích lịch sử thí nghiệm theo khoảng thời gian.
 * Phase 3A — Foundation:
 *   - Date range picker (3 modes: tháng / quý / custom)
 *   - Card 1: Số lượng TN theo loại (hydro/electrode/electrochem) trong khoảng đã chọn
 *
 * Tách module riêng (KHÔNG động dashboard.js) để:
 *   - Dashboard giữ vai trò "realtime overview" (không có filter)
 *   - Reports có thể grow dần (Phase 3B/3C/3D thêm cards mới)
 *
 * Phụ thuộc:
 *   - cache qua window.cache (hydro, electrode, electrochem)
 *   - Chart.js lazy-loaded để giảm initial bundle
 *
 * State module-level:
 *   - _filterMode: 'month' | 'quarter' | 'custom'
 *   - _filterFrom, _filterTo: Date objects (inclusive both ends)
 *   - _typeChartInstance: Chart.js instance để destroy trước khi tạo mới
 */

import { vals } from '../utils/format.js'

// ── State ─────────────────────────────────────────────────
let _filterMode = 'month'           // mode mặc định khi mở page lần đầu
let _filterFrom = null              // Date | null
let _filterTo = null                // Date | null
let _typeChartInstance = null

// ── Chart.js lazy loader (~80KB, share với dashboard) ─────
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
  // Format Date → "YYYY-MM-DD" cho <input type="date">
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

function startOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3, 1)
}

function endOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999)
}

// ── Initialize default range ──────────────────────────────
function _initDefaultRange() {
  if (_filterFrom && _filterTo) return
  // Default: tháng hiện tại
  const now = new Date()
  _filterFrom = startOfMonth(now)
  _filterTo = endOfMonth(now)
}

// ── Filter logic ──────────────────────────────────────────
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

// ── Render: Date range picker ─────────────────────────────
function renderDatePicker() {
  const card = document.getElementById('report-filter-card')
  if (!card) return

  const isMonthMode = _filterMode === 'month'
  const isQuarterMode = _filterMode === 'quarter'
  const isCustomMode = _filterMode === 'custom'

  // Active button style helper
  const btn = (mode, label) => {
    const active = _filterMode === mode
    const bg = active ? 'var(--teal)' : 'var(--surface-2, #f1f5f9)'
    const fg = active ? '#fff' : '#475569'
    return `<button onclick="window._reportsSetMode('${mode}')" style="padding:7px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:${bg};color:${fg};transition:all 0.15s">${label}</button>`
  }

  // Month picker — list 12 tháng gần nhất
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

  // Quarter picker — 8 quý gần nhất
  let quarterPicker = ''
  if (isQuarterMode) {
    const now = new Date()
    const currentQuarter = Math.floor(now.getMonth() / 3)
    const quarters = []
    for (let i = 0; i < 8; i++) {
      const totalQ = currentQuarter - i + now.getFullYear() * 4
      const year = Math.floor(totalQ / 4)
      const q = totalQ % 4
      const fromD = new Date(year, q * 3, 1)
      const label = `Q${q + 1}/${year}`
      const isSelected = _filterFrom && _filterFrom.getFullYear() === year && Math.floor(_filterFrom.getMonth() / 3) === q
      const bg = isSelected ? 'var(--teal-light, #f0fdfa)' : 'transparent'
      const fg = isSelected ? 'var(--teal)' : '#0f172a'
      const border = isSelected ? '1.5px solid var(--teal)' : '1px solid #e2e8f0'
      quarters.push(`<button onclick="window._reportsSetQuarter(${year}, ${q})" style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;background:${bg};color:${fg};border:${border};transition:all 0.15s">${label}</button>`)
    }
    quarterPicker = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">${quarters.join('')}</div>`
  }

  // Custom picker — 2 input date
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

  // Active range display
  const rangeDisplay = (_filterFrom && _filterTo)
    ? `${_filterFrom.toLocaleDateString('vi-VN')} → ${_filterTo.toLocaleDateString('vi-VN')}`
    : 'Chưa chọn'

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a">📅 Khoảng thời gian báo cáo</h3>
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

// ── Render: Card "Số lượng TN theo loại" ──────────────────
async function renderTypeCountCard() {
  const card = document.getElementById('report-type-count-card')
  if (!card) return

  const cache = window.cache || {}
  const hydro = _filterByDate(vals(cache.hydro))
  const electrode = _filterByDate(vals(cache.electrode))
  const electrochem = _filterByDate(vals(cache.electrochem))
  const total = hydro.length + electrode.length + electrochem.length

  // Header + summary numbers
  const summaryHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a">🧪 Số lượng thí nghiệm theo loại</h3>
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
  card.innerHTML = summaryHTML

  // Empty state — skip Chart.js
  if (total === 0) {
    const wrapper = card.querySelector('canvas').parentElement
    wrapper.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:13px;text-align:center">
      Không có thí nghiệm nào trong khoảng thời gian đã chọn
    </div>`
    return
  }

  // Render chart bar (mỗi loại 1 cột)
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

// ── Public API ────────────────────────────────────────────
export function renderReports() {
  _initDefaultRange()
  renderDatePicker()
  renderTypeCountCard()
}

// ── Window handlers (HTML inline onclick) ─────────────────
if (typeof window !== 'undefined') {
  window._reportsSetMode = function(mode) {
    _filterMode = mode
    // Reset range theo mode mới
    const now = new Date()
    if (mode === 'month') {
      _filterFrom = startOfMonth(now)
      _filterTo = endOfMonth(now)
    } else if (mode === 'quarter') {
      _filterFrom = startOfQuarter(now)
      _filterTo = endOfQuarter(now)
    }
    // Custom: giữ nguyên _filterFrom/_filterTo (cho user tự chọn)
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
      // Swap nếu user nhập ngược
      _filterFrom = to
      _filterTo = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59, 999)
    } else {
      _filterFrom = from
      _filterTo = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)
    }
    renderTypeCountCard()  // chỉ re-render data card, không re-render picker (giữ input focus)
  }
}

// ── Auto re-render khi data hoặc theme thay đổi ───────────
window.addEventListener('cache-update', (e) => {
  const col = e.detail?.col
  if (!['hydro', 'electrode', 'electrochem'].includes(col)) return
  // Chỉ re-render nếu đang ở page Reports
  const reportsPage = document.getElementById('page-reports')
  if (reportsPage && reportsPage.classList.contains('active')) {
    renderTypeCountCard()
  }
})

window.addEventListener('themechange', () => {
  const reportsPage = document.getElementById('page-reports')
  if (reportsPage && reportsPage.classList.contains('active')) {
    renderReports()
  }
})
