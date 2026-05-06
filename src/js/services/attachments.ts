// src/js/services/attachments.ts
// Core service for experiment attachments (PR #1).
// Handles upload to Firebase Storage + metadata to RTDB.

import { storage, fbSet, fbGet, fbDel, ref, push, db } from '../firebase.js';
import {
  ref as stRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { showToast } from '../ui/toast.js';
import { logHistory } from './history-log.js';

// Helper: tao push key ma khong ghi data
function fbPushKey(path: string): string {
  return push(ref(db, path)).key!;
}

// Alias cho ro nghia
const fbRemove = fbDel;

// ---------- Constants ----------

interface AttachmentCategory {
  label: string;
  accept: string;
}

export const ATTACHMENT_CATEGORIES: Readonly<Record<string, AttachmentCategory>> = Object.freeze({
  xrd: { label: 'XRD', accept: 'image/*,.xy,.xrdml,.csv,.txt,.dat' },
  sem: { label: 'SEM', accept: 'image/*,.tif,.tiff' },
  tem: { label: 'TEM', accept: 'image/*,.tif,.tiff,.dm3,.dm4' },
  // Round 77a: composition + oxidation state group
  eds: { label: 'EDS', accept: 'image/*,.csv,.txt,.dat,.emsa' },
  xps: { label: 'XPS', accept: '.csv,.txt,.dat,.vms,image/*' },
  // Vibrational spectra group
  raman: { label: 'Raman', accept: 'image/*,.csv,.txt,.spc,.dat' },
  ftir: { label: 'FTIR', accept: 'image/*,.csv,.txt,.spa,.dpt,.dat' },
  // Optical properties group
  uvvis: { label: 'UV-Vis', accept: 'image/*,.csv,.txt,.dat' },
  'uvvis-drs': { label: 'UV-Vis DRS', accept: 'image/*,.csv,.txt,.dat' },
  pl: { label: 'PL', accept: 'image/*,.csv,.txt,.dat' },
  // Round 77a: electrochemistry group (CV/EIS/LSV pooled)
  electrochem: { label: 'Điện hóa', accept: 'image/*,.csv,.txt,.dat' },
  other: { label: 'Khác', accept: '*' },
});

export const SUPPORTED_REF_TYPES = Object.freeze(['hydro', 'electrode']) as readonly string[];

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_FILES_PER_EXPERIMENT = 20;

interface AttachmentRecord {
  category: string;
  fileName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  downloadURL: string;
  uploadedBy: string;
  uploadedAt: number;
  note: string;
  axisSettings?: AxisSettingsRecord;  // Round 75b: optional persistent axis customization
}

// Round 75b: Persistent axis customization for parsed-data plots.
interface AxisSettingsRecord {
  x?: { min?: number; max?: number; stepMajor?: number; minorPerMajor?: number };
  y?: { min?: number; max?: number; stepMajor?: number; minorPerMajor?: number };
}

interface AttachmentWithId extends AttachmentRecord {
  id: string;
}

// ---------- Helpers ----------

const sanitizeFileName = (name: string): string =>
  String(name || 'file')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);

const buildStoragePath = (refType: string, refId: string, fileName: string): string => {
  const ts = Date.now();
  const safe = sanitizeFileName(fileName);
  return `attachments/${refType}/${refId}/${ts}_${safe}`;
};

const validateRef = (refType: string, refId: string): void => {
  if (!SUPPORTED_REF_TYPES.includes(refType)) {
    throw new Error(`refType khong ho tro: ${refType}`);
  }
  if (!refId || typeof refId !== 'string') {
    throw new Error('refId khong hop le');
  }
};

const validateCategory = (cat: string): void => {
  if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_CATEGORIES, cat)) {
    throw new Error(`category khong hop le: ${cat}`);
  }
};

const validateFile = (file: File | null | undefined): void => {
  if (!file) throw new Error('Chua chon file');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File qua lon (${(file.size / 1024 / 1024).toFixed(1)} MB). Toi da 25 MB.`,
    );
  }
};

// ---------- Public API ----------

/**
 * List attachments for an experiment from RTDB cache (no extra fetch).
 * Falls back to fbGet if cache empty.
 */
export async function listAttachments(refType: string, refId: string): Promise<AttachmentWithId[]> {
  validateRef(refType, refId);
  const fromCache = (window.cache as any)?.attachments?.[refType]?.[refId];
  if (fromCache && typeof fromCache === 'object') {
    return Object.entries(fromCache).map(([id, v]) => ({ id, ...(v as AttachmentRecord) }));
  }
  const snap = await fbGet(`attachments/${refType}/${refId}`);
  if (!snap) return [];
  return Object.entries(snap).map(([id, v]) => ({ id, ...(v as AttachmentRecord) }));
}

/**
 * Count attachments per experiment (used to enforce limit & show badge).
 */
export async function countAttachments(refType: string, refId: string): Promise<number> {
  const list = await listAttachments(refType, refId);
  return list.length;
}

interface UploadParams {
  refType: string;
  refId: string;
  category: string;
  file: File;
  note?: string;
  onProgress?: ((pct: number) => void) | null;
  // Round 90: skip the per-call listAttachments() round-trip when caller
  // (uploadMany) has already pre-fetched the list. Saves N-1 round-trips.
  skipDupCheck?: boolean;
}

/**
 * Upload a single file. Returns the new attachment record.
 * onProgress: (percent: number) => void
 */
// Round 90: file size threshold for choosing single-PUT vs resumable
// Files <= 1MB use uploadBytes (single PUT, less overhead).
// Larger files use uploadBytesResumable (chunked, retry on failure).
const SMALL_FILE_THRESHOLD = 1024 * 1024;  // 1 MB

export async function uploadAttachment({
  refType,
  refId,
  category,
  file,
  note = '',
  onProgress = null,
  skipDupCheck = false,
}: UploadParams): Promise<AttachmentWithId> {
  validateRef(refType, refId);
  validateCategory(category);
  validateFile(file);

  // Round 90: skip listAttachments() roundtrip when caller pre-fetched
  if (!skipDupCheck) {
    const existing = await listAttachments(refType, refId);
    if (existing.length >= MAX_FILES_PER_EXPERIMENT) {
      throw new Error(
        `Da dat gioi han ${MAX_FILES_PER_EXPERIMENT} file cho thi nghiem nay.`,
      );
    }
    const dup = existing.find((it) => it.fileName === file.name);
    if (dup) {
      throw new Error(`Da co file nay: ${file.name}`);
    }
  }

  const uid = (window.currentAuth as any)?.user?.uid;
  if (!uid) throw new Error('Chua dang nhap');

  const storagePath = buildStoragePath(refType, refId, file.name);
  const fileRef = stRef(storage, storagePath);
  const metadata = {
    contentType: file.type || 'application/octet-stream',
    customMetadata: { uid, refType, refId, category },
  };

  // Round 90: choose strategy by file size
  if (file.size <= SMALL_FILE_THRESHOLD) {
    // Small file: single PUT — less overhead, faster for typical CSV/.cor files
    if (typeof onProgress === 'function') onProgress(10);  // approximate visual feedback
    await uploadBytes(fileRef, file, metadata);
    if (typeof onProgress === 'function') onProgress(100);
  } else {
    // Large file: resumable with progress callbacks
    const task = uploadBytesResumable(fileRef, file, metadata);
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap: any) => {
          if (typeof onProgress === 'function') {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            onProgress(pct);
          }
        },
        reject,
        () => resolve(),
      );
    });
  }

  const downloadURL = await getDownloadURL(fileRef);

  // Write metadata to RTDB
  const attachmentId = fbPushKey(`attachments/${refType}/${refId}`);
  const record: AttachmentRecord = {
    category,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    storagePath,
    downloadURL,
    uploadedBy: uid,
    uploadedAt: Date.now(),
    note: String(note || '').slice(0, 500),
  };
  await fbSet(`attachments/${refType}/${refId}/${attachmentId}`, record);

  // Round 90: fire-and-forget audit log (don't block return)
  // Saves ~150-300ms/file. Best-effort; failures logged but don't matter.
  (logHistory as any)({
    action: 'attachment_upload',
    target: `${refType}/${refId}`,
    detail: `${category}: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
  }).catch((e: any) => console.warn('logHistory failed', e));

  return { id: attachmentId, ...record };
}

interface DeleteParams {
  refType: string;
  refId: string;
  attachmentId: string;
}

/**
 * Delete an attachment (Storage object + RTDB metadata).
 * Caller must check permission before calling.
 */
export async function deleteAttachment({ refType, refId, attachmentId }: DeleteParams): Promise<void> {
  validateRef(refType, refId);
  if (!attachmentId) throw new Error('Thieu attachmentId');

  const meta = await fbGet(`attachments/${refType}/${refId}/${attachmentId}`) as AttachmentRecord | null;
  if (!meta) throw new Error('Attachment khong ton tai');

  // Delete Storage object first (if fails, metadata stays so user can retry).
  try {
    const fileRef = stRef(storage, meta.storagePath);
    await deleteObject(fileRef);
  } catch (e: any) {
    // If file already missing (404), continue to clean metadata.
    if (e?.code !== 'storage/object-not-found') {
      throw e;
    }
  }

  await fbRemove(`attachments/${refType}/${refId}/${attachmentId}`);

  try {
    await (logHistory as any)({
      action: 'attachment_delete',
      target: `${refType}/${refId}`,
      detail: `${meta.category}: ${meta.fileName}`,
    });
  } catch (e) {
    console.warn('logHistory failed', e);
  }
}

interface UpdateCategoryParams {
  refType: string;
  refId: string;
  attachmentId: string;
  newCategory: string;
}

/**
 * Update category cua mot attachment da upload.
 * Validate newCategory phai co trong ATTACHMENT_CATEGORIES.
 * Log history voi action 'attachment_category_change'.
 */
export async function updateAttachmentCategory({
  refType, refId, attachmentId, newCategory,
}: UpdateCategoryParams): Promise<void> {
  validateRef(refType, refId);
  if (!attachmentId) throw new Error('Thieu attachmentId');
  if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_CATEGORIES, newCategory)) {
    throw new Error(`Loai khong hop le: ${newCategory}`);
  }

  const path = `attachments/${refType}/${refId}/${attachmentId}`;
  const meta = await fbGet(path) as AttachmentRecord | null;
  if (!meta) throw new Error('Attachment khong ton tai');

  const oldCategory = meta.category;
  if (oldCategory === newCategory) return;  // No-op

  // Update only the category field via fbSet on sub-path.
  // (RTDB doesn't have UPDATE — set on full record then merge would
  // require atomic transaction. Setting just the field is fine for
  // a single-field change.)
  await fbSet(`${path}/category`, newCategory);

  try {
    await (logHistory as any)({
      action: 'attachment_category_change',
      target: `${refType}/${refId}`,
      detail: `${meta.fileName}: ${oldCategory} -> ${newCategory}`,
    });
  } catch (e) {
    console.warn('logHistory failed', e);
  }
}


interface UploadManyParams {
  refType: string;
  refId: string;
  category: string;
  files: File[];
  onItemProgress?: (fileName: string, pct: number) => void;
}

interface UploadManyResult {
  ok: boolean;
  file: string;
  record?: AttachmentWithId;
  error?: string;
}

/**
 * Bulk upload (called by drag-drop multi-file).
 * Each file uploaded sequentially to keep progress UX simple and
 * to avoid hammering the limit check race condition.
 */
export async function uploadMany({ refType, refId, category, files, onItemProgress }: UploadManyParams): Promise<UploadManyResult[]> {
  // Round 87: parallel upload with concurrency cap.
  // Pre-fetch existing list ONCE (truoc do moi file fetch lai = N round-trips).
  const existing = await listAttachments(refType, refId).catch(() => [] as any[]);

  // Round 90: 5 -> 8 concurrent (most networks can handle this fine)
  const CONCURRENT = 8;
  const queue = [...files];
  const results: UploadManyResult[] = [];

  // Track local 'reserved' filenames to detect dups within THIS batch
  // (same name in same upload: queue rejects 2nd one)
  const reserved = new Set(existing.map((it: any) => it.fileName));

  // Round 90: also enforce per-experiment limit using pre-fetched list
  const remainingSlots = MAX_FILES_PER_EXPERIMENT - existing.length;
  if (files.length > remainingSlots) {
    showToast(`Chỉ còn ${remainingSlots} slot — tải tối đa ${remainingSlots} file`, 'warning' as any);
  }

  const runOne = async (file: File): Promise<UploadManyResult> => {
    if (reserved.has(file.name)) {
      const err = `Da co file nay: ${file.name}`;
      showToast(err, 'danger' as any);
      return { ok: false, file: file.name, error: err };
    }
    reserved.add(file.name);  // prevent intra-batch duplicate

    try {
      const rec = await uploadAttachment({
        refType,
        refId,
        category,
        file,
        onProgress: (pct: number) => onItemProgress?.(file.name, pct),
        skipDupCheck: true,  // Round 90: dedup already done above
      } as any);
      return { ok: true, file: file.name, record: rec };
    } catch (e: any) {
      showToast(e.message, 'danger' as any);
      return { ok: false, file: file.name, error: e.message || String(e) };
    }
  };

  // Worker pool pattern: keep CONCURRENT workers running, each pulls next
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENT, queue.length); i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (!file) break;
        const r = await runOne(file);
        results.push(r);
      }
    })());
  }
  await Promise.all(workers);
  return results;
}

interface AxisSettings {
  x?: { min?: number | null; max?: number | null; stepMajor?: number | null; minorPerMajor?: number | null };
  y?: { min?: number | null; max?: number | null; stepMajor?: number | null; minorPerMajor?: number | null };
}

interface UpdateAxisSettingsParams {
  refType: string;
  refId: string;
  attachmentId: string;
  axisSettings: AxisSettings | null;  // null = clear/reset
}

/**
 * Update axisSettings cua mot attachment.
 * Pass axisSettings = null de xoa (reset ve auto-scale).
 * Log history voi action 'attachment_axis_change'.
 */
export async function updateAttachmentAxisSettings({
  refType, refId, attachmentId, axisSettings,
}: UpdateAxisSettingsParams): Promise<void> {
  validateRef(refType, refId);
  if (!attachmentId) throw new Error('Thieu attachmentId');

  const path = `attachments/${refType}/${refId}/${attachmentId}`;
  const meta = await fbGet(path) as AttachmentRecord | null;
  if (!meta) throw new Error('Attachment khong ton tai');

  // RTDB stores undefined as missing; normalize null -> undefined
  // Use fbSet on sub-path so we don't disturb other fields.
  if (axisSettings === null) {
    // Remove the field entirely
    await fbDel(`${path}/axisSettings`);
  } else {
    // Sanitize: ensure only number or null values
    const clean: AxisSettings = { x: {}, y: {} };
    for (const ax of ['x', 'y'] as const) {
      const src = axisSettings[ax] || {};
      const dst = clean[ax]!;
      if (typeof src.min === 'number' && isFinite(src.min)) dst.min = src.min;
      if (typeof src.max === 'number' && isFinite(src.max)) dst.max = src.max;
      if (typeof src.stepMajor === 'number' && isFinite(src.stepMajor) && src.stepMajor > 0)
        dst.stepMajor = src.stepMajor;
      if (typeof src.minorPerMajor === 'number' && isFinite(src.minorPerMajor) && src.minorPerMajor >= 1 && src.minorPerMajor <= 10)
        dst.minorPerMajor = Math.round(src.minorPerMajor);
    }
    await fbSet(`${path}/axisSettings`, clean);
  }

  try {
    await (logHistory as any)({
      action: 'attachment_axis_change',
      target: `${refType}/${refId}`,
      detail: `${meta.fileName}: ${axisSettings ? 'updated' : 'reset'}`,
    });
  } catch (e) {
    console.warn('logHistory failed', e);
  }
}

