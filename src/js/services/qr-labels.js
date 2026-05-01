/**
 * services/qr-labels.js
 * Generate QR code labels — chỉ QR code, không kèm text
 *
 * VERSION 3: QR-only mode (đơn giản, chỉ in mã QR)
 *
 * Cài đặt:
 *   npm install qrcode jspdf
 */

import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

// ─── Config mặc định cho labels ────────────────────────────────────
const DEFAULT_CONFIG = {
  size: 25,             // mm - kích thước nhãn vuông (chỉ QR)
  cols: 7,              // số nhãn / hàng trên A4 (210mm / 25mm ~ 8 cột)
  rows: 10,             // số hàng / trang A4
  marginTop: 10,        // mm
  marginLeft: 10,       // mm
  gapH: 3,              // mm
  gapV: 3,              // mm
  baseUrl: '',          // empty → auto detect
}

function getLabelConfig() {
  const cache = window.cache || {}
  const dbSettings = (cache.settings && cache.settings.labels) || {}
  return { ...DEFAULT_CONFIG, ...dbSettings }
}

function getBaseUrl() {
  const config = getLabelConfig()
  if (config.baseUrl) return config.baseUrl
  return window.location.origin
}

// ─── Generate QR code dataURL ─────────────────────────────────────
async function generateQRDataURL(text, sizePx) {
  return await QRCode.toDataURL(text, {
    width: sizePx,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}

// ─── Build URL từ record ──────────────────────────────────────────
function buildDetailUrl(record, type) {
  return `${getBaseUrl()}/?detail=${type}:${record._key}`
}

// ─── Render 1 QR-only label HTML ──────────────────────────────────
function renderLabelHtml(qrDataURL, config) {
  return `
    <div class="qr-label" style="
      width:${config.size}mm;
      height:${config.size}mm;
      box-sizing:border-box;
      page-break-inside:avoid;
      overflow:hidden;
      background:white;
      display:flex;
      align-items:center;
      justify-content:center;
    ">
      <img src="${qrDataURL}" style="
        width:100%;
        height:100%;
        object-fit:contain;
      ">
    </div>
  `
}

async function buildLabelsPageHtml(records, type, config) {
  const labelsHtml = []
  for (const record of records) {
    const url = buildDetailUrl(record, type)
    const qrPx = Math.round(config.size * 11.8)
    const qrDataURL = await generateQRDataURL(url, qrPx)
    labelsHtml.push(renderLabelHtml(qrDataURL, config))
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Nhãn QR - LabBook BKU</title>
      <style>
        @page { size: A4; margin: 0; }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        body {
          margin: 0; padding: 0; background: white;
          font-family: Arial, sans-serif;
        }
        .qr-page {
          width: 210mm; min-height: 297mm;
          padding: ${config.marginTop}mm ${config.marginLeft}mm;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: repeat(${config.cols}, ${config.size}mm);
          gap: ${config.gapV}mm ${config.gapH}mm;
          align-content: start;
          justify-content: start;
        }
        .qr-toolbar {
          position: fixed; top: 12px; right: 12px;
          background: #0d9488; color: white;
          padding: 10px 16px; border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          display: flex; gap: 8px; z-index: 9999;
        }
        .qr-toolbar button {
          background: white; color: #0d9488; border: none;
          padding: 6px 14px; border-radius: 4px;
          font-weight: 600; cursor: pointer; font-size: 13px;
        }
        .qr-toolbar button:hover { background: #f0fdfa; }
      </style>
    </head>
    <body>
      <div class="qr-toolbar no-print">
        <span style="font-size:13px;align-self:center;font-weight:600">${records.length} nhãn QR</span>
        <button onclick="window.print()">🖨 In</button>
        <button onclick="window.close()">✕ Đóng</button>
      </div>
      <div class="qr-page">
        ${labelsHtml.join('')}
      </div>
    </body>
    </html>
  `
}

// ─── PUBLIC: Print mode ───────────────────────────────────────────
export async function printLabels(records, type) {
  if (!records || !records.length) {
    if (window.showToast) window.showToast('Không có dữ liệu để in', 'danger')
    return
  }
  try {
    if (window.showToast) window.showToast(`Đang tạo ${records.length} nhãn...`, 'info')
    const config = getLabelConfig()
    const html = await buildLabelsPageHtml(records, type, config)

    const win = window.open('', '_blank')
    if (!win) {
      if (window.showToast) window.showToast('Trình duyệt chặn pop-up. Hãy cho phép pop-up.', 'danger')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()

    win.onload = () => setTimeout(() => win.print(), 300)
    if (window.showToast) window.showToast('Đã mở trang in', 'success')
  } catch (err) {
    console.error('[qr-labels] printLabels failed', err)
    if (window.showToast) window.showToast('Lỗi tạo nhãn: ' + err.message, 'danger')
  }
}

// ─── PUBLIC: PDF download mode ────────────────────────────────────
export async function downloadLabelsPDF(records, type) {
  if (!records || !records.length) {
    if (window.showToast) window.showToast('Không có dữ liệu', 'danger')
    return
  }
  try {
    if (window.showToast) window.showToast(`Đang tạo PDF ${records.length} nhãn...`, 'info')
    const config = getLabelConfig()
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

    let col = 0, row = 0
    const labelsPerPage = config.cols * config.rows

    for (let i = 0; i < records.length; i++) {
      if (i > 0 && i % labelsPerPage === 0) {
        doc.addPage()
        col = 0
        row = 0
      }

      const record = records[i]
      const url = buildDetailUrl(record, type)

      const x = config.marginLeft + col * (config.size + config.gapH)
      const y = config.marginTop + row * (config.size + config.gapV)

      const qrPx = Math.round(config.size * 11.8)
      const qrDataURL = await generateQRDataURL(url, qrPx)
      doc.addImage(qrDataURL, 'PNG', x, y, config.size, config.size)

      col++
      if (col >= config.cols) {
        col = 0
        row++
      }
    }

    const filename = `nhan-qr-${type === 'chem' ? 'hoachat' : 'thietbi'}-${new Date().toISOString().slice(0,10)}.pdf`
    doc.save(filename)

    if (window.showToast) window.showToast(`Đã tải ${filename}`, 'success')
  } catch (err) {
    console.error('[qr-labels] downloadLabelsPDF failed', err)
    if (window.showToast) window.showToast('Lỗi tạo PDF: ' + err.message, 'danger')
  }
}

// ─── PUBLIC: Single record ────────────────────────────────────────
export async function printSingleLabel(key, type, mode = 'print') {
  const cache = window.cache
  if (!cache) return
  const collection = type === 'chem' ? 'chemicals' : 'equipment'
  const record = cache[collection]?.[key]
  if (!record) {
    if (window.showToast) window.showToast('Không tìm thấy record', 'danger')
    return
  }
  const recordWithKey = { ...record, _key: key }
  if (mode === 'pdf') {
    await downloadLabelsPDF([recordWithKey], type)
  } else {
    await printLabels([recordWithKey], type)
  }
}

// ─── PUBLIC: Bulk records ─────────────────────────────────────────
export async function printBulkLabels(keys, type, mode = 'print') {
  const cache = window.cache
  if (!cache) return
  const collection = type === 'chem' ? 'chemicals' : 'equipment'
  const records = keys
    .map(k => cache[collection]?.[k] && { ...cache[collection][k], _key: k })
    .filter(Boolean)
  if (!records.length) {
    if (window.showToast) window.showToast('Không có record', 'danger')
    return
  }
  if (mode === 'pdf') {
    await downloadLabelsPDF(records, type)
  } else {
    await printLabels(records, type)
  }
}

// ─── PUBLIC: Choice dialog ────────────────────────────────────────
export function showLabelChoiceDialog(records, type) {
  const choice = window.prompt(
    `Bạn muốn xử lý ${records.length} nhãn QR như thế nào?\n\n` +
    `1 = In trực tiếp (mở tab mới + Ctrl+P)\n` +
    `2 = Tải PDF về máy\n\n` +
    `Nhập 1 hoặc 2:`,
    '1'
  )
  if (choice === '1') {
    return printLabels(records, type)
  } else if (choice === '2') {
    return downloadLabelsPDF(records, type)
  }
}
