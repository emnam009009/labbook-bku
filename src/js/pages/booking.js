/**
 * pages/booking.js — Đăng ký sử dụng thiết bị (v2)
 *
 * Phase 1: Render list, empty state, view toggle ✓
 * Phase 2: Save booking, conflict check, populate equipment dropdown ✓
 *
 * Status flow:
 *  pending → approved → in-use → completed
 *  pending → rejected
 *  pending/approved → cancelled
 */

import { vals, fuzzy, escapeHtml } from '../utils/format.js'
import { db, ref, update, remove, fbPush } from '../firebase.js'

// ═══════════════════════════════════════════════════
// RENDER LIST
// ═══════════════════════════════════════════════════
export function renderBooking() {
  const cache = window.cache;
  if (!cache) return;
  
  const tbody = document.getElementById('booking-tbody');
  if (!tbody) return;
  
  const bookings = vals(cache.bookings || {});
  const search = document.getElementById('booking-search')?.value?.trim() || '';
  const statusFilter = document.getElementById('booking-status-filter')?.value || '';
  
  // Filter values
  const equipmentFilter = document.getElementById('booking-equipment-filter')?.value || '';
  const mineFilter = document.getElementById('booking-mine-filter')?.value || 'all';
  const myUid = window.currentAuth?.uid;
  
  // Populate equipment filter dropdown (lần đầu hoặc khi cache equipment update)
  populateEquipmentFilter();
  
  let rows = bookings;
  if (search) {
    rows = rows.filter(r =>
      [r.equipmentName, r.userName, r.purpose, r.code].some(v => fuzzy(v || '', search))
    );
  }
  if (statusFilter) {
    rows = rows.filter(r => r.status === statusFilter);
  }
  if (equipmentFilter) {
    rows = rows.filter(r => r.equipmentKey === equipmentFilter);
  }
  if (mineFilter === 'mine' && myUid) {
    rows = rows.filter(r => r.userId === myUid);
  }
  
  // Sort
  const sortKey = window._bookingSortKey || '';
  const sortDir = window._bookingSortDir || 'asc'; // 'asc' | 'desc'
  
  if (sortKey) {
    rows.sort((a, b) => {
      let va = a[sortKey] || '';
      let vb = b[sortKey] || '';
      // For date: format YYYY-MM-DD đã sortable string
      // For startTime: HH:MM cũng sortable string
      const cmp = String(va).localeCompare(String(vb), 'vi');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  } else {
    // Default sort: pending lên đầu, ngày desc
    const order = { 'pending': 0, 'approved': 1, 'in-use': 2, 'completed': 3, 'rejected': 4, 'cancelled': 5 };
    rows.sort((a, b) => {
      const sa = order[a.status] ?? 99;
      const sb = order[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return (b.date || '').localeCompare(a.date || '');
    });
  }
  
  // Update arrow indicators trên header
  updateSortIndicators();
  
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="99">' + emptyStateHTML() + '</td></tr>';
    return;
  }
  
  tbody.innerHTML = rows.map(renderRow).join('');
}

function renderRow(r) {
  const myUid = window.currentAuth?.uid;
  const isAdmin = window.currentAuth?.isAdmin;
  const isOwner = r.userId === myUid;
  
  const s = STATUS_MAP[r.status] || { label: r.status, bg: '#f1f5f9', fg: '#64748b' };
  // Tooltip cho rejected: hiển thị lý do
  const tooltip = (r.status === 'rejected' && r.rejectedReason)
    ? ` title="Lý do: ${escapeHtml(r.rejectedReason)}"`
    : '';
  const badge = `<span${tooltip} style="display:inline-block;padding:5px 12px;border-radius:999px;background:${s.bg};color:${s.fg};font-size:11.5px;font-weight:700;letter-spacing:0.02em;white-space:nowrap;cursor:${r.status === 'rejected' && r.rejectedReason ? 'help' : 'default'}">${s.label}</span>`;
  
  let actions = '';
  if (isAdmin && r.status === 'pending') {
    actions += `<button class="btn btn-xs btn-primary" onclick="window.approveBooking('${r._key}')" title="Duyệt">✓ Duyệt</button>`;
    actions += `<button class="btn btn-xs btn-danger" onclick="window.rejectBooking('${r._key}')" title="Từ chối">✕ Từ chối</button>`;
  }
  if (isOwner && r.status === 'approved') {
    actions += `<button class="btn btn-xs btn-primary" onclick="window.checkInBooking('${r._key}')" title="Check-in">▶ Check-in</button>`;
  }
  if (isOwner && r.status === 'in-use') {
    actions += `<button class="btn btn-xs btn-gold" onclick="window.checkOutBooking('${r._key}')" title="Check-out">■ Check-out</button>`;
  }
  // Hủy: chỉ approved (pending dùng Từ chối thay vì Hủy)
  if ((isOwner || isAdmin) && r.status === 'approved') {
    actions += `<button class="btn btn-xs btn-danger" onclick="window.cancelBooking('${r._key}')" title="Hủy">Hủy</button>`;
  }
  // Superadmin: nút Xóa cứng - CHỈ hiện khi đã có quyết định (không phải pending)
  const isSuperAdmin = window.currentAuth?.email === SUPER_ADMIN_EMAIL;
  if (isSuperAdmin && r.status !== 'pending') {
    actions += `<button class="del-btn" onclick="window.deleteBooking('${r._key}')" title="Xóa cứng" style="margin-left:4px"><svg class="w-4 h-4 fill-none stroke-white" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke-linejoin="round" stroke-linecap="round"></path></svg></button>`;
  }
  
  return `<tr>
    <td><strong style="font-family:'JetBrains Mono',monospace;font-size:12.5px;color:var(--text)">${escapeHtml(r.code || '')}</strong></td>
    <td>${escapeHtml(r.userName || '')}</td>
    <td>${escapeHtml(r.equipmentName || '')}</td>
    <td style="text-align:center">${formatDate(r.date)}</td>
    <td style="text-align:center;font-family:'JetBrains Mono',monospace;font-size:12.5px">${escapeHtml(r.startTime || '')} - ${escapeHtml(r.endTime || '')}</td>
    <td style="font-size:12.5px;color:var(--text-2)">${escapeHtml(r.purpose || '')}${r.status === 'rejected' && r.rejectedReason ? `<div style="margin-top:4px;font-size:11.5px;color:var(--danger);font-style:italic">⚠ ${escapeHtml(r.rejectedReason)}</div>` : ''}</td>
    <td style="text-align:center">${badge}</td>
    <td class="action-cell">${actions}</td>
  </tr>`;
}

const SUPER_ADMIN_EMAIL = 'nvhn.7202@gmail.com';

const STATUS_MAP = {
  'pending':   { label: 'Chờ duyệt',   bg: 'rgba(245,158,11,0.15)',  fg: '#b45309' },
  'approved':  { label: 'Đã duyệt',    bg: 'rgba(59,130,246,0.15)',  fg: '#1e40af' },
  'in-use':    { label: 'Đang dùng',   bg: 'rgba(16,185,129,0.15)',  fg: '#047857' },
  'completed': { label: 'Hoàn thành',  bg: 'rgba(100,116,139,0.15)', fg: '#475569' },
  'rejected':  { label: 'Từ chối',     bg: 'rgba(239,68,68,0.15)',   fg: '#b91c1c' },
  'cancelled': { label: 'Đã hủy',      bg: 'rgba(148,163,184,0.15)', fg: '#64748b' },
};

function formatDate(d) {
  if (!d || !d.includes('-')) return d || '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function emptyStateHTML() {
  const icon = '<svg class="empty-state-icon" viewBox="0 0 64 64" fill="none">' +
    '<rect x="8" y="14" width="48" height="42" rx="4" fill="var(--teal-light)" stroke="var(--teal)" stroke-width="2"/>' +
    '<line x1="8" y1="24" x2="56" y2="24" stroke="var(--teal)" stroke-width="2"/>' +
    '<rect x="14" y="6" width="3" height="12" rx="1" fill="var(--teal)"/>' +
    '<rect x="47" y="6" width="3" height="12" rx="1" fill="var(--teal)"/>' +
    '<circle cx="32" cy="38" r="4" fill="none" stroke="var(--teal)" stroke-width="2"/>' +
    '</svg>';
  return '<div class="empty-state">' +
    '<div class="empty-state-icon-wrap">' + icon + '<span class="badge-dot"></span></div>' +
    '<div class="empty-state-text">Chưa có đăng ký nào</div>' +
    '<div class="empty-state-sub">Bắt đầu đặt lịch sử dụng thiết bị</div>' +
    '<button class="empty-state-btn member-only" onclick="window.openBookingModal()">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        'Đăng ký mới' +
    '</button>' +
    '</div>';
}

// ═══════════════════════════════════════════════════
// VIEW TOGGLE (List / Calendar)
// ═══════════════════════════════════════════════════
window.switchBookingView = function(view) {
  const listEl = document.getElementById('booking-list-view');
  const calEl = document.getElementById('booking-cal-view');
  const dayEl = document.getElementById('booking-day-view');
  const tabList = document.getElementById('bk-tab-list');
  const tabCal = document.getElementById('bk-tab-cal');
  const tabDay = document.getElementById('bk-tab-day');
  const setActive = (btn, isActive) => {
    if (!btn) return;
    btn.classList.toggle('active', isActive);
    btn.style.background = isActive ? 'linear-gradient(135deg,var(--teal),var(--teal-2))' : 'transparent';
    btn.style.boxShadow = isActive ? '0 2px 6px rgba(13,148,136,0.3)' : 'none';
    btn.style.color = isActive ? 'white' : 'var(--text-2)';
  };
  
  if (listEl) listEl.style.display = 'none';
  if (calEl) calEl.style.display = 'none';
  if (dayEl) dayEl.style.display = 'none';
  setActive(tabList, false);
  setActive(tabCal, false);
  setActive(tabDay, false);
  
  if (view === 'calendar') {
    if (calEl) calEl.style.display = 'block';
    setActive(tabCal, true);
    renderCalendar();
  } else {
    if (listEl) listEl.style.display = 'block';
    setActive(tabList, true);
  }
};
  

// ═══════════════════════════════════════════════════
// SORT BY HEADER
// ═══════════════════════════════════════════════════
window.toggleBookingSort = function(key) {
  if (window._bookingSortKey === key) {
    // Same key: toggle asc → desc → reset
    if (window._bookingSortDir === 'asc') {
      window._bookingSortDir = 'desc';
    } else {
      // Reset
      window._bookingSortKey = '';
      window._bookingSortDir = 'asc';
    }
  } else {
    // New key: start asc
    window._bookingSortKey = key;
    window._bookingSortDir = 'asc';
  }
  renderBooking();
};

function updateSortIndicators() {
  document.querySelectorAll('.bk-sortable').forEach(th => {
    const key = th.dataset.sort;
    const arrow = th.querySelector('.bk-sort-arrow');
    if (!arrow) return;
    if (window._bookingSortKey === key) {
      arrow.textContent = window._bookingSortDir === 'asc' ? ' ▲' : ' ▼';
      arrow.style.color = 'var(--teal)';
    } else {
      arrow.textContent = '';
    }
  });
}

// ═══════════════════════════════════════════════════
// MODAL: Open + populate equipment dropdown
// ═══════════════════════════════════════════════════
window.openBookingModal = function() {
  const modal = document.getElementById('modal-booking');
  if (!modal) {
    window.showToast?.('Modal chưa được khởi tạo', 'danger');
    return;
  }
  
  // Reset form
  document.getElementById('bk-equipment').value = '';
  document.getElementById('bk-date').value = todayISO();
  document.getElementById('bk-start').value = '08:00';
  document.getElementById('bk-end').value = '10:00';
  document.getElementById('bk-purpose').value = '';
  
  // Populate equipment dropdown
  populateEquipmentSelect();
  
  // Open
  window.openModal?.('modal-booking');
};

function populateEquipmentFilter() {
  const sel = document.getElementById('booking-equipment-filter');
  if (!sel) return;
  
  const cache = window.cache;
  const equipment = vals(cache?.equipment || {})
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  
  const currentValue = sel.value;
  let html = '<option value="">Tất cả thiết bị</option>';
  equipment.forEach(e => {
    html += `<option value="${e._key}">${escapeHtml(e.name || '')}</option>`;
  });
  
  // Chỉ rebuild nếu nội dung khác (tránh reset value liên tục)
  if (sel.innerHTML !== html) {
    sel.innerHTML = html;
    sel.value = currentValue; // restore
    
    // Rebuild custom-filter wrap để UI dropdown cập nhật
    if (typeof window.rebuildCustomFilter === 'function') {
      window.rebuildCustomFilter(sel);
    }
  }
}

function populateEquipmentSelect() {
  const sel = document.getElementById('bk-equipment');
  if (!sel) return;
  
  const cache = window.cache;
  const equipment = vals(cache?.equipment || {})
    .filter(e => e.status !== 'Ngưng sử dụng')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  
  let html = '<option value="">Chọn thiết bị</option>';
  equipment.forEach(e => {
    html += `<option value="${e._key}">${escapeHtml(e.name || '')}${e.model ? ' (' + escapeHtml(e.model) + ')' : ''}</option>`;
  });
  sel.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// SAVE BOOKING
// ═══════════════════════════════════════════════════
window.saveBooking = async function() {
  const showToast = window.showToast;
  const closeModal = window.closeModal;
  const modal = document.getElementById('modal-booking');
  const saveBtn = modal?.querySelector('.modal-footer .btn-primary');
  
  // Read form
  const equipmentKey = document.getElementById('bk-equipment').value;
  const date = document.getElementById('bk-date').value;
  const startTime = document.getElementById('bk-start').value;
  const endTime = document.getElementById('bk-end').value;
  const purpose = document.getElementById('bk-purpose').value.trim();
  
  // Validate
  if (!equipmentKey) {
    showToast?.('Vui lòng chọn thiết bị!', 'danger');
    return;
  }
  // Kiểm tra trạng thái thiết bị: không cho đặt lịch nếu đang sửa hoặc ngưng sử dụng
  const equipmentRecord = window.cache?.equipment?.[equipmentKey];
  if (equipmentRecord) {
    const eqStatus = equipmentRecord.status;
    if (eqStatus === 'Đang sửa' || eqStatus === 'Ngưng sử dụng') {
      showToast?.(`Thiết bị "${equipmentRecord.name || ''}" đang ở trạng thái "${eqStatus}", không thể đặt lịch!`, 'danger');
      return;
    }
  }
  if (!date) {
    showToast?.('Vui lòng chọn ngày!', 'danger');
    return;
  }
  if (!startTime || !endTime) {
    showToast?.('Vui lòng nhập giờ bắt đầu và kết thúc!', 'danger');
    return;
  }
  if (endTime <= startTime) {
    showToast?.('Giờ kết thúc phải sau giờ bắt đầu!', 'danger');
    return;
  }
  if (!purpose) {
    showToast?.('Vui lòng nhập mục đích sử dụng!', 'danger');
    return;
  }
  // Date không quá 6 tháng
  const todayDate = new Date();
  const bookDate = new Date(date);
  if (bookDate < new Date(todayDate.toISOString().slice(0, 10))) {
    showToast?.('Không thể đặt lịch cho ngày đã qua!', 'danger');
    return;
  }
  
  // Conflict check
  console.log('[saveBooking] Checking conflict:', { equipmentKey, date, startTime, endTime });
  console.log('[saveBooking] All bookings:', vals(window.cache?.bookings || {}));
  const conflict = checkConflict(equipmentKey, date, startTime, endTime);
  console.log('[saveBooking] Conflict result:', conflict);
  if (conflict) {
    showToast?.(`Trùng lịch với "${conflict.userName}" (${conflict.startTime} - ${conflict.endTime})`, 'danger');
    return;
  }
  
  // Equipment info
  const cache = window.cache;
  const equipment = cache?.equipment?.[equipmentKey];
  if (!equipment) {
    showToast?.('Thiết bị không tồn tại!', 'danger');
    return;
  }
  
  // Build booking
  const auth = window.currentAuth;
  const booking = {
    code: 'BK-' + Date.now(),
    equipmentKey,
    equipmentName: equipment.name + (equipment.model ? ' (' + equipment.model + ')' : ''),
    userId: auth?.uid || null,
    userName: auth?.displayName || window.currentUser || 'Khách',
    date,
    startTime,
    endTime,
    purpose,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }
  
  try {
    const ref = await fbPush('bookings', booking);
    const bookingKey = ref?.key || '';
    // Notify admin có booking mới
    if (typeof window.createNotification === 'function') {
      window.createNotification(
        'booking_pending',
        bookingKey,
        null, // null = cho tất cả admin
        'Yêu cầu đăng ký mới',
        `${booking.userName} đăng ký ${booking.equipmentName} - ${formatDate(booking.date)} ${booking.startTime}-${booking.endTime}`
      );
    }
    showToast?.('Đã đăng ký! Chờ admin duyệt.', 'success');
    closeModal?.('modal-booking');
  } catch (e) {
    console.error('saveBooking error:', e);
    showToast?.('Lỗi: ' + e.message, 'danger');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Đăng ký'; }
  }
};

/**
 * Check xung đột lịch: cùng thiết bị, cùng ngày, có overlap giờ
 * Trả về booking xung đột (object) hoặc null
 * Bỏ qua booking đã rejected/cancelled/completed
 */
function checkConflict(equipmentKey, date, startTime, endTime, excludeKey = null) {
  const cache = window.cache;
  const bookings = vals(cache?.bookings || {});
  
  for (const b of bookings) {
    if (b._key === excludeKey) continue;
    if (b.equipmentKey !== equipmentKey) continue;
    if (b.date !== date) continue;
    if (['rejected', 'cancelled', 'completed'].includes(b.status)) continue;
    
    // Check overlap: NOT (b.end <= start OR b.start >= end)
    if (b.endTime <= startTime || b.startTime >= endTime) continue;
    
    return b; // có conflict
  }
  return null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════
// ACTIONS: Approve / Reject / Cancel / Check-in / Check-out
// ═══════════════════════════════════════════════════
window.approveBooking = async function(key) {
  if (!confirm('Duyệt yêu cầu đăng ký này?')) return;
  try {
    const booking = window.cache?.bookings?.[key];
    await update(ref(db, `bookings/${key}`), {
      status: 'approved',
      approvedBy: window.currentAuth?.uid,
      approvedAt: new Date().toISOString(),
    });
    // Notify member booking đã được duyệt
    if (booking && typeof window.createNotification === 'function') {
      window.createNotification(
        'booking_approved',
        key,
        booking.userId,
        'Đăng ký được duyệt',
        `${booking.equipmentName} - ${formatDate(booking.date)} ${booking.startTime}-${booking.endTime}`
      );
    }
    window.showToast?.('Đã duyệt', 'success');
  } catch (e) {
    window.showToast?.('Lỗi: ' + e.message, 'danger');
  }
};

window.rejectBooking = function(key) {
  // Mở modal nhập lý do, lưu key vào dataset
  const modal = document.getElementById('modal-reject-reason');
  if (!modal) {
    window.showToast?.('Modal chưa được khởi tạo', 'danger');
    return;
  }
  modal.dataset.bookingKey = key;
  document.getElementById('bk-reject-reason').value = '';
  window.openModal?.('modal-reject-reason');
};

window.confirmRejectBooking = async function() {
  const modal = document.getElementById('modal-reject-reason');
  const key = modal?.dataset.bookingKey;
  if (!key) return;
  const reason = document.getElementById('bk-reject-reason').value.trim();
  
  try {
    const booking = window.cache?.bookings?.[key];
    await update(ref(db, `bookings/${key}`), {
      status: 'rejected',
      rejectedBy: window.currentAuth?.uid,
      rejectedAt: new Date().toISOString(),
      rejectedReason: reason || '',
    });
    // Notify member booking bị từ chối + lý do
    if (booking && typeof window.createNotification === 'function') {
      const msg = `${booking.equipmentName} - ${formatDate(booking.date)}` + (reason ? ` | Lý do: ${reason}` : '');
      window.createNotification(
        'booking_rejected',
        key,
        booking.userId,
        'Đăng ký bị từ chối',
        msg
      );
    }
    window.showToast?.('Đã từ chối', 'success');
    window.closeModal?.('modal-reject-reason');
  } catch (e) {
    window.showToast?.('Lỗi: ' + e.message, 'danger');
  }
};

window.cancelBooking = async function(key) {
  if (!confirm('Hủy đăng ký này?')) return;
  try {
    await update(ref(db, `bookings/${key}`), {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    });
    window.showToast?.('Đã hủy', 'success');
  } catch (e) {
    window.showToast?.('Lỗi: ' + e.message, 'danger');
  }
};

window.checkInBooking = async function(key) {
  try {
    await update(ref(db, `bookings/${key}`), {
      status: 'in-use',
      checkInAt: new Date().toISOString(),
    });
    window.showToast?.('Đã check-in', 'success');
  } catch (e) {
    window.showToast?.('Lỗi: ' + e.message, 'danger');
  }
};

window.checkOutBooking = async function(key) {
  try {
    await update(ref(db, `bookings/${key}`), {
      status: 'completed',
      checkOutAt: new Date().toISOString(),
    });
    window.showToast?.('Đã check-out', 'success');
  } catch (e) {
    window.showToast?.('Lỗi: ' + e.message, 'danger');
  }
};

// ═══════════════════════════════════════════════════
// DELETE BOOKING (Superadmin only - hard delete)
// ═══════════════════════════════════════════════════
window.deleteBooking = async function(key) {
  if (window.currentAuth?.email !== SUPER_ADMIN_EMAIL) {
    window.showToast?.('Chỉ Superadmin mới được xóa', 'danger');
    return;
  }
  const cache = window.cache;
  const booking = cache?.bookings?.[key];
  const label = booking ? `${booking.code} (${booking.equipmentName} - ${booking.userName})` : key;
  if (!confirm(`Xóa cứng đăng ký "${label}"?\n\nKhông thể khôi phục!`)) return;
  
  try {
    await remove(ref(db, `bookings/${key}`));
    window.showToast?.('Đã xóa cứng đăng ký', 'success');
  } catch (e) {
    console.error('deleteBooking error:', e);
    window.showToast?.('Lỗi: ' + e.message, 'danger');
  }
};

// ═══════════════════════════════════════════════════
// NOTIFICATIONS — toast cho admin khi có booking pending mới
// ═══════════════════════════════════════════════════
let _knownBookingKeys = null; // null = chưa init (lần load đầu)

function checkNewPendingBookings() {
  const cache = window.cache;
  const isAdmin = window.currentAuth?.isAdmin;
  console.log('[notify] cache update, isAdmin:', isAdmin, 'has bookings:', !!cache?.bookings);
  if (!isAdmin || !cache?.bookings) return;
  
  const currentKeys = Object.keys(cache.bookings);
  
  // Lần đầu: chỉ ghi nhận, không notify
  if (_knownBookingKeys === null) {
    _knownBookingKeys = new Set(currentKeys);
    return;
  }
  
  // Tìm booking mới (key chưa có trong _knownBookingKeys)
  const newKeys = currentKeys.filter(k => !_knownBookingKeys.has(k));
  
  console.log('[notify] new keys:', newKeys.length, newKeys);
  newKeys.forEach(k => {
    const b = cache.bookings[k];
    // Toast đã chuyển sang notifications.js (Phase D+) - không show ở đây nữa
    // Tránh duplicate khi cả booking + notification cùng update
  });
  
  _knownBookingKeys = new Set(currentKeys);
}

// ═══════════════════════════════════════════════════
// AUTO-CANCEL — booking quá giờ kết thúc 30p chưa check-in
// ═══════════════════════════════════════════════════
async function autoCancelOverdueBookings() {
  console.log('[autoCancel] Running...');
  const cache = window.cache;
  if (!cache?.bookings) { console.log('[autoCancel] No bookings'); return; }
  console.log('[autoCancel] isAdmin:', window.currentAuth?.isAdmin);
  // Chỉ admin mới chạy auto-cancel để tránh nhiều client cùng update
  if (!window.currentAuth?.isAdmin) { console.log('[autoCancel] Not admin, skip'); return; }

  const now = new Date();
  const bookings = vals(cache.bookings);
  let cancelledCount = 0;

  for (const b of bookings) {
    // Chỉ xử lý pending + approved
    if (b.status !== 'pending' && b.status !== 'approved') continue;
    if (!b.date || !b.startTime || !b.endTime) continue;

    const startDateTime = new Date(b.date + 'T' + b.startTime + ':00');
    const endDateTime = new Date(b.date + 'T' + b.endTime + ':00');
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) continue;

    let shouldCancel = false;
    let reason = '';

    if (b.status === 'pending') {
      // Pending: hủy nếu qua giờ bắt đầu 15 phút mà admin chưa duyệt
      const overdueAt = new Date(startDateTime.getTime() + 15 * 60 * 1000);
      if (now > overdueAt) {
        shouldCancel = true;
        reason = 'Quá 15 phút sau giờ bắt đầu mà chưa được duyệt';
      }
    } else if (b.status === 'approved') {
      // Approved: hủy khi hết giờ kết thúc mà chưa check-in (status vẫn là approved, không phải in-use)
      if (now > endDateTime) {
        shouldCancel = true;
        reason = 'Quá giờ kết thúc mà không check-in';
      }
    }

    if (shouldCancel) {
      try {
        await update(ref(db, `bookings/${b._key}`), {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelledBy: 'system',
          rejectedReason: reason,  // dùng rejectedReason để UI tooltip hiện được
        });
        cancelledCount++;
        console.log(`[autoCancel] ${b.code} (${b.userName}) - ${reason}`);

        // Gửi notification cho user
        if (b.userId && typeof window.createNotification === 'function') {
          window.createNotification(
            'booking_rejected',
            b._key,
            b.userId,
            'Đăng ký bị tự hủy',
            `${b.equipmentName} - ${formatDate(b.date)} ${b.startTime}-${b.endTime} | Lý do: ${reason}`
          );
        }
      } catch (e) {
        console.error('auto-cancel error:', e);
      }
    }
  }

  if (cancelledCount > 0) {
    console.log(`[autoCancel] Cancelled ${cancelledCount} booking(s)`);
  }
}

window.autoCancelOverdueBookings = autoCancelOverdueBookings;
// Chạy auto-cancel mỗi 2 phút (giảm tải Firebase, tránh race condition)
setInterval(autoCancelOverdueBookings, 2 * 60 * 1000);
// Chạy 1 lần khi load (sau 10s để cache load xong)
setTimeout(autoCancelOverdueBookings, 10000);


// ═══════════════════════════════════════════════════
// TIME HELPERS (dùng cho week time-grid + resize)
// ═══════════════════════════════════════════════════
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function getTodayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// Check 1 booking time đã quá khứ chưa (ngày + giờ)
function isInPast(iso, hhmm) {
  if (!iso) return false;
  const todayIso = getTodayIso();
  if (iso < todayIso) return true; // ngày trước hôm nay
  if (iso > todayIso) return false; // ngày sau hôm nay
  // Cùng ngày - so sánh giờ với hiện tại
  if (!hhmm) return false;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const targetMin = timeToMinutes(hhmm);
  return targetMin < nowMin;
}



// ═══════════════════════════════════════════════════
// WEEK TIME-GRID VIEW (Google Calendar style)
// 7 cột ngày × 24h grid, có resize + drag
// ═══════════════════════════════════════════════════
let _calStartDate = null; // Monday của tuần đang xem

function getMondayOf(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function formatDateShort(d) {
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
}

function dateToISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function renderCalendar() {
  if (!_calStartDate) _calStartDate = getMondayOf(new Date());
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-range-label');
  if (!grid) return;
  
  // Build 7 days
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(_calStartDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  
  // Update range label
  if (label) {
    const start = days[0], end = days[6];
    label.textContent = `${formatDateShort(start)} - ${formatDateShort(end)}/${end.getFullYear()}`;
  }
  
  // Sync date picker
  const picker = document.getElementById('cal-date-picker');
  if (picker) picker.value = dateToISO(_calStartDate);
  
  const cache = window.cache;
  const bookings = vals(cache?.bookings || {});
  const dayLabels = ['T2','T3','T4','T5','T6','T7','CN'];
  const todayIso = dateToISO(new Date());
  
  const STATUS_BG = {
    'pending':   'rgba(245,158,11,0.85)',
    'approved':  'rgba(59,130,246,0.85)',
    'in-use':    'rgba(16,185,129,0.85)',
    'completed': 'rgba(100,116,139,0.6)',
  };
  
  // Build header row (1 cột giờ rỗng + 7 cột ngày)
  let headerHtml = '<div style="display:grid;grid-template-columns:60px repeat(7,1fr);position:sticky;top:0;z-index:30;background:white;border-bottom:1px solid var(--border)">';
  headerHtml += '<div style="background:var(--surface-2);border-right:1px solid var(--border)"></div>';
  days.forEach((d, idx) => {
    const iso = dateToISO(d);
    const isToday = iso === todayIso;
    const isWeekend = idx >= 5;
    const headerBg = isToday ? 'var(--teal)' : (isWeekend ? '#fef3c7' : 'var(--surface-2)');
    const headerColor = isToday ? 'white' : 'var(--text)';
    headerHtml += `<div style="background:${headerBg};color:${headerColor};padding:10px 6px;text-align:center;font-size:11px;font-weight:600;border-right:1px solid var(--border)">
      <div style="opacity:0.85;font-size:10px;letter-spacing:0.5px">${dayLabels[idx]}</div>
      <div style="font-size:16px;margin-top:2px">${d.getDate()}</div>
    </div>`;
  });
  headerHtml += '</div>';
  
  // Build body (1 cột giờ + 7 cột ngày, mỗi cột 1440px cao)
  let bodyHtml = '<div style="display:grid;grid-template-columns:60px repeat(7,1fr);min-height:720px;position:relative">';
  
  // Hour column (left)
  bodyHtml += '<div style="position:relative;background:var(--surface-2);border-right:1px solid var(--border)">';
  for (let h = 0; h < 24; h++) {
    bodyHtml += `<div style="position:absolute;top:${h*30}px;left:0;width:100%;height:30px;border-bottom:1px dashed var(--border);font-size:10px;color:var(--text-3);padding:2px 6px;font-family:'JetBrains Mono',monospace;text-align:right">${String(h).padStart(2,'0')}:00</div>`;
  }
  bodyHtml += '</div>';
  
  // 7 day columns
  days.forEach((d, idx) => {
    const iso = dateToISO(d);
    const isWeekend = idx >= 5;
    const dayBookings = bookings.filter(b => b.date === iso && !['rejected','cancelled'].includes(b.status));
    
    bodyHtml += `<div data-day-iso="${iso}" ondragover="window.calOnDragOver(event)" ondragleave="window.calOnDragLeave(event)" ondrop="window.calOnDrop(event,'${iso}')" ondblclick="window.calOnDblClick(event,'${iso}')" style="position:relative;border-right:1px solid var(--border);background:${isWeekend ? '#fffbeb' : 'white'};min-height:720px;transition:background 0.15s">`;
    // Hour grid lines
    for (let h = 0; h < 24; h++) {
      bodyHtml += `<div style="position:absolute;top:${h*30}px;left:0;right:0;height:30px;border-bottom:1px solid #f1f5f9;pointer-events:none"></div>`;
    }
    
    // Render booking blocks for this day
    dayBookings.forEach(b => {
      const startMin = timeToMinutes(b.startTime);
      const endMin = timeToMinutes(b.endTime);
      const top = startMin * 0.5;
      const height = Math.max(15, (endMin - startMin) * 0.5);
      const bg = STATUS_BG[b.status] || '#94a3b8';
      
      const canDrag = canDragBooking(b);
      const draggableAttr = canDrag ? `draggable="true" ondragstart="window.calOnDragStart(event,'${b._key}')" ondragend="window.calOnDragEnd(event)"` : '';
      
      const handleTop = canDrag
        ? `<div class="day-resize-handle" onmousedown="window.dayStartResize(event,'${b._key}','top')" style="position:absolute;left:0;right:0;top:0;height:6px;cursor:ns-resize;background:rgba(255,255,255,0.35);border-radius:6px 6px 0 0;transition:background 0.15s,height 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.7)';this.style.height='9px'" onmouseout="this.style.background='rgba(255,255,255,0.35)';this.style.height='6px'"></div>`
        : '';
      const handleBottom = canDrag
        ? `<div class="day-resize-handle" onmousedown="window.dayStartResize(event,'${b._key}','bottom')" style="position:absolute;left:0;right:0;bottom:0;height:6px;cursor:ns-resize;background:rgba(255,255,255,0.35);border-radius:0 0 6px 6px;transition:background 0.15s,height 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.7)';this.style.height='9px'" onmouseout="this.style.background='rgba(255,255,255,0.35)';this.style.height='6px'"></div>`
        : '';
      
      bodyHtml += `<div ${draggableAttr} data-bk-key="${b._key}" onclick="event.stopPropagation();window.openBookingDetail('${b._key}')" title="${escapeHtml(b.equipmentName + ' | ' + b.userName + ' | ' + (b.purpose||''))}" style="position:absolute;top:${top}px;left:3px;right:3px;height:${height}px;background:${bg};color:white;border-radius:5px;padding:4px 6px;cursor:${canDrag ? 'grab' : 'pointer'};font-size:10px;line-height:1.25;overflow:hidden;border:none;transition:transform 0.1s,box-shadow 0.1s,opacity 0.2s;z-index:10" onmouseover="this.style.transform='scale(1.01)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="font-weight:700;font-family:'JetBrains Mono',monospace;font-size:9.5px">${escapeHtml(b.startTime||'')} – ${escapeHtml(b.endTime||'')}</div>
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px">${escapeHtml(b.equipmentName||'')}</div>
        <div style="opacity:0.9;font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(b.userName||'')}</div>
        ${handleTop}${handleBottom}
      </div>`;
    });
    
    // Now indicator (đường đỏ vị trí giờ hiện tại nếu là hôm nay)
    if (iso === todayIso) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      bodyHtml += `<div style="position:absolute;top:${nowMin*0.5}px;left:0;right:0;height:2px;background:#ef4444;z-index:50;pointer-events:none"><div style="position:absolute;left:-5px;top:-4px;width:10px;height:10px;background:#ef4444;border-radius:50%"></div></div>`;
    }
    
    bodyHtml += '</div>';
  });
  
  bodyHtml += '</div>';
  
  // Lưu scroll position TRƯỚC khi re-render (giữ vùng nhìn)
  const wrap = document.getElementById('cal-grid-wrap');
  const savedScroll = wrap ? wrap.scrollTop : null;
  const isFirstRender = !grid.innerHTML; // grid trống = lần render đầu
  
  grid.innerHTML = headerHtml + bodyHtml;
  
  // Restore scroll: lần render đầu auto-scroll tới giờ hiện tại; những lần sau giữ scroll cũ
  if (wrap) {
    if (isFirstRender || savedScroll === null) {
      const todayInWeek = days.some(d => dateToISO(d) === todayIso);
      if (todayInWeek) {
        const now = new Date();
        wrap.scrollTop = Math.max(0, now.getHours() * 30 - 50);
      } else {
        wrap.scrollTop = 7 * 30; // 7AM
      }
    } else {
      // Re-render: giữ scroll position
      wrap.scrollTop = savedScroll;
    }
  }
}

window.calNavWeek = function(delta) {
  if (!_calStartDate) _calStartDate = getMondayOf(new Date());
  const d = new Date(_calStartDate);
  d.setDate(d.getDate() + delta * 7);
  _calStartDate = d;
  renderCalendar();
};

window.calToday = function() {
  _calStartDate = getMondayOf(new Date());
  renderCalendar();
};

window.calJumpToDate = function(dateStr) {
  if (!dateStr) return;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return;
  _calStartDate = getMondayOf(d);
  renderCalendar();
};

// Mở modal detail
window.openBookingDetail = function(key) {
  const b = window.cache?.bookings?.[key];
  if (!b) return;
  const STATUS = {
    'pending':'Chờ duyệt','approved':'Đã duyệt','in-use':'Đang dùng',
    'completed':'Hoàn thành','rejected':'Từ chối','cancelled':'Đã hủy',
  };
  alert(
    `Mã: ${b.code}\n` +
    `Người đặt: ${b.userName}\n` +
    `Thiết bị: ${b.equipmentName}\n` +
    `Ngày: ${formatDate(b.date)}\n` +
    `Giờ: ${b.startTime} - ${b.endTime}\n` +
    `Mục đích: ${b.purpose||'—'}\n` +
    `Trạng thái: ${STATUS[b.status]||b.status}` +
    (b.rejectedReason ? `\nLý do từ chối: ${b.rejectedReason}` : '')
  );
};

// Double-click vùng trống cột ngày → mở modal pre-filled
window.calOnDblClick = function(e, iso) {
  // Kiểm tra không click trúng block
  if (e.target.closest('[data-bk-key]')) return;
  
  const cell = e.currentTarget;
  const rect = cell.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const totalMin = Math.max(0, Math.min(1440, y * 2));
  const roundedMin = Math.floor(totalMin / 30) * 30;
  const h = String(Math.floor(roundedMin / 60)).padStart(2, '0');
  const m = String(roundedMin % 60).padStart(2, '0');
  const startTime = `${h}:${m}`;
  const endRoundedMin = Math.min(1440, roundedMin + 60);
  const eh = String(Math.floor(endRoundedMin / 60)).padStart(2, '0');
  const em = String(endRoundedMin % 60).padStart(2, '0');
  const endTime = `${eh}:${em}`;
  
  if (typeof window.openBookingModal === 'function') {
    window.openBookingModal();
    setTimeout(() => {
      const dateInput = document.getElementById('bk-date');
      const startInput = document.getElementById('bk-start');
      const endInput = document.getElementById('bk-end');
      if (dateInput) dateInput.value = iso;
      if (startInput) startInput.value = startTime;
      if (endInput) endInput.value = endTime;
    }, 100);
  }
};


// ═══════════════════════════════════════════════════
// DRAG & DROP + RESIZE HANDLERS (cho week time-grid)
// ═══════════════════════════════════════════════════

// Check user có quyền drag/resize booking không
function canDragBooking(b) {
  if (!b) return false;
  if (['completed', 'cancelled', 'rejected'].includes(b.status)) return false;
  const auth = window.currentAuth;
  if (!auth) return false;
  return auth.isAdmin || (auth.uid && b.userId === auth.uid);
}

// ─── DRAG (move sang ngày khác) ──────────────────
window.calOnDragStart = function(e, key) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', key);
  window._draggingBookingKey = key;
  // Add body class để CSS làm vùng hit của nav week to ra
  document.body.classList.add('is-dragging-booking');
  setTimeout(() => {
    if (e.target && e.target.style) e.target.style.opacity = '0.4';
  }, 0);
};

window.calOnDragEnd = function(e) {
  if (e.target && e.target.style) e.target.style.opacity = '';
  window._draggingBookingKey = null;
  document.querySelectorAll('[data-day-iso]').forEach(c => {
    c.style.background = '';
    c.style.outline = '';
  });
};

window.calOnDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const cell = e.currentTarget;
  cell.style.outline = '2px dashed var(--teal)';
  cell.style.outlineOffset = '-2px';
};

window.calOnDragLeave = function(e) {
  const cell = e.currentTarget;
  cell.style.outline = '';
};

window.calOnDrop = async function(e, newIso) {
  e.preventDefault();
  const cell = e.currentTarget;
  cell.style.outline = '';
  
  const key = e.dataTransfer.getData('text/plain') || window._draggingBookingKey;
  if (!key) return;
  
  const b = window.cache?.bookings?.[key];
  if (!b) return;
  
  const today = getTodayIso();
  if (newIso < today) {
    window.showToast?.('Không thể chuyển sang ngày trong quá khứ. Đã hủy.', 'danger');
    renderCalendar();
    return;
  }
  
  // Tính newStartTime theo Y position trong cell (snap 15 phút)
  const rect = cell.getBoundingClientRect();
  const y = e.clientY - rect.top;
  let newStartMin = Math.max(0, Math.min(1440, y * 2));
  newStartMin = Math.round(newStartMin / 30) * 30;
  
  // Giữ nguyên duration
  const oldStartMin = timeToMinutes(b.startTime);
  const oldEndMin = timeToMinutes(b.endTime);
  const duration = oldEndMin - oldStartMin;
  let newEndMin = newStartMin + duration;
  // Constraint: end <= 1440
  if (newEndMin > 1440) {
    newEndMin = 1440;
    newStartMin = Math.max(0, newEndMin - duration);
  }
  
  const sh = String(Math.floor(newStartMin / 60)).padStart(2, '0');
  const sm = String(newStartMin % 60).padStart(2, '0');
  const newStartTime = `${sh}:${sm}`;
  const eh = String(Math.floor(newEndMin / 60)).padStart(2, '0');
  const em = String(newEndMin % 60).padStart(2, '0');
  const newEndTime = `${eh}:${em}`;
  
  // Check past time với newStartTime (vị trí Y mới, không phải startTime cũ)
  if (newIso === today && isInPast(newIso, newStartTime)) {
    window.showToast?.(`Không thể đặt vào ${newStartTime} (đã qua giờ hiện tại)`, 'danger');
    renderCalendar();
    return;
  }
  
  // Cùng ngày + cùng thời gian → revert (không có gì thay đổi)
  if (newIso === b.date && newStartTime === b.startTime) {
    renderCalendar();
    return;
  }
  
  const dateChanged = newIso !== b.date;
  const timeChanged = newStartTime !== b.startTime;
  let confirmMsg = `Đổi "${b.equipmentName}":\n`;
  if (dateChanged) confirmMsg += `• Ngày: ${formatDate(b.date)} → ${formatDate(newIso)}\n`;
  if (timeChanged) confirmMsg += `• Giờ: ${b.startTime}-${b.endTime} → ${newStartTime}-${newEndTime}\n`;
  
  if (!confirm(confirmMsg + '\nXác nhận?')) {
    renderCalendar();
    return;
  }
  
  const conflicts = vals(window.cache?.bookings || {}).filter(x => 
    x._key !== key &&
    x.equipmentKey === b.equipmentKey &&
    x.date === newIso &&
    !['rejected','cancelled'].includes(x.status) &&
    timeOverlap(x.startTime, x.endTime, newStartTime, newEndTime)
  );
  
  if (conflicts.length > 0) {
    const c = conflicts[0];
    if (!confirm(`Cảnh báo: trùng giờ với:\n${c.userName} - ${c.startTime}-${c.endTime}\n\nVẫn tiếp tục?`)) {
      renderCalendar();
      return;
    }
  }
  
  try {
    const updates = { date: newIso, startTime: newStartTime, endTime: newEndTime };
    if (b.status === 'approved') updates.status = 'pending';
    await update(ref(db, `bookings/${key}`), updates);
    window.showToast?.(`Đã chuyển ${dateChanged ? 'sang ' + formatDate(newIso) : ''}${timeChanged ? ' ' + newStartTime + '-' + newEndTime : ''}`.trim(), 'success');
  } catch (err) {
    console.error('drag drop update error:', err);
    window.showToast?.('Lỗi: ' + err.message, 'danger');
    renderCalendar();
  }
};

// ─── RESIZE (kéo cạnh trên/dưới đổi startTime/endTime) ──
let _resizeState = null;

window.dayStartResize = function(e, key, edge) {
  e.preventDefault();
  e.stopPropagation();
  
  const b = window.cache?.bookings?.[key];
  if (!b) return;
  
  // Không cho resize booking đã quá giờ kết thúc
  if (isInPast(b.date, b.endTime)) {
    window.showToast?.('Không thể đổi giờ booking đã quá hạn', 'danger');
    return;
  }
  
  const blockEl = document.querySelector(`[data-bk-key="${key}"]`);
  if (!blockEl) return;
  
  const wrap = document.getElementById('cal-grid-wrap');
  _resizeState = {
    key,
    blockEl,
    edge: edge || 'bottom',
    startY: e.clientY,
    startScrollTop: wrap ? wrap.scrollTop : 0,
    originalStartMin: timeToMinutes(b.startTime),
    originalEndMin: timeToMinutes(b.endTime),
    originalHeight: parseInt(blockEl.style.height, 10) || 60,
    originalTop: parseInt(blockEl.style.top, 10) || 0,
  };
  
  blockEl.style.boxShadow = '0 0 0 2px var(--teal), 0 4px 16px rgba(13,148,136,0.3)';
  blockEl.style.transition = 'none';
  blockEl.style.opacity = '0.92';
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';
  
  // Tooltip
  let tooltip = document.getElementById('day-resize-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'day-resize-tooltip';
    tooltip.style.cssText = 'position:fixed;background:linear-gradient(135deg,var(--teal),var(--teal-2));color:white;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;font-family:JetBrains Mono,monospace;box-shadow:0 4px 16px rgba(0,0,0,0.2);pointer-events:none;z-index:9999;transform:translate(-50%,-130%)';
    document.body.appendChild(tooltip);
  }
  tooltip.style.display = 'block';
  tooltip.style.left = e.clientX + 'px';
  tooltip.style.top = e.clientY + 'px';
  tooltip.textContent = edge === 'top' ? b.startTime : b.endTime;
  
  document.addEventListener('mousemove', dayOnResizeMove);
  document.addEventListener('mouseup', dayOnResizeEnd);
};

function dayOnResizeMove(e) {
  if (!_resizeState) return;
  // Lưu event cuối, xử lý visual qua rAF (mượt hơn)
  _resizeState.lastEvent = e;
  if (!_resizeState.rafPending) {
    _resizeState.rafPending = true;
    requestAnimationFrame(() => {
      if (_resizeState) {
        _resizeState.rafPending = false;
        applyResizeMove(_resizeState.lastEvent);
      }
    });
  }
  // Auto-scroll khi chuột tới gần biên scroll wrap
  autoScrollDuringResize(e);
}

function autoScrollDuringResize(e) {
  const wrap = document.getElementById('cal-grid-wrap');
  if (!_resizeState || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const EDGE = 80; // px - vùng kích hoạt
  const MAX_SPEED = 20; // px/frame - tăng tốc
  
  let speed = 0;
  if (e.clientY < rect.top + EDGE) {
    const dist = rect.top + EDGE - e.clientY;
    speed = -Math.min(MAX_SPEED, (dist / EDGE) * MAX_SPEED);
  } else if (e.clientY > rect.bottom - EDGE) {
    const dist = e.clientY - (rect.bottom - EDGE);
    speed = Math.min(MAX_SPEED, (dist / EDGE) * MAX_SPEED);
  }
  
  _resizeState._scrollSpeed = speed;
  
  // Khởi động timer nếu chưa có và đang cần scroll
  if (speed !== 0 && !_resizeState._scrollTimer) {
    _resizeState._scrollTimer = setInterval(() => {
      if (!_resizeState) return;
      const sp = _resizeState._scrollSpeed || 0;
      if (sp === 0) return; // không clear timer, chỉ pause
      const w = document.getElementById('cal-grid-wrap');
      if (!w) return;
      const oldTop = w.scrollTop;
      w.scrollTop += sp;
      // Nếu đã chạm biên (scroll không đổi) → không cần làm gì
      if (w.scrollTop === oldTop) return;
      // Re-apply với event cuối để block resize theo
      if (_resizeState.lastEvent) applyResizeMove(_resizeState.lastEvent);
    }, 16);
  }
}

function applyResizeMove(e) {
  if (!_resizeState) return;
  const state = _resizeState;
  const wrap = document.getElementById('cal-grid-wrap');
  const currentScroll = wrap ? wrap.scrollTop : 0;
  const scrollDelta = currentScroll - state.startScrollTop;
  // dy = movement viewport + movement do scroll (cùng đơn vị px)
  const dy = (e.clientY - state.startY) + scrollDelta;
  
  let newStartMin = state.originalStartMin;
  let newEndMin = state.originalEndMin;
  
  // Tính giờ hiện tại nếu booking là hôm nay (để constraint min)
  const b_temp = window.cache?.bookings?.[state.key];
  const isToday = b_temp && b_temp.date === getTodayIso();
  const nowMin = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : 0;
  
  if (state.edge === 'top') {
    newStartMin = state.originalStartMin + dy * 2;
    newStartMin = Math.round(newStartMin / 30) * 30;
    const maxStart = state.originalEndMin - 30;
    // Min start: 0, hoặc nowMin nếu là hôm nay
    const minStart = isToday ? Math.max(0, Math.ceil(nowMin / 30) * 30) : 0;
    newStartMin = Math.max(minStart, Math.min(maxStart, newStartMin));
  } else {
    newEndMin = state.originalEndMin + dy * 2;
    newEndMin = Math.round(newEndMin / 30) * 30;
    const minEnd = Math.max(state.originalStartMin + 30, isToday ? Math.ceil(nowMin / 30) * 30 + 30 : 0);
    newEndMin = Math.max(minEnd, Math.min(1440, newEndMin));
  }
  
  state.blockEl.style.top = (newStartMin * 0.5) + 'px';
  state.blockEl.style.height = Math.max(15, (newEndMin - newStartMin) * 0.5) + 'px';
  
  const sh = String(Math.floor(newStartMin / 60)).padStart(2, '0');
  const sm = String(newStartMin % 60).padStart(2, '0');
  const newStartTime = `${sh}:${sm}`;
  const eh = String(Math.floor(newEndMin / 60)).padStart(2, '0');
  const em = String(newEndMin % 60).padStart(2, '0');
  const newEndTime = `${eh}:${em}`;
  
  const timeDiv = state.blockEl.querySelector('div');
  if (timeDiv) timeDiv.textContent = `${newStartTime} – ${newEndTime}`;
  
  state.newStartMin = newStartMin;
  state.newEndMin = newEndMin;
  state.newStartTime = newStartTime;
  state.newEndTime = newEndTime;
  
  const tooltip = document.getElementById('day-resize-tooltip');
  if (tooltip) {
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
    tooltip.textContent = state.edge === 'top' ? newStartTime : newEndTime;
  }
}

async function dayOnResizeEnd(e) {
  document.removeEventListener('mousemove', dayOnResizeMove);
  document.removeEventListener('mouseup', dayOnResizeEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  
  // Cleanup auto-scroll timer
  if (_resizeState && _resizeState._scrollTimer) {
    clearInterval(_resizeState._scrollTimer);
    _resizeState._scrollTimer = null;
  }
  
  if (!_resizeState) return;
  const state = _resizeState;
  _resizeState = null;
  
  state.blockEl.style.boxShadow = '';
  state.blockEl.style.transition = '';
  state.blockEl.style.opacity = '';
  
  const tooltip = document.getElementById('day-resize-tooltip');
  if (tooltip) tooltip.style.display = 'none';
  
  const startChanged = state.edge === 'top' && state.newStartMin !== undefined && state.newStartMin !== state.originalStartMin;
  const endChanged = state.edge === 'bottom' && state.newEndMin !== undefined && state.newEndMin !== state.originalEndMin;
  
  if (!startChanged && !endChanged) {
    renderCalendar();
    return;
  }
  
  const b = window.cache?.bookings?.[state.key];
  if (!b) {
    renderCalendar();
    return;
  }
  
  const newStartTime = startChanged ? state.newStartTime : b.startTime;
  const newEndTime = endChanged ? state.newEndTime : b.endTime;
  const edgeLabel = state.edge === 'top' ? 'giờ bắt đầu' : 'giờ kết thúc';
  const newValue = state.edge === 'top' ? newStartTime : newEndTime;
  
  if (!confirm(`Đổi ${edgeLabel} của "${b.equipmentName}" thành ${newValue}?`)) {
    renderCalendar();
    return;
  }
  
  const conflicts = vals(window.cache?.bookings || {}).filter(x => 
    x._key !== state.key &&
    x.equipmentKey === b.equipmentKey &&
    x.date === b.date &&
    !['rejected','cancelled'].includes(x.status) &&
    timeOverlap(x.startTime, x.endTime, newStartTime, newEndTime)
  );
  
  if (conflicts.length > 0) {
    const c = conflicts[0];
    if (!confirm(`Cảnh báo: trùng giờ với đăng ký:\n${c.userName} - ${c.startTime}-${c.endTime}\n\nVẫn tiếp tục?`)) {
      renderCalendar();
      return;
    }
  }
  
  try {
    const updates = {};
    if (startChanged) updates.startTime = newStartTime;
    if (endChanged) updates.endTime = newEndTime;
    if (b.status === 'approved') updates.status = 'pending';
    
    await update(ref(db, `bookings/${state.key}`), updates);
    window.showToast?.(`Đã đổi ${edgeLabel} thành ${newValue}`, 'success');
  } catch (err) {
    console.error('resize update error:', err);
    window.showToast?.('Lỗi: ' + err.message, 'danger');
    renderCalendar();
  }
}


function timeOverlap(start1, end1, start2, end2) {
  const toMin = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  return toMin(start1) < toMin(end2) && toMin(start2) < toMin(end1);
}

window.calNavWeek = function(delta) {
  if (!_calStartDate) _calStartDate = getMondayOf(new Date());
  const d = new Date(_calStartDate);
  d.setDate(d.getDate() + delta * 7);
  _calStartDate = d;
  renderCalendar();
  
  // Slide animation cho calendar grid khi chuyển tuần
  const grid = document.getElementById('cal-grid');
  if (grid) {
    const cls = delta > 0 ? 'cal-slide-from-right' : 'cal-slide-from-left';
    grid.classList.remove('cal-slide-from-right', 'cal-slide-from-left');
    void grid.offsetWidth; // force reflow
    grid.classList.add(cls);
    setTimeout(() => grid.classList.remove(cls), 400);
  }
};

window.calToday = function() {
  _calStartDate = getMondayOf(new Date());
  renderCalendar();
};

window.calJumpToDate = function(dateStr) {
  // dateStr format: YYYY-MM-DD
  if (!dateStr) return;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return;
  _calStartDate = getMondayOf(d);
  renderCalendar();
};

// Mở modal xem detail (đơn giản: alert info, có thể mở rộng sau)
window.openBookingDetail = function(key) {
  const b = window.cache?.bookings?.[key];
  if (!b) return;
  const STATUS = {
    'pending':'Chờ duyệt','approved':'Đã duyệt','in-use':'Đang dùng',
    'completed':'Hoàn thành','rejected':'Từ chối','cancelled':'Đã hủy',
  };
  alert(
    `Mã: ${b.code}\n` +
    `Người đặt: ${b.userName}\n` +
    `Thiết bị: ${b.equipmentName}\n` +
    `Ngày: ${formatDate(b.date)}\n` +
    `Giờ: ${b.startTime} - ${b.endTime}\n` +
    `Mục đích: ${b.purpose||'—'}\n` +
    `Trạng thái: ${STATUS[b.status]||b.status}` +
    (b.rejectedReason ? `\nLý do từ chối: ${b.rejectedReason}` : '')
  );
};


// ═══════════════════════════════════════════════════
// Re-render khi cache update
// ═══════════════════════════════════════════════════
window.addEventListener('cache-update', (e) => {
  if (e.detail?.col === 'bookings') {
    checkNewPendingBookings();
    renderBooking();
    // Cũng re-render calendar nếu đang xem
    const calEl = document.getElementById('booking-cal-view');
    if (calEl && calEl.style.display !== 'none') {
      renderCalendar();
    }
    const dayEl = document.getElementById('booking-day-view');
    if (dayEl && dayEl.style.display !== 'none') {
      renderDayView();
    }
  }
  // Cũng re-populate equipment dropdown nếu modal đang mở
  if (e.detail?.col === 'equipment') {
    const modal = document.getElementById('modal-booking');
    if (modal && modal.classList.contains('open')) {
      populateEquipmentSelect();
    }
  }
});

// Search input listener
document.addEventListener('DOMContentLoaded', () => {
  const searchEl = document.getElementById('booking-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => renderBooking());
  }
});

// ── Hover navigate tuần khi đang kéo block ──
// Khi user kéo block và hover vào nút "Tuần trước/sau" trong 700ms
// → tự động navigate tuần, user vẫn giữ chuột để kéo tiếp
let _dragHoverNavTimer = null;
const DRAG_HOVER_NAV_DELAY = 700; // ms

window.calOnDragHoverNav = function(e, delta) {
  e.preventDefault();
  // Chỉ trigger nếu đang kéo 1 booking block
  if (!window._draggingBookingKey) return;
  
  const btn = e.currentTarget;
  // Visual feedback: highlight nút
  btn.classList.add('cal-nav-btn-drag-hover');
  
  // Clear timer cũ (nếu có)
  if (_dragHoverNavTimer) clearTimeout(_dragHoverNavTimer);
  
  // Start timer 700ms
  _dragHoverNavTimer = setTimeout(() => {
    _dragHoverNavTimer = null;
    btn.classList.remove('cal-nav-btn-drag-hover');
    if (typeof window.calNavWeek === 'function') {
      window.calNavWeek(delta);
    }
  }, DRAG_HOVER_NAV_DELAY);
};

window.calOnDragLeaveNav = function(e) {
  const btn = e.currentTarget;
  btn.classList.remove('cal-nav-btn-drag-hover');
  if (_dragHoverNavTimer) {
    clearTimeout(_dragHoverNavTimer);
    _dragHoverNavTimer = null;
  }
};

// Cleanup timer khi drag end (đề phòng user thả chuột giữa hover)
const _origCalOnDragEnd = window.calOnDragEnd;
window.calOnDragEnd = function(e) {
  if (_dragHoverNavTimer) {
    clearTimeout(_dragHoverNavTimer);
    _dragHoverNavTimer = null;
  }
  document.querySelectorAll('.cal-nav-btn-drag-hover').forEach(b => 
    b.classList.remove('cal-nav-btn-drag-hover')
  );
  // Cleanup body class
  document.body.classList.remove('is-dragging-booking');
  if (_origCalOnDragEnd) _origCalOnDragEnd(e);
};

// ── Edge zones drag detect (chuyển tuần khi kéo block ra cạnh trái/phải) ──
let _dragEdgeTimer = null;
const DRAG_EDGE_NAV_DELAY = 200; // ms

window.calOnDragEnterEdge = function(e, delta) {
  e.preventDefault();
  if (!window._draggingBookingKey) return;
  
  const zone = e.currentTarget;
  zone.classList.add('is-hover');
  
  if (_dragEdgeTimer) clearTimeout(_dragEdgeTimer);
  
  _dragEdgeTimer = setTimeout(() => {
    _dragEdgeTimer = null;
    zone.classList.remove('is-hover');
    if (typeof window.calNavWeek === 'function') {
      window.calNavWeek(delta);
      // Sau khi navigate, edge zone vẫn còn hover (chuột chưa rời)
      // → restart timer ngay để có thể navigate tiếp nếu user vẫn ở edge
      setTimeout(() => {
        if (window._draggingBookingKey) {
          // Re-add hover để continue navigate nếu user vẫn giữ ở edge
          zone.classList.add('is-hover');
          if (_dragEdgeTimer) clearTimeout(_dragEdgeTimer);
          _dragEdgeTimer = setTimeout(() => {
            _dragEdgeTimer = null;
            zone.classList.remove('is-hover');
            if (typeof window.calNavWeek === 'function') {
              window.calNavWeek(delta);
            }
          }, DRAG_EDGE_NAV_DELAY);
        }
      }, 30);
    }
  }, DRAG_EDGE_NAV_DELAY);
};

window.calOnDragLeaveEdge = function(e) {
  const zone = e.currentTarget;
  zone.classList.remove('is-hover');
  if (_dragEdgeTimer) {
    clearTimeout(_dragEdgeTimer);
    _dragEdgeTimer = null;
  }
};

// Cleanup edge timer khi drag end
const _origCalOnDragEnd2 = window.calOnDragEnd;
window.calOnDragEnd = function(e) {
  if (_dragEdgeTimer) {
    clearTimeout(_dragEdgeTimer);
    _dragEdgeTimer = null;
  }
  document.querySelectorAll('.cal-edge-zone.is-hover').forEach(z => 
    z.classList.remove('is-hover')
  );
  if (_origCalOnDragEnd2) _origCalOnDragEnd2(e);
};

