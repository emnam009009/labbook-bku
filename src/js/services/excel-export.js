// services/excel-export.js — Export data ra Excel với style
// Dùng SheetJS (lazy import từ npm — tránh render-blocking ~270KB)
//
// Logic:
//  - Lấy data từ window.cache theo trang
//  - Apply filter hiện tại (search, status, member-filter cho 3 trang TN)
//  - Format thành rows với header tiếng Việt
//  - Style: header bold + freeze top row + auto-width
//  - Tên file: <page>_YYYYMMDD.xlsx

import { vals, fuzzy } from '../utils/format.js'

// ─── Lazy load SheetJS (~270KB) ──────────────────────────────────
// Chỉ load khi user thực sự bấm "Export Excel" — tránh render-blocking
let _xlsxPromise = null
function loadXLSX() {
  if (!_xlsxPromise) {
    _xlsxPromise = import('xlsx')
  }
  return _xlsxPromise
}

/**
 * Lấy filter values từ DOM (input, select)
 */
function getFilterValues(page) {
  const searchEl = document.getElementById(`${page}-search`);
  const statusEl = document.getElementById(`${page}-status-filter`);
  const memberEl = document.getElementById(`${page}-member-filter`);
  return {
    search: searchEl?.value?.trim() || '',
    status: statusEl?.value || '',
    member: memberEl?.value || 'all',
  };
}

/**
 * Apply filter cho rows (giống logic trong renderHydro/Electrode/Electrochem)
 */
function applyFilter(rows, page, fields) {
  const f = getFilterValues(page);
  return rows.filter(r => {
    // Search
    if (f.search && !fields.some(k => fuzzy(r[k] || '', f.search))) return false;
    // Status
    if (f.status && r.status !== f.status) return false;
    // Member filter
    if (window.passMemberFilter && !window.passMemberFilter(page, r.person)) return false;
    return true;
  });
}

/**
 * Tạo workbook với 1 sheet styled
 */
async function createWorkbook(rows, headers, sheetName) {
  const XLSX = await loadXLSX();
  
  // Convert rows (array of arrays) to sheet
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  
  // Auto-width: tính max width mỗi cột
  const colWidths = headers.map((h, i) => {
    const headerLen = String(h).length;
    const maxDataLen = Math.max(0, ...rows.map(r => String(r[i] ?? '').length));
    return { wch: Math.min(Math.max(headerLen, maxDataLen) + 2, 40) };
  });
  ws['!cols'] = colWidths;
  
  // Freeze top row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!views'] = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
  
  // Style header row: bold + background color
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0D9488' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: '94A3B8' } },
        bottom: { style: 'thin', color: { rgb: '94A3B8' } },
        left: { style: 'thin', color: { rgb: '94A3B8' } },
        right: { style: 'thin', color: { rgb: '94A3B8' } },
      },
    };
  }
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

/**
 * Format date YYYYMMDD cho tên file
 */
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Save workbook ra file
 */
async function saveFile(wb, filename) {
  const XLSX = await loadXLSX();
  XLSX.writeFile(wb, filename);
}

// ═════════════════════════════════════════════════
// EXPORT FUNCTIONS — 1 hàm cho mỗi trang
// ═════════════════════════════════════════════════

window.exportHydroExcel = async function() {
  try {
    const cache = window.cache;
    if (!cache?.hydro) { window.showToast?.('Chưa có dữ liệu', 'danger'); return; }
    
    let rows = vals(cache.hydro);
    rows = applyFilter(rows, 'hydro', ['code', 'person', 'material', 'note']);
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    
    if (!rows.length) { window.showToast?.('Không có dữ liệu để xuất', 'danger'); return; }
    
    const headers = ['Mã TN', 'Ngày tạo', 'Người thực hiện', 'Vật liệu', 'Nhiệt độ (°C)', 'Thời gian', 'pH', 'Trạng thái', 'Ghi chú'];
    const data = rows.map(r => [
      r.code || '',
      r.createdAt || '',
      r.person || '',
      r.material || '',
      r.temp ?? '',
      r.time || '',
      r.ph ?? '',
      r.status || '',
      r.note || '',
    ]);
    
    const wb = await createWorkbook(data, headers, 'Thí nghiệm thủy nhiệt');
    await saveFile(wb, `hydrothermal_${todayStr()}.xlsx`);
    window.showToast?.(`Đã xuất ${rows.length} dòng`, 'success');
  } catch (e) {
    console.error('exportHydroExcel error:', e);
    window.showToast?.('Lỗi xuất Excel: ' + e.message, 'danger');
  }
};

window.exportElectrodeExcel = async function() {
  try {
    const cache = window.cache;
    if (!cache?.electrode) { window.showToast?.('Chưa có dữ liệu', 'danger'); return; }
    
    let rows = vals(cache.electrode);
    rows = applyFilter(rows, 'electrode', ['code', 'person', 'material', 'substrate']);
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    
    if (!rows.length) { window.showToast?.('Không có dữ liệu để xuất', 'danger'); return; }
    
    const headers = ['Mã ĐC', 'Ngày tạo', 'Người thực hiện', 'Vật liệu', 'Nền ĐC', 'V (μL)', 'S (cm²)', 'Tải lượng', 'Sấy', 'Trạng thái'];
    const data = rows.map(r => [
      r.code || '',
      r.createdAt || '',
      r.person || '',
      r.material || '',
      r.substrate || '',
      r.volume ?? '',
      r.area ?? '',
      r.loading ?? '',
      r.drying || '',
      r.status || '',
    ]);
    
    const wb = await createWorkbook(data, headers, 'Điện cực');
    await saveFile(wb, `electrode_${todayStr()}.xlsx`);
    window.showToast?.(`Đã xuất ${rows.length} dòng`, 'success');
  } catch (e) {
    console.error('exportElectrodeExcel error:', e);
    window.showToast?.('Lỗi xuất Excel: ' + e.message, 'danger');
  }
};

window.exportElectrochemExcel = async function() {
  try {
    const cache = window.cache;
    if (!cache?.electrochem) { window.showToast?.('Chưa có dữ liệu', 'danger'); return; }
    
    let rows = vals(cache.electrochem);
    rows = applyFilter(rows, 'ec', ['code', 'person', 'electrode', 'type', 'electrolyte']);
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    
    if (!rows.length) { window.showToast?.('Không có dữ liệu để xuất', 'danger'); return; }
    
    const headers = ['Mã đo', 'Ngày tạo', 'Người thực hiện', 'Vật liệu ĐC', 'Mã ĐC', 'Loại đo', 'Chất điện ly', 'η@10 (mV)', 'Tafel', 'Trạng thái'];
    const data = rows.map(r => [
      r.code || '',
      r.createdAt || '',
      r.person || '',
      r.material || '',
      r.electrode || '',
      r.type || '',
      r.electrolyte || '',
      r.eta ?? '',
      r.tafel ?? '',
      r.status || '',
    ]);
    
    const wb = await createWorkbook(data, headers, 'Điện hóa');
    await saveFile(wb, `electrochem_${todayStr()}.xlsx`);
    window.showToast?.(`Đã xuất ${rows.length} dòng`, 'success');
  } catch (e) {
    console.error('exportElectrochemExcel error:', e);
    window.showToast?.('Lỗi xuất Excel: ' + e.message, 'danger');
  }
};

window.exportChemicalsExcel = async function() {
  try {
    const cache = window.cache;
    if (!cache?.chemicals) { window.showToast?.('Chưa có dữ liệu', 'danger'); return; }
    
    let rows = vals(cache.chemicals);
    // Filter search nếu có
    const searchEl = document.getElementById('chemicals-search');
    const search = searchEl?.value?.trim() || '';
    if (search) {
      rows = rows.filter(r => 
        ['name', 'formula', 'cas', 'location'].some(k => fuzzy(r[k] || '', search))
      );
    }
    rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    
    if (!rows.length) { window.showToast?.('Không có dữ liệu để xuất', 'danger'); return; }
    
    const headers = ['Tên hóa chất', 'Công thức', 'M (g/mol)', 'Độ tinh khiết', 'Mã CAS', 'Nơi lưu trữ', 'Nhà cung cấp', 'Nhóm', 'Tồn kho', 'Đơn vị', 'Số lượng', 'Cảnh báo', 'Ngày tạo'];
    const data = rows.map(r => [
      r.name || '',
      r.formula || '',
      r.mw ?? '',
      r.purity || '',
      r.cas || '',
      r.location || '',
      r.vendor || '',
      r.group || '',
      r.stock ?? '',
      r.unit || 'g',
      r.qty ?? '',
      r.alert ?? '',
      r.createdAt || '',
    ]);
    
    const wb = await createWorkbook(data, headers, 'Hóa chất');
    await saveFile(wb, `chemicals_${todayStr()}.xlsx`);
    window.showToast?.(`Đã xuất ${rows.length} dòng`, 'success');
  } catch (e) {
    console.error('exportChemicalsExcel error:', e);
    window.showToast?.('Lỗi xuất Excel: ' + e.message, 'danger');
  }
};

window.exportEquipmentExcel = async function() {
  try {
    const cache = window.cache;
    if (!cache?.equipment) { window.showToast?.('Chưa có dữ liệu', 'danger'); return; }
    
    let rows = vals(cache.equipment);
    const searchEl = document.getElementById('equipment-search');
    const search = searchEl?.value?.trim() || '';
    if (search) {
      rows = rows.filter(r => 
        ['name', 'model', 'serial', 'brand', 'location'].some(k => fuzzy(r[k] || '', search))
      );
    }
    rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    
    if (!rows.length) { window.showToast?.('Không có dữ liệu để xuất', 'danger'); return; }
    
    const headers = ['Tên thiết bị', 'Model', 'Serial', 'Hãng', 'Nơi lưu trữ', 'Số lượng', 'Ngày nhập', 'Trạng thái'];
    const data = rows.map(r => [
      r.name || '',
      r.model || '',
      r.serial || '',
      r.brand || '',
      r.location || '',
      r.qty ?? '',
      r.createdAt || '',
      r.status || '',
    ]);
    
    const wb = await createWorkbook(data, headers, 'Thiết bị');
    await saveFile(wb, `equipment_${todayStr()}.xlsx`);
    window.showToast?.(`Đã xuất ${rows.length} dòng`, 'success');
  } catch (e) {
    console.error('exportEquipmentExcel error:', e);
    window.showToast?.('Lỗi xuất Excel: ' + e.message, 'danger');
  }
};


window.exportBookingsExcel = async function() {
  try {
    const cache = window.cache;
    if (!cache?.bookings) { window.showToast?.('Chưa có dữ liệu', 'danger'); return; }
    
    let rows = vals(cache.bookings);
    
    // Apply filter (search, status, equipment, mine)
    const search = document.getElementById('booking-search')?.value?.trim() || '';
    const statusFilter = document.getElementById('booking-status-filter')?.value || '';
    const equipmentFilter = document.getElementById('booking-equipment-filter')?.value || '';
    const mineFilter = document.getElementById('booking-mine-filter')?.value || 'all';
    const myUid = window.currentAuth?.uid;
    
    if (search) {
      rows = rows.filter(r => 
        [r.equipmentName, r.userName, r.purpose, r.code].some(v => fuzzy(v || '', search))
      );
    }
    if (statusFilter) rows = rows.filter(r => r.status === statusFilter);
    if (equipmentFilter) rows = rows.filter(r => r.equipmentKey === equipmentFilter);
    if (mineFilter === 'mine' && myUid) rows = rows.filter(r => r.userId === myUid);
    
    // Sort theo ngày + giờ
    rows.sort((a, b) => {
      const da = (a.date || '') + ' ' + (a.startTime || '');
      const db = (b.date || '') + ' ' + (b.startTime || '');
      return db.localeCompare(da);
    });
    
    if (!rows.length) { window.showToast?.('Không có dữ liệu để xuất', 'danger'); return; }
    
    const STATUS_LABEL = {
      'pending': 'Chờ duyệt',
      'approved': 'Đã duyệt',
      'in-use': 'Đang dùng',
      'completed': 'Hoàn thành',
      'rejected': 'Từ chối',
      'cancelled': 'Đã hủy',
    };
    
    const headers = ['Mã đặt', 'Người đặt', 'Thiết bị', 'Ngày', 'Giờ bắt đầu', 'Giờ kết thúc', 'Mục đích', 'Trạng thái', 'Lý do từ chối', 'Ngày đăng ký', 'Check-in', 'Check-out'];
    const data = rows.map(r => [
      r.code || '',
      r.userName || '',
      r.equipmentName || '',
      formatDateVN(r.date),
      r.startTime || '',
      r.endTime || '',
      r.purpose || '',
      STATUS_LABEL[r.status] || r.status || '',
      r.rejectedReason || '',
      formatDateTimeVN(r.createdAt),
      formatDateTimeVN(r.checkInAt),
      formatDateTimeVN(r.checkOutAt),
    ]);
    
    const wb = await createWorkbook(data, headers, 'Đăng ký thiết bị');
    await saveFile(wb, `bookings_${todayStr()}.xlsx`);
    window.showToast?.(`Đã xuất ${rows.length} dòng`, 'success');
  } catch (e) {
    console.error('exportBookingsExcel error:', e);
    window.showToast?.('Lỗi xuất Excel: ' + e.message, 'danger');
  }
};

// Helper: format YYYY-MM-DD → DD/MM/YYYY
function formatDateVN(d) {
  if (!d || !d.includes('-')) return d || '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Helper: format ISO → DD/MM/YYYY HH:MM
function formatDateTimeVN(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mn}`;
  } catch { return iso; }
}


console.log('[Excel Export] Module loaded. Available: exportHydroExcel, exportElectrodeExcel, exportElectrochemExcel, exportChemicalsExcel, exportEquipmentExcel');
