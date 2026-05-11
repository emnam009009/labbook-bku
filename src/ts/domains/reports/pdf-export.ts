// src/ts/services/pdf/pdf-report.ts
// @ts-nocheck — Service layer — DOM event handlers + legacy patterns. Defer typing until UI rewrite.
// Generate PDF report cho thí nghiệm hydro/electrode.
//
// Layout (multi-page):
//   Page 1: Header metadata (mã, người, ngày, vật liệu, điều kiện...)
//   Page 2..N: Mỗi trang 1 ảnh đính kèm (PNG plot hoặc ảnh SEM/TEM) với caption
//
// Library: jspdf (đã có trong dependencies)
//
// Tiếng Việt: jspdf không có font Việt sẵn. Có 2 cách:
//   (a) Embed font Roboto via base64 — chuẩn nhưng bundle to (+200KB)
//   (b) Dùng font helvetica có sẵn — không hiển thị dấu đúng
// → Tôi đi cách (b) đơn giản trước, nếu user cần dấu đẹp sẽ embed sau.
//
// Workaround tạm: convert text Việt sang ASCII trước khi vẽ (mất dấu nhưng đọc được).

import { ATTACHMENT_CATEGORIES } from "@/domains/data-assets/attachments";

let _jsPDFCtor = null;
let _fontDataReg = null;
let _fontDataBold = null;

async function loadJsPDF() {
  if (_jsPDFCtor) return _jsPDFCtor;
  const mod = await import('jspdf');
  _jsPDFCtor = mod.jsPDF || mod.default?.jsPDF || mod.default;
  return _jsPDFCtor;
}

// Load font TTF as base64. Vite asset import với ?url cho ra URL,
// rồi fetch + convert. ?inline cho ra data URL trực tiếp nhưng tăng main bundle.
async function loadFontBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tải font thất bại: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  // Convert ArrayBuffer → base64 (avoid String.fromCharCode stack overflow trên file lớn)
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function ensureFonts() {
  if (_fontDataReg && _fontDataBold) return;
  console.log('[pdf] ensureFonts: fetching TTF from /fonts/...');
  [_fontDataReg, _fontDataBold] = await Promise.all([
    loadFontBase64('/fonts/NotoSans-Regular.subset.ttf'),
    loadFontBase64('/fonts/NotoSans-Bold.subset.ttf'),
  ]);
  console.log('[pdf] fonts loaded:', {
    reg: _fontDataReg.length, bold: _fontDataBold.length,
  });
}

function registerNotoSans(doc) {
  if (!_fontDataReg) return false;
  try {
    doc.addFileToVFS('NotoSans-Regular.ttf', _fontDataReg);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    if (_fontDataBold) {
      doc.addFileToVFS('NotoSans-Bold.ttf', _fontDataBold);
      doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
    }
    return true;
  } catch (e) {
    console.warn('[pdf] registerNotoSans failed:', e);
    return false;
  }
}

/**
 * Strip Vietnamese diacritics for jspdf default font compatibility.
 * Giữ lại chữ tiếng Việt đọc được, chỉ mất dấu.
 */

/**
 * Convert image URL to data URL via fetch + blob.
 * Used to embed PNG into PDF.
 */
async function imageUrlToDataURL(url) {
  // Try fetch directly first; if CORS fails, fall back to Firebase SDK.
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await blobToDataURL(blob);
  } catch (e) {
    throw new Error(`Tải ảnh thất bại: ${e.message}`);
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Get image dimensions from data URL (for aspect-ratio fitting).
 */
function getImageSize(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error('Không đọc được kích thước ảnh'));
    img.src = dataURL;
  });
}

/**
 * Page sizes (mm).
 */
export const PAGE_SIZES = {
  a4: { width: 210, height: 297, label: 'A4 (210×297 mm)' },
  letter: { width: 216, height: 279, label: 'Letter (216×279 mm)' },
};

/**
 * Build header table rows from experiment metadata.
 * @param {object} record - hydro/electrode record from cache
 * @param {string} refType - 'hydro' | 'electrode'
 */
function buildMetadataRows(record, refType) {
  const r = record || {};
  const rows = [];

  rows.push(['Mã thí nghiệm', String(r.code || '—')]);
  rows.push(['Loại', refType === 'hydro' ? 'Hydrothermal' : 'Electrode']);
  rows.push(['Nguoi thuc hien / Person', r.person || '—']);
  rows.push(['Ngày tạo', String(r.createdAt || r.date || '—')]);
  rows.push(['Vat lieu / Material', r.material || '—']);

  if (refType === 'hydro') {
    rows.push(['Nhiệt độ', `${r.temp || '—'} °C`]);
    rows.push(['Thời gian', `${r.time || '—'} h`]);
    if (r.ph) rows.push(['pH', String(r.ph)]);
  } else {
    if (r.substrate) rows.push(['Nen / Substrate', String(r.substrate)]);
    if (r.vol) rows.push(['Vol', String(r.vol)]);
    if (r.area) rows.push(['Area', String(r.area)]);
    if (r.loading) rows.push(['Loading', String(r.loading)]);
    if (r.annealT) rows.push(['Annealing', `${r.annealT} °C / ${r.annealH || '?'} h`]);
  }

  rows.push(['Trang thai / Status', r.status || '—']);
  if (r.note) rows.push(['Ghi chu / Note', String(r.note)]);

  return rows;
}

/**
 * Generate PDF from selected attachments.
 *
 * @param {object} opts
 * @param {object} opts.record - hydro/electrode record
 * @param {string} opts.refType
 * @param {string} opts.refId
 * @param {Array} opts.attachments - selected attachments (full meta objects)
 * @param {string} opts.pageSize - 'a4' | 'letter'
 * @param {function} opts.onProgress - (current, total, fileName) callback
 * @returns {Blob} PDF blob
 */
export async function generatePdfReport({
  record,
  refType,
  refId,
  attachments,
  pageSize = 'a4',
  orientation = 'portrait',
  onProgress = null,
}) {
  const jsPDF = await loadJsPDF();
  const baseSz = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
  // Adjust dimensions based on orientation
  const sz = orientation === 'landscape'
    ? { width: baseSz.height, height: baseSz.width, label: baseSz.label }
    : baseSz;

  // Ensure Noto Sans loaded (for Vietnamese diacritics + scientific symbols)
  try {
    await ensureFonts();
  } catch (e) {
    console.warn('[pdf] font Noto Sans load failed, fallback helvetica:', e);
  }

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: [baseSz.width, baseSz.height],
  });

  const useNoto = registerNotoSans(doc);
  console.log('[pdf] useNoto:', useNoto, 'FONT:', useNoto ? 'NotoSans' : 'helvetica');
  const FONT = useNoto ? 'NotoSans' : 'helvetica';

  // ─────────── PAGE 1: Metadata ───────────
  doc.setFont(FONT, 'bold');
  doc.setFontSize(18);
  const title = `BÁO CÁO THÍ NGHIỆM`;
  doc.text(title, sz.width / 2, 20, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont(FONT, 'normal');
  const sub = `${refType === 'hydro' ? 'Hydrothermal' : 'Electrode'} — ${record?.code || refId}`;
  doc.text(sub, sz.width / 2, 28, { align: 'center' });

  // Metadata table
  const rows = buildMetadataRows(record, refType);
  let y = 42;
  const col1X = 20;
  const col2X = 80;
  const lineH = 7;

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(col1X, y - 4, sz.width - 20, y - 4);

  rows.forEach((r, i) => {
    if (y > sz.height - 25) {
      doc.addPage();
      y = 20;
    }
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.text(r[0], col1X, y);
    doc.setFont(FONT, 'normal');
    // Wrap long text
    const lines = doc.splitTextToSize(r[1], sz.width - col2X - 20);
    doc.text(lines, col2X, y);
    y += lineH * Math.max(1, lines.length);
  });

  // Footer line
  doc.line(col1X, y, sz.width - 20, y);
  y += 6;

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Số tài liệu đính kèm: ${attachments.length}`,
    col1X, y
  );
  doc.text(
    `Tạo lúc: ${new Date().toLocaleString('vi-VN')}`,
    sz.width - 20, y, { align: 'right' }
  );
  doc.setTextColor(0);

  // ─────────── PAGES 2+: Grid 2×2 (4 images per page) ───────────
  // Layout A4 portrait (210x297mm):
  //   Margin top: 25mm (page header)
  //   Margin bottom: 15mm (page number)
  //   Margin x: 15mm
  //   Grid usable: 180 x 257 mm
  //   Cell with gap 6mm: 87 x 125.5 mm
  //   Title 6mm on top, image 16:9 below

  const PAGE_HEAD_MARGIN = 12;
  const PAGE_FOOT_MARGIN = 10;
  const PAGE_X_MARGIN = 5;
  const GAP = 2;
  const TITLE_H = 5;

  // Grid layout: portrait 2x2 (4 ảnh), landscape 3x2 (6 ảnh)
  const GRID_COLS = orientation === 'landscape' ? 3 : 2;
  const GRID_ROWS = 2;
  const CELLS_PER_PAGE = GRID_COLS * GRID_ROWS;

  const usableW = sz.width - 2 * PAGE_X_MARGIN;
  const usableH = sz.height - PAGE_HEAD_MARGIN - PAGE_FOOT_MARGIN;
  const cellW = (usableW - GAP * (GRID_COLS - 1)) / GRID_COLS;
  const cellH = (usableH - GAP * (GRID_ROWS - 1)) / GRID_ROWS;
  const imgAreaH = cellH - TITLE_H - 2;  // -2 cho space giữa title và image

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    onProgress?.(i + 1, attachments.length, att.fileName);
    console.log(`[pdf] processing ${i+1}/${attachments.length}: ${att.fileName} (${att.mimeType})`);

    const idxInPage = i % CELLS_PER_PAGE;  // 0,1,2,3 → vị trí trong grid
    if (idxInPage === 0) {
      doc.addPage();
      // Page header (chỉ cho first cell)
      doc.setFont(FONT, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(80);
      doc.text(
        `Hình ảnh đính kèm — Trang ${Math.floor(i / CELLS_PER_PAGE) + 1}`,
        sz.width / 2, 8, { align: 'center' }
      );
      doc.setTextColor(0);
    }

    // Tính position cell (row, col)
    const row = Math.floor(idxInPage / GRID_COLS);
    const col = idxInPage % GRID_COLS;
    const cellX = PAGE_X_MARGIN + col * (cellW + GAP);
    const cellY = PAGE_HEAD_MARGIN + row * (cellH + GAP);

    // Title (CATEGORY — fileName) — wrap nếu dài
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(40);
    const catLabel = ATTACHMENT_CATEGORIES[att.category]?.label || att.category;
    const titleText = `${catLabel} — ${att.fileName}`;
    const titleLines = doc.splitTextToSize(titleText, cellW);
    // Vẽ title (chỉ 1 dòng đầu nếu nhiều dòng — tránh đè image)
    doc.text(titleLines[0], cellX + cellW / 2, cellY + 4, { align: 'center' });
    doc.setTextColor(0);

    // Image area
    const imgAreaY = cellY + TITLE_H + 2;
    const isImage = /^image\//.test(att.mimeType);

    if (!isImage) {
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(
        '(không phải ảnh)',
        cellX + cellW / 2,
        imgAreaY + imgAreaH / 2,
        { align: 'center' }
      );
      doc.setTextColor(0);
      continue;
    }

    try {
      const dataURL = await imageUrlToDataURL(att.downloadURL);
      const dim = await getImageSize(dataURL);

      // Fit image vào (cellW, imgAreaH) giữ aspect ratio
      const ratio = Math.min(cellW / dim.width, imgAreaH / dim.height);
      const drawW = dim.width * ratio;
      const drawH = dim.height * ratio;
      const drawX = cellX + (cellW - drawW) / 2;
      const drawY = imgAreaY + (imgAreaH - drawH) / 2;

      const fmt = /^data:image\/png/i.test(dataURL) ? 'PNG' : 'JPEG';
      doc.addImage(dataURL, fmt, drawX, drawY, drawW, drawH, undefined, 'FAST');

      // Optional: viền nhẹ quanh cell
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.rect(cellX, cellY, cellW, cellH);
    } catch (e) {
      doc.setFontSize(9);
      doc.setTextColor(200, 0, 0);
      doc.text(
        `[Lỗi: ${e.message.slice(0, 30)}]`,
        cellX + cellW / 2,
        imgAreaY + imgAreaH / 2,
        { align: 'center' }
      );
      doc.setTextColor(0);
    }
  }

  // Page numbers
  const totalPages = doc.internal.pages.length - 1; // jspdf 1-indexed
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Trang ${p}/${totalPages}`, sz.width / 2, sz.height - 4, { align: 'center' });
    doc.setTextColor(0);
  }

  console.log('[pdf] doc ready, generating blob...');
  const blob = doc.output('blob');
  console.log('[pdf] blob size:', blob.size);
  return blob;
}

/**
 * Trigger browser download of a Blob.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
