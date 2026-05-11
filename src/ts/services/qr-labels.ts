/**
 * services/qr-labels.ts
 * Generate QR code labels — chi QR code, khong kem text
 *
 * VERSION 3: QR-only mode (don gian, chi in ma QR)
 *
 * Cai dat:
 *   npm install qrcode jspdf
 */

// Round 103: lazy-load both QRCode + jsPDF to keep ~600KB out of
// the initial modulepreload chain. They only run when user clicks
// "Print QR labels" in bulk-actions menu.
let _qrCodePromise: Promise<any> | null = null;
let _jsPDFPromise: Promise<any> | null = null;

async function loadQRCode(): Promise<any> {
  if (!_qrCodePromise) {
    _qrCodePromise = import('qrcode').then(m => m.default || m);
  }
  return _qrCodePromise;
}

async function loadJsPDF(): Promise<any> {
  if (!_jsPDFPromise) {
    _jsPDFPromise = import('jspdf').then((m: any) => m.jsPDF || m.default?.jsPDF || m.default);
  }
  return _jsPDFPromise;
}

interface LabelConfig {
  size: number;
  cols: number;
  rows: number;
  marginTop: number;
  marginLeft: number;
  gapH: number;
  gapV: number;
  baseUrl: string;
}

interface LabelRecord {
  _key: string;
  [field: string]: unknown;
}

// ─── Config mac dinh cho labels ────────────────────────────────────
const DEFAULT_CONFIG: LabelConfig = {
  size: 25,             // mm - kich thuoc nhan vuong (chi QR)
  cols: 7,              // so nhan / hang tren A4 (210mm / 25mm ~ 8 cot)
  rows: 10,             // so hang / trang A4
  marginTop: 10,        // mm
  marginLeft: 10,       // mm
  gapH: 3,              // mm
  gapV: 3,              // mm
  baseUrl: '',          // empty -> auto detect
}

function getLabelConfig(): LabelConfig {
  const cache = (window.cache || {}) as any;
  const dbSettings = (cache.settings && cache.settings.labels) || {};
  return { ...DEFAULT_CONFIG, ...dbSettings };
}

function getBaseUrl(): string {
  const config = getLabelConfig();
  if (config.baseUrl) return config.baseUrl;
  return window.location.origin;
}

// ─── Generate QR code dataURL ─────────────────────────────────────
async function generateQRDataURL(text: string, sizePx: number): Promise<string> {
  const QRCode = await loadQRCode();
  return await QRCode.toDataURL(text, {
    width: sizePx,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

// ─── Build URL tu record ──────────────────────────────────────────
function buildDetailUrl(record: LabelRecord, type: string): string {
  return `${getBaseUrl()}/?detail=${type}:${record._key}`;
}

// ─── Render 1 QR-only label HTML ──────────────────────────────────
function renderLabelHtml(qrDataURL: string, config: LabelConfig): string {
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
  `;
}

async function buildLabelsPageHtml(records: LabelRecord[], type: string, config: LabelConfig): Promise<string> {
  const labelsHtml: string[] = [];
  for (const record of records) {
    const url = buildDetailUrl(record, type);
    const qrPx = Math.round(config.size * 11.8);
    const qrDataURL = await generateQRDataURL(url, qrPx);
    labelsHtml.push(renderLabelHtml(qrDataURL, config));
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Nhan QR - LabBook BKU</title>
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
          background: #0EA5E9; color: white;
          padding: 10px 16px; border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          display: flex; gap: 8px; z-index: 9999;
        }
        .qr-toolbar button {
          background: white; color: #0EA5E9; border: none;
          padding: 6px 14px; border-radius: 4px;
          font-weight: 600; cursor: pointer; font-size: 13px;
        }
        .qr-toolbar button:hover { background: #F0F9FF; }
      </style>
    </head>
    <body>
      <div class="qr-toolbar no-print">
        <span style="font-size:13px;align-self:center;font-weight:600">${records.length} nhãn QR</span>
        <button onclick="window.print()">In</button>
        <button onclick="window.close()">Đóng</button>
      </div>
      <div class="qr-page">
        ${labelsHtml.join('')}
      </div>
    </body>
    </html>
  `;
}

// ─── PUBLIC: Print mode ───────────────────────────────────────────
export async function printLabels(records: LabelRecord[], type: string): Promise<void> {
  if (!records || !records.length) {
    if (window.showToast) window.showToast('Khong co du lieu de in', 'danger' as any);
    return;
  }
  try {
    if (window.showToast) window.showToast(`Dang tao ${records.length} nhan...`, 'info' as any);
    const config = getLabelConfig();
    const html = await buildLabelsPageHtml(records, type, config);

    const win = window.open('', '_blank');
    if (!win) {
      if (window.showToast) window.showToast('Trinh duyet chan pop-up. Hay cho phep pop-up.', 'danger' as any);
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();

    win.onload = () => setTimeout(() => win.print(), 300);
    if (window.showToast) window.showToast('Da mo trang in', 'success' as any);
  } catch (err: any) {
    console.error('[qr-labels] printLabels failed', err);
    if (window.showToast) window.showToast('Loi tao nhan: ' + err.message, 'danger' as any);
  }
}

// ─── PUBLIC: PDF download mode ────────────────────────────────────
export async function downloadLabelsPDF(records: LabelRecord[], type: string): Promise<void> {
  if (!records || !records.length) {
    if (window.showToast) window.showToast('Khong co du lieu', 'danger' as any);
    return;
  }
  try {
    if (window.showToast) window.showToast(`Dang tao PDF ${records.length} nhan...`, 'info' as any);
    const config = getLabelConfig();
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    let col = 0, row = 0;
    const labelsPerPage = config.cols * config.rows;

    for (let i = 0; i < records.length; i++) {
      if (i > 0 && i % labelsPerPage === 0) {
        doc.addPage();
        col = 0;
        row = 0;
      }

      const record = records[i];
      const url = buildDetailUrl(record, type);

      const x = config.marginLeft + col * (config.size + config.gapH);
      const y = config.marginTop + row * (config.size + config.gapV);

      const qrPx = Math.round(config.size * 11.8);
      const qrDataURL = await generateQRDataURL(url, qrPx);
      doc.addImage(qrDataURL, 'PNG', x, y, config.size, config.size);

      col++;
      if (col >= config.cols) {
        col = 0;
        row++;
      }
    }

    const filename = `nhan-qr-${type === 'chem' ? 'hoachat' : 'thietbi'}-${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(filename);

    if (window.showToast) window.showToast(`Da tai ${filename}`, 'success' as any);
  } catch (err: any) {
    console.error('[qr-labels] downloadLabelsPDF failed', err);
    if (window.showToast) window.showToast('Loi tao PDF: ' + err.message, 'danger' as any);
  }
}

// ─── PUBLIC: Single record ────────────────────────────────────────
export async function printSingleLabel(key: string, type: string, mode: string = 'print'): Promise<void> {
  const cache = window.cache as any;
  if (!cache) return;
  const collection = type === 'chem' ? 'chemicals' : 'equipment';
  const record = cache[collection]?.[key];
  if (!record) {
    if (window.showToast) window.showToast('Khong tim thay record', 'danger' as any);
    return;
  }
  const recordWithKey: LabelRecord = { ...record, _key: key };
  if (mode === 'pdf') {
    await downloadLabelsPDF([recordWithKey], type);
  } else {
    await printLabels([recordWithKey], type);
  }
}

// ─── PUBLIC: Bulk records ─────────────────────────────────────────
export async function printBulkLabels(keys: string[], type: string, mode: string = 'print'): Promise<void> {
  const cache = window.cache as any;
  if (!cache) return;
  const collection = type === 'chem' ? 'chemicals' : 'equipment';
  const records = keys
    .map(k => cache[collection]?.[k] && { ...cache[collection][k], _key: k })
    .filter(Boolean) as LabelRecord[];
  if (!records.length) {
    if (window.showToast) window.showToast('Khong co record', 'danger' as any);
    return;
  }
  if (mode === 'pdf') {
    await downloadLabelsPDF(records, type);
  } else {
    await printLabels(records, type);
  }
}

// ─── PUBLIC: Choice dialog ────────────────────────────────────────
export function showLabelChoiceDialog(records: LabelRecord[], type: string): Promise<void> | undefined {
  const choice = window.prompt(
    `Bạn muốn xử lý ${records.length} nhãn QR như thế nào?\n\n` +
    `1 = In trực tiếp (mở tab mới + Ctrl+P)\n` +
    `2 = Tải PDF về máy\n\n` +
    `Nhập 1 hoặc 2:`,
    '1'
  );
  if (choice === '1') {
    return printLabels(records, type);
  } else if (choice === '2') {
    return downloadLabelsPDF(records, type);
  }
  return undefined;
}
