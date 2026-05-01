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
  let bodyHtml = '<div style="display:grid;grid-template-columns:60px repeat(7,1fr);min-height:1440px;position:relative">';
  
  // Hour column (left)
  bodyHtml += '<div style="position:relative;background:var(--surface-2);border-right:1px solid var(--border)">';
  for (let h = 0; h < 24; h++) {
    bodyHtml += `<div style="position:absolute;top:${h*60}px;left:0;width:100%;height:60px;border-bottom:1px dashed var(--border);font-size:10px;color:var(--text-3);padding:2px 6px;font-family:'JetBrains Mono',monospace;text-align:right">${String(h).padStart(2,'0')}:00</div>`;
  }
  bodyHtml += '</div>';
  
  // 7 day columns
  days.forEach((d, idx) => {
    const iso = dateToISO(d);
    const isWeekend = idx >= 5;
    const dayBookings = bookings.filter(b => b.date === iso && !['rejected','cancelled'].includes(b.status));
    
    bodyHtml += `<div data-day-iso="${iso}" ondragover="window.calOnDragOver(event)" ondragleave="window.calOnDragLeave(event)" ondrop="window.calOnDrop(event,'${iso}')" ondblclick="window.calOnDblClick(event,'${iso}')" style="position:relative;border-right:1px solid var(--border);background:${isWeekend ? '#fffbeb' : 'white'};min-height:1440px;transition:background 0.15s">`;
    // Hour grid lines
    for (let h = 0; h < 24; h++) {
      bodyHtml += `<div style="position:absolute;top:${h*60}px;left:0;right:0;height:60px;border-bottom:1px solid #f1f5f9;pointer-events:none"></div>`;
    }
    
    // Render booking blocks for this day
    dayBookings.forEach(b => {
      const startMin = timeToMinutes(b.startTime);
      const endMin = timeToMinutes(b.endTime);
      const top = startMin;
      const height = Math.max(20, endMin - startMin);
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
      bodyHtml += `<div style="position:absolute;top:${nowMin}px;left:0;right:0;height:2px;background:#ef4444;z-index:50;pointer-events:none"><div style="position:absolute;left:-5px;top:-4px;width:10px;height:10px;background:#ef4444;border-radius:50%"></div></div>`;
    }
    
    bodyHtml += '</div>';
  });
  
  bodyHtml += '</div>';
  
  grid.innerHTML = headerHtml + bodyHtml;
  
  // Auto-scroll tới giờ hiện tại (nếu tuần này có hôm nay)
  const wrap = document.getElementById('cal-grid-wrap');
  if (wrap) {
    const todayInWeek = days.some(d => dateToISO(d) === todayIso);
    if (todayInWeek) {
      const now = new Date();
      wrap.scrollTop = Math.max(0, now.getHours() * 60 - 100);
    } else {
      wrap.scrollTop = 7 * 60; // 7AM
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
  const totalMin = Math.max(0, Math.min(1440, y));
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
