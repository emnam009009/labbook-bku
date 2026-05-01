/**
 * services/booking-suggestions.js
 * Gợi ý slot trống tự động cho booking
 *
 * Tính năng:
 *  - Hook vào openBookingModal: inject UI "Tìm slot tự động" vào đầu modal
 *  - User input: thiết bị + thời lượng + khoảng ngày
 *  - Algorithm: scan bookings có sẵn, tìm gap đủ thời lượng trong giờ làm việc
 *  - User click 1 slot → auto-fill form đặt lịch
 *
 * Phụ thuộc:
 *  - cache.bookings, cache.equipment qua window.cache
 *  - Modal có sẵn: 'modal-booking', form fields 'bk-equipment', 'bk-date', 'bk-start', 'bk-end'
 *  - showToast qua window.showToast
 */

import { vals, escapeHtml } from '../utils/format.js'

// Giờ làm việc (mặc định, có thể chuyển sang config sau)
const WORK_HOUR_START = 7   // 07:00
const WORK_HOUR_END = 22    // 22:00
const SLOT_GRANULARITY = 30 // phút - bước nhảy slot

// ─── Init: hook vào openBookingModal ──────────────────────────────
export function initBookingSuggestions() {
  // Wait for openBookingModal to exist on window
  const wait = setInterval(() => {
    if (typeof window.openBookingModal === 'function') {
      clearInterval(wait)
      wrapOpenBookingModal()
    }
  }, 100)
  // Timeout sau 10s nếu không tìm thấy
  setTimeout(() => clearInterval(wait), 10000)
}

function wrapOpenBookingModal() {
  const original = window.openBookingModal
  window.openBookingModal = function() {
    original.apply(this, arguments)
    // Sau khi modal mở, inject suggestions UI
    setTimeout(injectSuggestionsUI, 100)
  }
  console.log('[booking-suggestions] Hooked openBookingModal')
}

// ─── Inject UI vào đầu modal ──────────────────────────────────────
function injectSuggestionsUI() {
  const modal = document.getElementById('modal-booking')
  if (!modal) return

  // Đã inject rồi? skip
  if (modal.querySelector('#bk-suggest-section')) return

  // Tìm modal body (hoặc form)
  const modalBody = modal.querySelector('.modal-body') || modal.querySelector('form') || modal
  const firstChild = modalBody.firstElementChild

  // Build UI section
  const section = document.createElement('div')
  section.id = 'bk-suggest-section'
  section.style.cssText = `
    background: linear-gradient(135deg, var(--teal-light), #ecfeff);
    border: 1.5px solid var(--teal-3);
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 16px;
    position: relative;
  `
  section.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <div style="font-size:13px;font-weight:600;color:var(--teal);flex:1">Tìm slot trống tự động</div>
      <button type="button" id="bk-suggest-toggle" style="background:transparent;border:none;color:var(--text-3);cursor:pointer;font-size:11px;padding:4px 8px;border-radius:6px" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'">
        Ẩn ▲
      </button>
    </div>

    <div id="bk-suggest-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;font-weight:500;color:var(--text-2);display:block;margin-bottom:4px">Thời lượng cần</label>
          <select id="bk-suggest-duration" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:20px;font-size:12.5px;background:white">
            <option value="30">30 phút</option>
            <option value="60" selected>1 giờ</option>
            <option value="90">1.5 giờ</option>
            <option value="120">2 giờ</option>
            <option value="180">3 giờ</option>
            <option value="240">4 giờ</option>
            <option value="360">6 giờ</option>
            <option value="480">8 giờ</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:500;color:var(--text-2);display:block;margin-bottom:4px">Khoảng tìm</label>
          <select id="bk-suggest-range" style="width:100%;padding:6px 10px;border:1.5px solid var(--border);border-radius:20px;font-size:12.5px;background:white">
            <option value="3">3 ngày tới</option>
            <option value="7" selected>1 tuần tới</option>
            <option value="14">2 tuần tới</option>
            <option value="30">1 tháng tới</option>
          </select>
        </div>
      </div>

      <button type="button" id="bk-suggest-find" style="width:100%;background:linear-gradient(135deg,var(--teal),var(--teal-2));color:white;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(13,148,136,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        Tìm slot trống
      </button>

      <div id="bk-suggest-results" style="margin-top:10px"></div>
    </div>
  `

  // Insert vào đầu modal body
  if (firstChild) {
    modalBody.insertBefore(section, firstChild)
  } else {
    modalBody.appendChild(section)
  }

  // Wire events
  document.getElementById('bk-suggest-find').addEventListener('click', handleFindSlots)
  document.getElementById('bk-suggest-toggle').addEventListener('click', toggleBody)
}

function toggleBody() {
  const body = document.getElementById('bk-suggest-body')
  const btn = document.getElementById('bk-suggest-toggle')
  if (!body || !btn) return
  if (body.style.display === 'none') {
    body.style.display = 'block'
    btn.textContent = 'Ẩn ▲'
  } else {
    body.style.display = 'none'
    btn.textContent = 'Hiện ▼'
  }
}

// ─── Handle: Find slots button click ──────────────────────────────
function handleFindSlots() {
  const equipmentKey = document.getElementById('bk-equipment')?.value
  const duration = parseInt(document.getElementById('bk-suggest-duration')?.value || '60', 10)
  const rangeDays = parseInt(document.getElementById('bk-suggest-range')?.value || '7', 10)
  const resultsEl = document.getElementById('bk-suggest-results')

  if (!equipmentKey) {
    if (window.showToast) window.showToast('Hãy chọn thiết bị trước', 'danger')
    if (resultsEl) resultsEl.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text-3);font-size:12px">⚠ Chọn thiết bị bên dưới rồi nhấn lại</div>'
    return
  }

  // Find slots
  const slots = findAvailableSlots(equipmentKey, duration, rangeDays)

  if (!slots.length) {
    resultsEl.innerHTML = `
      <div style="text-align:center;padding:14px;color:var(--text-3);font-size:12px;background:white;border-radius:8px">
        Không tìm thấy slot trống ${formatDuration(duration)} trong ${rangeDays} ngày tới<br>
        <span style="font-size:11px">Thử giảm thời lượng hoặc tăng khoảng tìm</span>
      </div>
    `
    return
  }

  // Render slots (top 10)
  const top = slots.slice(0, 10)
  let html = `<div style="font-size:11px;color:var(--text-2);margin-bottom:6px">Tìm thấy <strong style="color:var(--teal)">${slots.length}</strong> slot phù hợp${slots.length > 10 ? ' (hiển thị 10 đầu)' : ''}:</div>`
  html += '<div style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto">'
  top.forEach((slot, idx) => {
    const dayLabel = formatDayLabel(slot.date)
    const isToday = slot.date === todayISO()
    html += `
      <button type="button" data-slot-idx="${idx}" class="bk-suggest-slot" style="text-align:left;background:white;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:all 0.15s;font-family:inherit;font-size:12.5px;color:var(--text)" onmouseover="this.style.borderColor='var(--teal)';this.style.background='var(--teal-light)';this.style.transform='translateX(2px)'" onmouseout="this.style.borderColor='var(--border)';this.style.background='white';this.style.transform=''">
        <div style="background:${isToday ? 'var(--teal)' : 'var(--surface-3)'};color:${isToday ? 'white' : 'var(--text-2)'};padding:3px 8px;border-radius:6px;font-size:10.5px;font-weight:600;flex-shrink:0;min-width:60px;text-align:center">${dayLabel}</div>
        <div style="flex:1;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500">${slot.startTime} - ${slot.endTime}</div>
        <div style="font-size:10px;color:var(--text-3)">▶</div>
      </button>
    `
  })
  html += '</div>'
  resultsEl.innerHTML = html

  // Wire click → fill form
  resultsEl.querySelectorAll('.bk-suggest-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.slotIdx, 10)
      applySlot(top[idx])
    })
  })
}

// ─── Apply slot to form ───────────────────────────────────────────
function applySlot(slot) {
  const dateInput = document.getElementById('bk-date')
  const startInput = document.getElementById('bk-start')
  const endInput = document.getElementById('bk-end')

  if (dateInput) dateInput.value = slot.date
  if (startInput) startInput.value = slot.startTime
  if (endInput) endInput.value = slot.endTime

  if (window.showToast) {
    window.showToast(`Đã chọn ${formatDayLabel(slot.date)} ${slot.startTime}-${slot.endTime}`, 'success')
  }

  // Visual feedback: scroll xuống form chính
  const form = document.querySelector('#modal-booking .modal-body') || document.getElementById('modal-booking')
  if (form && dateInput) {
    setTimeout(() => {
      dateInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
      dateInput.style.transition = 'box-shadow 0.3s'
      dateInput.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.3)'
      setTimeout(() => { dateInput.style.boxShadow = '' }, 1500)
    }, 100)
  }
}

// ─── Algorithm: Find available slots ──────────────────────────────
function findAvailableSlots(equipmentKey, durationMin, rangeDays) {
  const cache = window.cache || {}
  const allBookings = vals(cache.bookings || {})
    .filter(b =>
      b.equipmentKey === equipmentKey &&
      !['rejected', 'cancelled'].includes(b.status)
    )

  const slots = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let dayOffset = 0; dayOffset < rangeDays; dayOffset++) {
    const date = new Date(today)
    date.setDate(date.getDate() + dayOffset)
    const iso = dateToISO(date)

    // Bookings của ngày này, sort theo startTime
    const dayBookings = allBookings
      .filter(b => b.date === iso)
      .map(b => ({
        startMin: timeToMinutes(b.startTime),
        endMin: timeToMinutes(b.endTime),
      }))
      .sort((a, b) => a.startMin - b.startMin)

    // Tìm khoảng trống trong giờ làm việc
    const workStart = WORK_HOUR_START * 60
    const workEnd = WORK_HOUR_END * 60

    // Nếu là hôm nay, không tìm slot trong quá khứ
    let cursorMin = workStart
    if (dayOffset === 0) {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      // Round up to next 30-min boundary
      cursorMin = Math.max(workStart, Math.ceil(nowMin / SLOT_GRANULARITY) * SLOT_GRANULARITY)
    }

    // Quét qua bookings, tìm gap đủ lớn
    for (const b of dayBookings) {
      // Nếu booking bắt đầu sau cursor + đủ duration → có gap
      if (b.startMin >= cursorMin + durationMin) {
        // Tạo slot tại cursor
        addSlotIfFits(slots, iso, cursorMin, durationMin, b.startMin)
      }
      // Move cursor
      cursorMin = Math.max(cursorMin, b.endMin)
    }

    // Sau booking cuối → có gap đến hết giờ làm việc
    if (cursorMin + durationMin <= workEnd) {
      addSlotIfFits(slots, iso, cursorMin, durationMin, workEnd)
    }
  }

  return slots
}

// Thêm slot vào list (có thể nhiều slot trong cùng 1 gap)
function addSlotIfFits(slots, iso, cursorMin, durationMin, gapEndMin) {
  // Tạo 1 slot bắt đầu tại cursor (slot tốt nhất trong gap)
  if (cursorMin + durationMin <= gapEndMin) {
    slots.push({
      date: iso,
      startTime: minutesToTime(cursorMin),
      endTime: minutesToTime(cursorMin + durationMin),
    })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────
function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutesToTime(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0')
  const m = String(min % 60).padStart(2, '0')
  return `${h}:${m}`
}

function dateToISO(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

function todayISO() {
  return dateToISO(new Date())
}

function formatDuration(min) {
  if (min < 60) return min + ' phút'
  if (min % 60 === 0) return (min / 60) + ' giờ'
  return Math.floor(min / 60) + 'h' + (min % 60) + 'p'
}

function formatDayLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((d - today) / (1000 * 60 * 60 * 24))

  if (diff === 0) return 'Hôm nay'
  if (diff === 1) return 'Mai'
  if (diff === 2) return 'Mốt'

  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  const dayName = dayNames[d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dayName} ${dd}/${mm}`
}
