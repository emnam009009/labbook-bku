/**
 * data-assets.ts — DataAsset CRUD service (R153a — Phase B.5).
 *
 * Storage backend: Firebase Storage (file binary) + Firestore (metadata).
 * Path: dataAssets/{tenantId}/{experimentId}/{fileName}
 *
 * Future (R153d): classifier integration; (R130+ TODO): Python service
 * for analysis — but DataAsset itself is just storage + metadata, agnostic.
 */

import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  ref as stRef, uploadBytesResumable, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { fdb, storage, auth } from '../firebase.js';
import type {
  DataAsset, CreateDataAssetInput, UpdateDataAssetInput, DataAssetType,
} from '../types/research.js';

const COLLECTION = 'dataAssets';
const TENANT_ID = 'default';  // Lab BKU; commercial fork will read from claim
const MAX_FILE_SIZE = 25 * 1024 * 1024;  // 25 MB

// Allowed mime types per DataAssetType (defensive validation client-side;
// authoritative check is in storage.rules)
const ALLOWED_MIME: Record<DataAssetType, RegExp[]> = {
  'xrd':              [/^text\/csv$/, /^text\/plain$/, /^application\/.*excel/, /\.xy$/],
  'sem':              [/^image\//],
  'tem':              [/^image\//],
  'raman':            [/^text\/csv$/, /^text\/plain$/, /^image\//],
  'ftir':             [/^text\/csv$/, /^text\/plain$/, /^image\//],
  'uv-vis':           [/^text\/csv$/, /^text\/plain$/, /^image\//],
  'uv-vis-drs':       [/^text\/csv$/, /^text\/plain$/, /^image\//],
  'pl':               [/^text\/csv$/, /^text\/plain$/, /^image\//],
  'eds':              [/^image\//, /^text\/csv$/, /^application\/pdf$/],
  'xps':              [/^text\/csv$/, /^text\/plain$/, /^image\//, /^application\//],
  'electrochem-csv':  [/^text\/csv$/, /^text\/plain$/, /^application\/.*excel/],
  'image':            [/^image\//],
  'document':         [/^application\/pdf$/, /^application\/msword/, /^application\/.*officedocument/],
  'other':            [/.*/],
};

function getCurrentUid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error('Chưa đăng nhập');
  return u.uid;
}

function buildStoragePath(tenantId: string, experimentId: string, fileName: string): string {
  // Sanitize fileName: replace /, \, : with _
  const safe = fileName.replace(/[\/\\:]/g, '_');
  // Add timestamp prefix to avoid collisions
  const stamp = Date.now();
  return `dataAssets/${tenantId}/${experimentId}/${stamp}-${safe}`;
}

/**
 * Upload file to Storage + create Firestore doc.
 * Returns the new DataAsset id.
 *
 * Caller responsibilities:
 *  - Pre-validate file size (< MAX_FILE_SIZE)
 *  - Pre-classify type (caller passes type)
 */
export async function uploadDataAsset(
  file: File,
  input: Omit<CreateDataAssetInput, 'fileName' | 'fileSize' | 'mimeType' | 'storagePath'>,
  onProgress?: (pct: number) => void,
): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File quá lớn: ${(file.size / 1024 / 1024).toFixed(1)}MB > 25MB`);
  }
  // Mime check (client-side soft validation; storage.rules is authoritative)
  const mimePatterns = ALLOWED_MIME[input.type] || ALLOWED_MIME.other;
  const mimeOk = mimePatterns.some(re => re.test(file.type) || re.test(file.name));
  if (!mimeOk) {
    throw new Error(`Loại file không phù hợp với ${input.type}: ${file.type || file.name}`);
  }

  const uid = getCurrentUid();
  const storagePath = buildStoragePath(TENANT_ID, input.experimentId, file.name);

  // Upload to Storage
  const fileRef = stRef(storage, storagePath);
  const task = uploadBytesResumable(fileRef, file, {
    customMetadata: { uid, experimentId: input.experimentId },
  });

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes > 0) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      (err) => reject(err),
      () => resolve(),
    );
  });

  // Create Firestore doc
  const docPayload = {
    tenantId: TENANT_ID,
    experimentId: input.experimentId,
    sampleId: input.sampleId,
    type: input.type,
    subType: input.subType,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    storagePath,
    notes: input.notes,
    tags: input.tags || [],
    analysisStatus: 'none' as const,
    metadata: {},
    uploadedAt: serverTimestamp(),
    uploadedBy: uid,
    createdAt: serverTimestamp(),
    createdBy: uid,
  };
  // Strip undefined fields (Firestore rejects)
  Object.keys(docPayload).forEach(k => {
    if ((docPayload as any)[k] === undefined) delete (docPayload as any)[k];
  });

  const ref = await addDoc(collection(fdb, COLLECTION), docPayload);
  return ref.id;
}

/**
 * Get download URL for a DataAsset (resolves Storage path).
 */
export async function getDataAssetURL(asset: DataAsset): Promise<string> {
  const fileRef = stRef(storage, asset.storagePath);
  return await getDownloadURL(fileRef);
}

/**
 * List DataAssets for an experiment, ordered by upload date desc.
 */
export async function listByExperiment(experimentId: string): Promise<DataAsset[]> {
  const q = query(
    collection(fdb, COLLECTION),
    where('tenantId', '==', TENANT_ID),
    where('experimentId', '==', experimentId),
    orderBy('uploadedAt', 'desc'),
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DataAsset));
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes('NOT_FOUND') || msg.includes('5 NOT_FOUND')) return [];
    throw err;
  }
}

/**
 * List DataAssets by type (across experiments). Useful for gallery view.
 */
export async function listByType(type: DataAssetType): Promise<DataAsset[]> {
  const q = query(
    collection(fdb, COLLECTION),
    where('tenantId', '==', TENANT_ID),
    where('type', '==', type),
    orderBy('uploadedAt', 'desc'),
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DataAsset));
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes('NOT_FOUND') || msg.includes('5 NOT_FOUND')) return [];
    throw err;
  }
}

/**
 * Get single DataAsset.
 */
export async function getDataAsset(id: string): Promise<DataAsset | null> {
  const ref = doc(fdb, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as DataAsset;
}

/**
 * Update DataAsset metadata (file is immutable).
 */
export async function updateDataAsset(
  id: string,
  patch: UpdateDataAssetInput,
): Promise<void> {
  const uid = getCurrentUid();
  const ref = doc(fdb, COLLECTION, id);
  const payload: Record<string, unknown> = {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
  Object.keys(payload).forEach(k => {
    if (payload[k] === undefined) delete payload[k];
  });
  await updateDoc(ref, payload);
}

/**
 * Delete DataAsset (Firestore doc + Storage file).
 * Best-effort: if Storage delete fails, Firestore doc still removed
 * (file becomes orphaned — cleanup script future).
 */
export async function deleteDataAsset(id: string): Promise<void> {
  const asset = await getDataAsset(id);
  if (!asset) return;
  // Delete Firestore doc first (rules check)
  await deleteDoc(doc(fdb, COLLECTION, id));
  // Then Storage file (best-effort)
  try {
    await deleteObject(stRef(storage, asset.storagePath));
  } catch (err) {
    console.warn('[deleteDataAsset] Storage delete failed (orphaned file):', err);
  }
}

// Helper for UI: format file size human-readable
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Helper for UI: convert Firestore Timestamp to Date
export function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Timestamp) return ts.toDate();
  if (typeof ts === 'string') return new Date(ts);
  if (typeof (ts as any)?.toDate === 'function') return (ts as any).toDate();
  return null;
}


// ═══════════════════════════════════════════════════════════
// R153d — Content-aware classifier
// ═══════════════════════════════════════════════════════════

export interface ClassifyResult {
  type: DataAssetType;
  confidence: number;  // 0-1
  reason: string;      // Human-readable explanation (Vietnamese)
}

/**
 * Read first ~10KB of file as text. Returns null if read fails.
 */
async function readFileHead(file: File): Promise<string | null> {
  try {
    // Read first 10KB only (enough for header + several data rows)
    const blob = file.slice(0, 10 * 1024);
    return await blob.text();
  } catch (err) {
    console.warn('[classify] readFileHead failed', err);
    return null;
  }
}

/**
 * Parse CSV/TSV content into header + sample rows.
 * Auto-detects delimiter (comma, tab, semicolon, space).
 */
function parseCSVHead(text: string): { header: string[]; rows: number[][]; rawHeader: string } {
  // Find first non-comment, non-blank line as potential header
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('%'));
  if (lines.length === 0) return { header: [], rows: [], rawHeader: '' };

  const headerLine = lines[0];
  // Detect delimiter: count occurrences in header
  const delims = [',', '\t', ';', /\s+/];
  let bestDelim: string | RegExp = ',';
  let bestCount = 0;
  for (const d of delims) {
    const count = typeof d === 'string'
      ? (headerLine.match(new RegExp(d, 'g')) || []).length
      : (headerLine.match(d) || []).length;
    if (count > bestCount) { bestCount = count; bestDelim = d; }
  }

  const split = (line: string) =>
    typeof bestDelim === 'string'
      ? line.split(bestDelim).map(s => s.trim())
      : line.split(bestDelim).map(s => s.trim()).filter(Boolean);

  const header = split(headerLine);
  const rows: number[][] = [];
  for (let i = 1; i < Math.min(lines.length, 12); i++) {
    const parts = split(lines[i]);
    const nums = parts.map(p => parseFloat(p)).filter(n => !isNaN(n));
    if (nums.length >= 2) rows.push(nums);
  }

  return { header, rows, rawHeader: headerLine };
}

/**
 * Check if first column of rows is within a given range (with tolerance).
 */
function isColumnInRange(rows: number[][], colIdx: number, min: number, max: number): boolean {
  if (rows.length < 3) return false;
  const vals = rows.map(r => r[colIdx]).filter(v => v != null && !isNaN(v));
  if (vals.length < 3) return false;
  const sorted = vals.slice().sort((a, b) => a - b);
  const firstQuart = sorted[Math.floor(sorted.length * 0.1)];
  const lastQuart = sorted[Math.floor(sorted.length * 0.9)];
  return firstQuart >= min && lastQuart <= max;
}

/**
 * Classify CSV/text content. Returns best match with confidence.
 */
/**
 * Parse JCAMP-DX style tags (TAG_NAME\tVALUE or TAG_NAME VALUE).
 * Returns map of uppercase tag → value (also uppercase for matching).
 */
function parseJCAMPTags(text: string): Map<string, string> {
  const tags = new Map<string, string>();
  const lines = text.split(/\r?\n/).slice(0, 30);
  for (const line of lines) {
    // Tag lines: start with letter, contain tab or 2+ spaces separator
    const m = /^([A-Z][A-Z0-9_ /]+?)[\t]+(.+)$/.exec(line);
    if (m) {
      tags.set(m[1].trim().toUpperCase(), m[2].trim().toUpperCase());
    }
  }
  return tags;
}

/**
 * Classify based on JCAMP-DX tags (instrument export format from
 * JASCO, Bruker, etc.). Returns null if not JCAMP-DX.
 */
function classifyJCAMP(text: string): ClassifyResult | null {
  const tags = parseJCAMPTags(text);
  if (tags.size < 3) return null;  // Not enough tags → not JCAMP-DX

  const dataType = tags.get('DATA TYPE') || '';
  const yUnits = tags.get('YUNITS') || '';
  const xUnits = tags.get('XUNITS') || '';
  const origin = tags.get('ORIGIN') || '';

  // Vibrational
  if (dataType.includes('INFRARED') || dataType.includes('IR ')) {
    return { type: 'ftir', confidence: 0.95, reason: `JCAMP-DX: ${dataType}` };
  }
  if (dataType.includes('RAMAN')) {
    return { type: 'raman', confidence: 0.95, reason: `JCAMP-DX: ${dataType}` };
  }

  // Optical
  if (dataType.includes('ULTRAVIOLET') || dataType.includes('UV') || dataType.includes('VISIBLE')) {
    if (yUnits.includes('REFLECT')) {
      return { type: 'uv-vis-drs', confidence: 0.95, reason: 'JCAMP-DX: UV + REFLECTANCE → DRS' };
    }
    return {
      type: 'uv-vis',
      confidence: 0.9,
      reason: `JCAMP-DX: ${dataType} / ${yUnits || 'unknown Y'}`,
    };
  }

  // Y units only (no DATA TYPE)
  if (yUnits.includes('REFLECT') && xUnits.includes('NANO')) {
    return { type: 'uv-vis-drs', confidence: 0.9, reason: 'YUNITS=REFLECTANCE + nm' };
  }
  if (yUnits.includes('ABSORB') && xUnits.includes('NANO')) {
    return { type: 'uv-vis', confidence: 0.9, reason: 'YUNITS=ABSORBANCE + nm' };
  }
  if (yUnits.includes('TRANSMIT') && xUnits.includes('NANO')) {
    return { type: 'uv-vis', confidence: 0.85, reason: 'YUNITS=TRANSMITTANCE + nm' };
  }
  if (yUnits.includes('ABSORB') && xUnits.includes('CM')) {
    return { type: 'ftir', confidence: 0.85, reason: 'YUNITS=ABSORBANCE + cm⁻¹' };
  }

  // Origin hints (when DATA TYPE missing)
  if (origin.includes('JASCO') && xUnits.includes('NANO')) {
    return { type: 'uv-vis', confidence: 0.7, reason: 'JASCO + nm' };
  }
  if (origin.includes('BRUKER') && xUnits.includes('CM')) {
    return { type: 'ftir', confidence: 0.7, reason: 'BRUKER + cm⁻¹' };
  }

  return null;  // Has tags but no clear match
}

function classifyTextContent(text: string, fileName: string): ClassifyResult {
  // R153d-fix1: try JCAMP-DX format first (instrument exports)
  const jcamp = classifyJCAMP(text);
  if (jcamp) return jcamp;

  const { header, rows, rawHeader } = parseCSVHead(text);
  const fnLower = fileName.toLowerCase();
  const headerJoined = header.join(' ').toLowerCase();
  const rawHeaderLower = rawHeader.toLowerCase();

  // Helper: keyword in filename OR header
  const has = (kw: string) => fnLower.includes(kw) || headerJoined.includes(kw) || rawHeaderLower.includes(kw);

  // R153d-fix1: filename pattern %R / %T / %A (Vietnamese lab convention)
  if (/%R\b|reflect/i.test(fileName)) {
    return { type: 'uv-vis-drs', confidence: 0.85, reason: 'Filename "%R" → reflectance/DRS' };
  }
  if (/%T\b|transmit/i.test(fileName)) {
    return { type: 'uv-vis', confidence: 0.8, reason: 'Filename "%T" → transmittance/UV-Vis' };
  }
  if (/%A\b/i.test(fileName)) {
    return { type: 'uv-vis', confidence: 0.8, reason: 'Filename "%A" → absorbance/UV-Vis' };
  }

  // Strong filename hints (boost confidence)
  if (has('xrd') && (rows.length > 0 || header.length > 0)) {
    const inRange = isColumnInRange(rows, 0, 5, 90);
    return {
      type: 'xrd',
      confidence: inRange ? 0.95 : 0.85,
      reason: inRange ? 'Filename + giá trị 2θ trong khoảng 5-90°' : 'Filename chứa "xrd"',
    };
  }
  if (has('raman') || has('shift')) {
    const inRange = isColumnInRange(rows, 0, 100, 4000);
    return {
      type: 'raman',
      confidence: inRange ? 0.9 : 0.75,
      reason: inRange ? 'Filename + wavenumber 100-4000 cm⁻¹' : 'Filename/header chứa "raman"',
    };
  }
  if (has('ftir') || has('infrared') || (has('absorbance') && !has('uv') && !has('vis'))) {
    const inRange = isColumnInRange(rows, 0, 400, 4000);
    return {
      type: 'ftir',
      confidence: inRange ? 0.9 : 0.75,
      reason: inRange ? 'Filename + wavenumber 400-4000 cm⁻¹' : 'Filename/header gợi ý FTIR',
    };
  }
  if (has('uv-vis-drs') || has('drs') || has('reflectance')) {
    return { type: 'uv-vis-drs', confidence: 0.85, reason: 'Filename/header chứa "DRS"' };
  }
  if (has('uv-vis') || has('uvvis') || (has('uv') && has('vis'))) {
    return { type: 'uv-vis', confidence: 0.9, reason: 'Filename/header chứa "UV-Vis"' };
  }
  if (has('photolumin') || has('emission') || (has('pl') && (has('intensity') || has('emission')))) {
    return { type: 'pl', confidence: 0.85, reason: 'Filename/header gợi ý PL' };
  }
  if (has('xps') || has('binding energy') || has('binding_energy')) {
    return { type: 'xps', confidence: 0.9, reason: 'Filename/header chứa "XPS" hoặc "binding energy"' };
  }
  if (has('eds') || (has('element') && (has('weight%') || has('atomic%') || has('atomic %')))) {
    return { type: 'eds', confidence: 0.85, reason: 'Filename/header gợi ý EDS' };
  }

  // Electrochem: header keywords for CV/LSV/EIS/Tafel/MS
  if (has('cv') || has('lsv') || has('eis') || has('tafel') || has('mott-schottky') ||
      has('potential') || has('voltage') || has('current') ||
      headerJoined.includes('e/v') || headerJoined.includes('i/a') ||
      headerJoined.includes('z\'') || headerJoined.includes('z\'\'')) {
    return {
      type: 'electrochem-csv',
      confidence: 0.85,
      reason: 'Header chứa potential/current/CV/LSV/EIS',
    };
  }

  // No filename hint: try value range matching only
  if (rows.length >= 5) {
    const inXRD = isColumnInRange(rows, 0, 5, 90);
    const inRaman = isColumnInRange(rows, 0, 100, 4000);
    const inUV = isColumnInRange(rows, 0, 200, 1100);
    if (inXRD) return { type: 'xrd', confidence: 0.6, reason: 'Cột 1 trong khoảng 5-90° (2θ?)' };
    if (inUV) return { type: 'uv-vis', confidence: 0.55, reason: 'Cột 1 trong khoảng 200-1100 nm' };
    if (inRaman) return { type: 'raman', confidence: 0.5, reason: 'Cột 1 trong khoảng 100-4000' };
  }

  // CSV default fallback
  return { type: 'electrochem-csv', confidence: 0.3, reason: 'CSV không xác định' };
}

/**
 * Main classifier entry point. Inspects file (filename + mime + content).
 * Returns best-guess type with confidence + reason.
 *
 * UX:
 *   - confidence >= 0.8: auto-select silently
 *   - 0.5 <= confidence < 0.8: pre-select + show hint
 *   - confidence < 0.5: keep user's default (R153b auto-detect)
 */
export async function classifyDataAssetFile(file: File): Promise<ClassifyResult> {
  const fileName = file.name || '';
  const mimeType = file.type || '';
  const fnLower = fileName.toLowerCase();

  // 1. Image: check SEM/TEM keyword
  if (/^image\//.test(mimeType) || /\.(png|jpg|jpeg|tif|tiff|bmp|webp)$/i.test(fileName)) {
    if (fnLower.includes('sem')) return { type: 'sem', confidence: 0.95, reason: 'Image + filename "SEM"' };
    if (fnLower.includes('tem')) return { type: 'tem', confidence: 0.95, reason: 'Image + filename "TEM"' };
    if (fnLower.includes('eds') || fnLower.includes('edx')) return { type: 'eds', confidence: 0.85, reason: 'Image + filename "EDS/EDX"' };
    return { type: 'image', confidence: 0.7, reason: 'Image file' };
  }

  // 2. PDF: document
  if (mimeType === 'application/pdf' || fnLower.endsWith('.pdf')) {
    return { type: 'document', confidence: 0.95, reason: 'PDF document' };
  }

  // 3. Excel/Word: document (no content sniff for binary)
  if (/^application\/.*(excel|spreadsheet|word|officedocument)/.test(mimeType) ||
      /\.(xlsx|xls|docx|doc)$/i.test(fileName)) {
    return { type: 'document', confidence: 0.85, reason: 'Office document' };
  }

  // 4. CSV/text: read content + sniff
  const isCSV = mimeType === 'text/csv' || mimeType === 'text/plain' ||
                /\.(csv|tsv|txt|xy|dat|emsa|spc|vms)$/i.test(fileName);
  if (isCSV) {
    const text = await readFileHead(file);
    if (!text) return { type: 'other', confidence: 0.3, reason: 'Không đọc được nội dung' };
    return classifyTextContent(text, fileName);
  }

  // 5. Unknown
  return { type: 'other', confidence: 0.3, reason: 'Loại file không xác định' };
}
