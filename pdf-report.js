/**
 * services/pdf-report.js (v3 — pdfMake)
 *
 * Xuất báo cáo PDF hàng tháng dùng pdfMake (text-based PDF, layout chính xác)
 *
 * Ưu điểm so với v2 (html2canvas):
 *  - File nhỏ (50-200KB thay vì 500KB-2MB)
 *  - Text selectable, search được trong PDF
 *  - Layout chính xác do pdfMake tự tính, không bị crop
 *  - Tiếng Việt đầy đủ qua font Roboto built-in
 *
 * Phụ thuộc:
 *  - pdfmake (cài thêm: npm install pdfmake)
 *  - cache.bookings, cache.equipment, cache.chemicals qua window.cache
 *  - showToast qua window.showToast
 */

import { vals } from '../utils/format.js'

// ─── Public API ──────────────────────────────────────────────────
export function initPdfReport() {
  window.openPdfReportModal = openPdfReportModal
  window.generatePdfReport = generatePdfReport
  console.log('[pdf-report v3] Loaded (pdfMake)')
}

// ─── Modal UI ────────────────────────────────────────────────────
function openPdfReportModal() {
  const auth = window.currentAuth
  if (!auth?.uid) {
    window.showToast?.('Bạn cần đăng nhập để xuất báo cáo', 'danger')
    return
  }

  const isAdmin = auth.isAdmin || auth.role === 'admin' || auth.role === 'superadmin'

  let modal = document.getElementById('modal-pdf-report')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'modal-pdf-report'
    modal.className = 'modal-overlay'
    modal.innerHTML = buildModalHTML(isAdmin)
    document.body.appendChild(modal)

    modal.querySelector('.modal-close')?.addEventListener('click', () => {
      modal.classList.remove('open')
    })
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open')
    })
  }

  const now = new Date()
  modal.querySelector('#pdf-year').value = now.getFullYear()
  modal.querySelector('#pdf-month').value = now.getMonth() + 1

  modal.classList.add('open')
}

function buildModalHTML(isAdmin) {
  const currentYear = new Date().getFullYear()
  const yearOptions = []
  for (let y = currentYear; y >= currentYear - 3; y--) {
    yearOptions.push(`<option value="${y}">${y}</option>`)
  }
  const monthOptions = []
  for (let m = 1; m <= 12; m++) {
    monthOptions.push(`<option value="${m}">Tháng ${m}</option>`)
  }

  return `
    <div class="modal" style="width:min(560px,95vw)">
      <div class="modal-header">
        <div class="modal-title">📄 Xuất báo cáo PDF</div>
        <button class="modal-close" type="button" aria-label="Đóng">×</button>
      </div>

      <div class="form-section" style="margin-bottom:14px">
        <div class="form-section-title">Kỳ báo cáo</div>
        <div style="display:flex;gap:10px;align-items:flex-end">
          <div class="form-group" style="flex:1">
            <label>Tháng</label>
            <select id="pdf-month">${monthOptions.join('')}</select>
          </div>
          <div class="form-group" style="flex:1">
            <label>Năm</label>
            <select id="pdf-year">${yearOptions.join('')}</select>
          </div>
        </div>
      </div>

      <div class="form-section" style="margin-bottom:14px">
        <div class="form-section-title">Nội dung báo cáo</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px">
            <input type="checkbox" id="pdf-sec-overview" checked>
            <span style="font-size:13px">Tổng quan thống kê</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px">
            <input type="checkbox" id="pdf-sec-bookings" checked>
            <span style="font-size:13px">Danh sách đăng ký trong tháng</span>
          </label>
          ${isAdmin ? `
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px">
            <input type="checkbox" id="pdf-sec-top-equipment" checked>
            <span style="font-size:13px">Top thiết bị sử dụng nhiều nhất</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px">
            <input type="checkbox" id="pdf-sec-top-members" checked>
            <span style="font-size:13px">Top thành viên hoạt động</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px">
            <input type="checkbox" id="pdf-sec-chemicals">
            <span style="font-size:13px">Hóa chất nhập trong tháng</span>
          </label>
          ` : `
          <input type="hidden" id="pdf-sec-top-equipment">
          <input type="hidden" id="pdf-sec-top-members">
          <input type="hidden" id="pdf-sec-chemicals">
          `}
        </div>
      </div>

      <div class="form-section" style="margin-bottom:14px">
        <div class="form-section-title">Định dạng</div>
        <div style="display:flex;gap:10px">
          <label style="flex:1;display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px">
            <input type="radio" name="pdf-orient" value="portrait" checked>
            <div>
              <div style="font-size:13px;font-weight:600">A4 dọc</div>
              <div style="font-size:11px;color:var(--text-3)">Chuẩn báo cáo</div>
            </div>
          </label>
          <label style="flex:1;display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px">
            <input type="radio" name="pdf-orient" value="landscape">
            <div>
              <div style="font-size:13px;font-weight:600">A4 ngang</div>
              <div style="font-size:11px;color:var(--text-3)">Bảng nhiều cột</div>
            </div>
          </label>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn" type="button" onclick="document.getElementById('modal-pdf-report').classList.remove('open')">Đóng</button>
        <button class="btn btn-primary" type="button" id="pdf-export-btn" onclick="window.generatePdfReport()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:4px">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Xuất PDF
        </button>
      </div>
    </div>
  `
}

// ─── Generate PDF ────────────────────────────────────────────────
async function generatePdfReport() {
  const auth = window.currentAuth
  if (!auth?.uid) return

  const isAdmin = auth.isAdmin || auth.role === 'admin' || auth.role === 'superadmin'
  const modal = document.getElementById('modal-pdf-report')
  const btn = document.getElementById('pdf-export-btn')

  const year = parseInt(modal.querySelector('#pdf-year').value, 10)
  const month = parseInt(modal.querySelector('#pdf-month').value, 10)
  const orientation = modal.querySelector('input[name="pdf-orient"]:checked').value

  const sections = {
    overview: modal.querySelector('#pdf-sec-overview')?.checked ?? true,
    bookings: modal.querySelector('#pdf-sec-bookings')?.checked ?? true,
    topEquipment: isAdmin ? (modal.querySelector('#pdf-sec-top-equipment')?.checked ?? true) : false,
    topMembers: isAdmin ? (modal.querySelector('#pdf-sec-top-members')?.checked ?? true) : false,
    chemicals: isAdmin ? (modal.querySelector('#pdf-sec-chemicals')?.checked ?? false) : false,
  }

  if (!Object.values(sections).some(v => v)) {
    window.showToast?.('Vui lòng chọn ít nhất 1 nội dung báo cáo', 'danger')
    return
  }

  if (btn) {
    btn.disabled = true
    btn.style.opacity = '0.6'
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin-right:6px;vertical-align:middle"></span> Đang xuất...'
  }

  try {
    // Lazy load pdfMake
    const pdfMake = await loadPdfMake()

    const data = computeReportData(year, month, isAdmin, auth.uid)
    const docDefinition = buildDocDefinition(data, sections, orientation, isAdmin)

    const filename = `labbook-baocao-${year}-${String(month).padStart(2, '0')}.pdf`
    pdfMake.createPdf(docDefinition).download(filename)

    window.showToast?.(`Đã xuất báo cáo tháng ${month}/${year}`, 'success')
    modal.classList.remove('open')
  } catch (e) {
    console.error('[pdf-report] Error:', e)
    window.showToast?.('Lỗi: ' + e.message, 'danger')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.style.opacity = ''
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:4px">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Xuất PDF
      `
    }
  }
}

// ─── Lazy load pdfMake (chỉ load khi user click "Xuất PDF") ──────
let _pdfMakeCache = null
async function loadPdfMake() {
  if (_pdfMakeCache) return _pdfMakeCache

  // pdfmake/build/pdfmake và pdfmake/build/vfs_fonts là 2 file riêng
  const pdfMakeModule = await import('pdfmake/build/pdfmake.js')
  const pdfFontsModule = await import('pdfmake/build/vfs_fonts.js')

  const pdfMake = pdfMakeModule.default || pdfMakeModule
  const pdfFonts = pdfFontsModule.default || pdfFontsModule

  // Setup fonts (Roboto built-in - hỗ trợ Unicode tiếng Việt)
  if (pdfFonts.pdfMake?.vfs) {
    pdfMake.vfs = pdfFonts.pdfMake.vfs
  } else if (pdfFonts.vfs) {
    pdfMake.vfs = pdfFonts.vfs
  }

  _pdfMakeCache = pdfMake
  return pdfMake
}

// ─── Compute report data (giữ nguyên từ v2) ──────────────────────
function computeReportData(year, month, isAdmin, currentUid) {
  const cache = window.cache || {}
  const allBookings = vals(cache.bookings || {})
  const chemicals = vals(cache.chemicals || {})

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

  let monthBookings = allBookings.filter(b => {
    if (!b.date) return false
    return b.date >= monthStart && b.date < nextMonth
  })

  if (!isAdmin) {
    monthBookings = monthBookings.filter(b => b.userId === currentUid)
  }

  const stats = {
    total: monthBookings.length,
    pending: monthBookings.filter(b => b.status === 'pending').length,
    approved: monthBookings.filter(b => b.status === 'approved').length,
    inUse: monthBookings.filter(b => b.status === 'in-use').length,
    completed: monthBookings.filter(b => b.status === 'completed').length,
    rejected: monthBookings.filter(b => b.status === 'rejected').length,
    cancelled: monthBookings.filter(b => b.status === 'cancelled').length,
    totalHours: monthBookings.reduce((sum, b) => {
      if (!b.startTime || !b.endTime) return sum
      const [sh, sm] = b.startTime.split(':').map(Number)
      const [eh, em] = b.endTime.split(':').map(Number)
      const hours = (eh + em / 60) - (sh + sm / 60)
      return sum + Math.max(0, hours)
    }, 0),
  }

  const equipmentUsage = {}
  monthBookings.forEach(b => {
    if (!['rejected', 'cancelled'].includes(b.status)) {
      const key = b.equipmentKey
      if (!key) return
      equipmentUsage[key] = equipmentUsage[key] || { count: 0, name: b.equipmentName, hours: 0 }
      equipmentUsage[key].count++
      if (b.startTime && b.endTime) {
        const [sh, sm] = b.startTime.split(':').map(Number)
        const [eh, em] = b.endTime.split(':').map(Number)
        equipmentUsage[key].hours += Math.max(0, (eh + em / 60) - (sh + sm / 60))
      }
    }
  })
  const topEquipment = Object.values(equipmentUsage).sort((a, b) => b.count - a.count).slice(0, 10)

  const memberUsage = {}
  monthBookings.forEach(b => {
    if (!['rejected', 'cancelled'].includes(b.status)) {
      const uid = b.userId || 'unknown'
      memberUsage[uid] = memberUsage[uid] || { count: 0, name: b.userName, hours: 0 }
      memberUsage[uid].count++
      if (b.startTime && b.endTime) {
        const [sh, sm] = b.startTime.split(':').map(Number)
        const [eh, em] = b.endTime.split(':').map(Number)
        memberUsage[uid].hours += Math.max(0, (eh + em / 60) - (sh + sm / 60))
      }
    }
  })
  const topMembers = Object.values(memberUsage).sort((a, b) => b.count - a.count).slice(0, 10)

  const monthChemicals = chemicals.filter(c => {
    const created = c.createdAt || c.dateAdded || ''
    return created >= monthStart && created < nextMonth
  })

  return {
    year, month,
    bookings: monthBookings.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    stats, topEquipment, topMembers,
    chemicals: monthChemicals,
    isAdmin,
    currentUserName: window.currentAuth?.displayName || window.currentUser || '',
  }
}

// ─── Build pdfMake docDefinition ─────────────────────────────────
function buildDocDefinition(data, sections, orientation, isAdmin) {
  const monthName = `Tháng ${data.month}/${data.year}`
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

  const content = []

  // ─── Header ───
  content.push({
    columns: [
      [
        { text: 'LABBOOK BKU', style: 'overline' },
        { text: `Báo cáo ${monthName}`, style: 'h1', margin: [0, 4, 0, 4] },
        {
          text: isAdmin ? 'Báo cáo tổng hợp toàn hệ thống' : `Báo cáo cá nhân — ${data.currentUserName}`,
          style: 'subtitle',
        },
      ],
      {
        stack: [
          { text: 'Ngày xuất', style: 'caption', alignment: 'right' },
          { text: dateStr, style: 'datestamp', alignment: 'right', margin: [0, 2, 0, 0] },
        ],
        width: 100,
      },
    ],
  })

  // Divider line teal
  content.push({
    canvas: [
      { type: 'line', x1: 0, y1: 4, x2: orientation === 'portrait' ? 515 : 770, y2: 4, lineWidth: 2, lineColor: '#0d9488' },
    ],
    margin: [0, 8, 0, 16],
  })

  // ─── Section: Overview ───
  if (sections.overview) {
    content.push({ text: 'Tổng quan thống kê', style: 'h2' })
    content.push(buildOverviewTable(data.stats))
    content.push({ text: '', margin: [0, 0, 0, 14] })
  }

  // ─── Section: Top Equipment ───
  if (sections.topEquipment && data.topEquipment.length > 0) {
    content.push({ text: 'Top thiết bị sử dụng nhiều nhất', style: 'h2' })
    content.push(buildTopEquipmentTable(data.topEquipment))
    content.push({ text: '', margin: [0, 0, 0, 14] })
  }

  // ─── Section: Top Members ───
  if (sections.topMembers && data.topMembers.length > 0) {
    content.push({ text: 'Top thành viên hoạt động', style: 'h2' })
    content.push(buildTopMembersTable(data.topMembers))
    content.push({ text: '', margin: [0, 0, 0, 14] })
  }

  // ─── Section: Bookings ───
  if (sections.bookings) {
    content.push({ text: `Danh sách đăng ký trong tháng (${data.bookings.length})`, style: 'h2' })
    content.push(buildBookingsTable(data.bookings, orientation))
    content.push({ text: '', margin: [0, 0, 0, 14] })
  }

  // ─── Section: Chemicals ───
  if (sections.chemicals && data.chemicals.length > 0) {
    content.push({ text: `Hóa chất nhập trong tháng (${data.chemicals.length})`, style: 'h2' })
    content.push(buildChemicalsTable(data.chemicals))
  }

  return {
    pageSize: 'A4',
    pageOrientation: orientation,
    pageMargins: [40, 40, 40, 50],
    content,
    footer: function(currentPage, pageCount) {
      return {
        columns: [
          { text: `Generated by LabBook BKU — labbook-bku.web.app`, style: 'footer', margin: [40, 0, 0, 0] },
          { text: `Trang ${currentPage}/${pageCount}`, style: 'footer', alignment: 'right', margin: [0, 0, 40, 0] },
        ],
      }
    },
    styles: {
      overline: {
        fontSize: 9,
        color: '#94a3b8',
        bold: true,
        characterSpacing: 1.5,
      },
      h1: {
        fontSize: 22,
        bold: true,
        color: '#0f172a',
      },
      h2: {
        fontSize: 13,
        bold: true,
        color: '#0f172a',
        margin: [0, 0, 0, 8],
      },
      subtitle: {
        fontSize: 11,
        color: '#475569',
      },
      caption: {
        fontSize: 9,
        color: '#94a3b8',
      },
      datestamp: {
        fontSize: 11,
        bold: true,
        color: '#0f172a',
      },
      footer: {
        fontSize: 9,
        color: '#94a3b8',
      },
      tableHeader: {
        fontSize: 10,
        bold: true,
        color: '#334155',
        fillColor: '#f7f9fc',
      },
      tableCell: {
        fontSize: 10,
        color: '#0f172a',
      },
      statLabel: {
        fontSize: 8.5,
        bold: true,
        color: '#64748b',
        characterSpacing: 0.3,
      },
      statValue: {
        fontSize: 18,
        bold: true,
      },
      badge: {
        fontSize: 9,
        bold: true,
        alignment: 'center',
      },
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: '#0f172a',
    },
  }
}

// ─── Build Overview cards (2 rows × 4 cards) ─────────────────────
function buildOverviewTable(stats) {
  const cards = [
    { label: 'TỔNG ĐĂNG KÝ', value: String(stats.total), color: '#0d9488', bg: '#f0fdfa' },
    { label: 'HOÀN THÀNH', value: String(stats.completed), color: '#047857', bg: '#ecfdf5' },
    { label: 'ĐÃ DUYỆT', value: String(stats.approved), color: '#1e40af', bg: '#eff6ff' },
    { label: 'CHỜ DUYỆT', value: String(stats.pending), color: '#b45309', bg: '#fffbeb' },
    { label: 'ĐANG DÙNG', value: String(stats.inUse), color: '#0891b2', bg: '#ecfeff' },
    { label: 'BỊ TỪ CHỐI', value: String(stats.rejected), color: '#b91c1c', bg: '#fef2f2' },
    { label: 'ĐÃ HỦY', value: String(stats.cancelled), color: '#6366f1', bg: '#eef2ff' },
    { label: 'TỔNG GIỜ DÙNG', value: stats.totalHours.toFixed(1) + 'h', color: '#0d9488', bg: '#f0fdfa' },
  ]

  const makeCard = (c) => ({
    stack: [
      { text: c.label, style: 'statLabel' },
      { text: c.value, style: 'statValue', color: c.color, margin: [0, 4, 0, 0] },
    ],
    fillColor: c.bg,
    margin: [8, 8, 8, 8],
  })

  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        cards.slice(0, 4).map(makeCard),
        cards.slice(4, 8).map(makeCard),
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 4,
      paddingLeft: () => 0,
      paddingRight: () => 4,
    },
  }
}

function buildTopEquipmentTable(items) {
  return {
    table: {
      headerRows: 1,
      widths: [30, '*', 60, 60],
      body: [
        [
          { text: '#', style: 'tableHeader' },
          { text: 'Thiết bị', style: 'tableHeader' },
          { text: 'Số lần', style: 'tableHeader', alignment: 'right' },
          { text: 'Tổng giờ', style: 'tableHeader', alignment: 'right' },
        ],
        ...items.map((e, i) => [
          { text: `#${i + 1}`, style: 'tableCell', color: '#0d9488', bold: true },
          { text: e.name || '', style: 'tableCell' },
          { text: String(e.count), style: 'tableCell', alignment: 'right', bold: true },
          { text: e.hours.toFixed(1) + 'h', style: 'tableCell', alignment: 'right', color: '#475569' },
        ]),
      ],
    },
    layout: zebraTableLayout(),
  }
}

function buildTopMembersTable(items) {
  return {
    table: {
      headerRows: 1,
      widths: [30, '*', 70, 60],
      body: [
        [
          { text: '#', style: 'tableHeader' },
          { text: 'Thành viên', style: 'tableHeader' },
          { text: 'Số đăng ký', style: 'tableHeader', alignment: 'right' },
          { text: 'Tổng giờ', style: 'tableHeader', alignment: 'right' },
        ],
        ...items.map((m, i) => [
          { text: `#${i + 1}`, style: 'tableCell', color: '#0d9488', bold: true },
          { text: m.name || '', style: 'tableCell' },
          { text: String(m.count), style: 'tableCell', alignment: 'right', bold: true },
          { text: m.hours.toFixed(1) + 'h', style: 'tableCell', alignment: 'right', color: '#475569' },
        ]),
      ],
    },
    layout: zebraTableLayout(),
  }
}

function buildBookingsTable(bookings, orientation) {
  if (bookings.length === 0) {
    return {
      text: 'Không có đăng ký nào trong tháng',
      alignment: 'center',
      color: '#94a3b8',
      fontSize: 11,
      margin: [0, 16, 0, 16],
      fillColor: '#f8fafc',
    }
  }

  const STATUS_LABEL = {
    'pending': 'Chờ duyệt', 'approved': 'Đã duyệt', 'in-use': 'Đang dùng',
    'completed': 'Hoàn thành', 'rejected': 'Từ chối', 'cancelled': 'Đã hủy',
  }
  const STATUS_COLOR = {
    'pending': { bg: '#fef3c7', fg: '#b45309' },
    'approved': { bg: '#dbeafe', fg: '#1e40af' },
    'in-use': { bg: '#cffafe', fg: '#0891b2' },
    'completed': { bg: '#d1fae5', fg: '#047857' },
    'rejected': { bg: '#fee2e2', fg: '#b91c1c' },
    'cancelled': { bg: '#eef2ff', fg: '#6366f1' },
  }

  const formatDate = (d) => {
    if (!d) return ''
    const [y, m, dd] = d.split('-')
    return `${dd}/${m}/${y}`
  }

  const showPurpose = orientation === 'landscape'

  // Header
  const headerRow = [
    { text: 'Ngày', style: 'tableHeader' },
    { text: 'Giờ', style: 'tableHeader' },
    { text: 'Thiết bị', style: 'tableHeader' },
    { text: 'Người đăng ký', style: 'tableHeader' },
  ]
  if (showPurpose) headerRow.push({ text: 'Mục đích', style: 'tableHeader' })
  headerRow.push({ text: 'Trạng thái', style: 'tableHeader', alignment: 'center' })

  const rows = bookings.map(b => {
    const sc = STATUS_COLOR[b.status] || { bg: '#f1f5f9', fg: '#475569' }
    const row = [
      { text: formatDate(b.date), style: 'tableCell', noWrap: true },
      { text: `${b.startTime || ''}-${b.endTime || ''}`, style: 'tableCell', noWrap: true },
      { text: b.equipmentName || '', style: 'tableCell' },
      { text: b.userName || '', style: 'tableCell' },
    ]
    if (showPurpose) {
      row.push({ text: (b.purpose || '').substring(0, 50), style: 'tableCell', color: '#475569' })
    }
    row.push({
      text: STATUS_LABEL[b.status] || b.status,
      style: 'badge',
      color: sc.fg,
      fillColor: sc.bg,
    })
    return row
  })

  // Widths tự động co dãn cho 5/6 cột
  const widths = showPurpose
    ? [50, 60, '*', '*', '*', 65]
    : [55, 65, '*', '*', 65]

  return {
    table: {
      headerRows: 1,
      widths,
      body: [headerRow, ...rows],
    },
    layout: zebraTableLayout(),
  }
}

function buildChemicalsTable(chemicals) {
  return {
    table: {
      headerRows: 1,
      widths: ['*', 80, 50, 40, 65],
      body: [
        [
          { text: 'Tên hóa chất', style: 'tableHeader' },
          { text: 'Công thức', style: 'tableHeader' },
          { text: 'Số lượng', style: 'tableHeader', alignment: 'right' },
          { text: 'Đơn vị', style: 'tableHeader' },
          { text: 'Hạn SD', style: 'tableHeader' },
        ],
        ...chemicals.map(c => [
          { text: c.name || '', style: 'tableCell' },
          { text: c.formula || '', style: 'tableCell' },
          { text: String(c.stock || c.quantity || '—'), style: 'tableCell', alignment: 'right' },
          { text: c.unit || '', style: 'tableCell', color: '#475569' },
          { text: c.expiry || c.expiryDate || '—', style: 'tableCell' },
        ]),
      ],
    },
    layout: zebraTableLayout(),
  }
}

// Layout cho table có zebra striping + viền nhẹ
function zebraTableLayout() {
  return {
    fillColor: (rowIndex) => {
      if (rowIndex === 0) return null  // Header có fillColor riêng
      return rowIndex % 2 === 0 ? '#fafbfc' : null
    },
    hLineWidth: (i, node) => {
      if (i === 0 || i === node.table.body.length) return 0  // Bỏ viền đầu/cuối
      if (i === 1) return 1.5  // Viền dưới header dày hơn
      return 0.5
    },
    vLineWidth: () => 0,
    hLineColor: (i) => i === 1 ? '#cbd5e1' : '#f1f5f9',
    paddingTop: () => 5,
    paddingBottom: () => 5,
    paddingLeft: () => 8,
    paddingRight: () => 8,
  }
}
