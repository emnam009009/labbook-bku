// src/js/services/attachments.js
// Core service for experiment attachments (PR #1).
// Handles upload to Firebase Storage + metadata to RTDB.

import { storage, fbSet, fbGet, fbDel, fbPush, ref, push, db } from '../firebase.js';
import {
  ref as stRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { showToast } from '../ui/toast.js';
import { logHistory } from './history-log.js';

// Helper: tạo push key mà không ghi data
function fbPushKey(path) {
  return push(ref(db, path)).key;
}

// Alias cho rõ nghĩa
const fbRemove = fbDel;

// ---------- Constants ----------

export const ATTACHMENT_CATEGORIES = Object.freeze({
  xrd: { label: 'XRD', accept: 'image/*,.xy,.xrdml,.csv,.txt,.dat' },
  sem: { label: 'SEM', accept: 'image/*,.tif,.tiff' },
  tem: { label: 'TEM', accept: 'image/*,.tif,.tiff,.dm3,.dm4' },
  raman: { label: 'Raman', accept: 'image/*,.csv,.txt,.spc,.dat' },
  ftir: { label: 'FTIR', accept: 'image/*,.csv,.txt,.spa,.dpt,.dat' },
  uvvis: { label: 'UV-Vis', accept: 'image/*,.csv,.txt,.dat' },
  'uvvis-drs': { label: 'UV-Vis DRS', accept: 'image/*,.csv,.txt,.dat' },
  pl: { label: 'PL', accept: 'image/*,.csv,.txt,.dat' },
  other: { label: 'Khác', accept: '*' },
});

export const SUPPORTED_REF_TYPES = Object.freeze(['hydro', 'electrode']);

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_FILES_PER_EXPERIMENT = 20;

// ---------- Helpers ----------

const sanitizeFileName = (name) =>
  String(name || 'file')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);

const buildStoragePath = (refType, refId, fileName) => {
  const ts = Date.now();
  const safe = sanitizeFileName(fileName);
  return `attachments/${refType}/${refId}/${ts}_${safe}`;
};

const validateRef = (refType, refId) => {
  if (!SUPPORTED_REF_TYPES.includes(refType)) {
    throw new Error(`refType không hỗ trợ: ${refType}`);
  }
  if (!refId || typeof refId !== 'string') {
    throw new Error('refId không hợp lệ');
  }
};

const validateCategory = (cat) => {
  if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_CATEGORIES, cat)) {
    throw new Error(`category không hợp lệ: ${cat}`);
  }
};

const validateFile = (file) => {
  if (!file) throw new Error('Chưa chọn file');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB). Tối đa 25 MB.`,
    );
  }
};

// ---------- Public API ----------

/**
 * List attachments for an experiment from RTDB cache (no extra fetch).
 * Falls back to fbGet if cache empty.
 */
export async function listAttachments(refType, refId) {
  validateRef(refType, refId);
  const fromCache = window.cache?.attachments?.[refType]?.[refId];
  if (fromCache && typeof fromCache === 'object') {
    return Object.entries(fromCache).map(([id, v]) => ({ id, ...v }));
  }
  const snap = await fbGet(`attachments/${refType}/${refId}`);
  if (!snap) return [];
  return Object.entries(snap).map(([id, v]) => ({ id, ...v }));
}

/**
 * Count attachments per experiment (used to enforce limit & show badge).
 */
export async function countAttachments(refType, refId) {
  const list = await listAttachments(refType, refId);
  return list.length;
}

/**
 * Upload a single file. Returns the new attachment record.
 * onProgress: (percent: number) => void
 */
export async function uploadAttachment({
  refType,
  refId,
  category,
  file,
  note = '',
  onProgress = null,
}) {
  validateRef(refType, refId);
  validateCategory(category);
  validateFile(file);

  // Enforce per-experiment limit
  const existing = await listAttachments(refType, refId);
  if (existing.length >= MAX_FILES_PER_EXPERIMENT) {
    throw new Error(
      `Đã đạt giới hạn ${MAX_FILES_PER_EXPERIMENT} file cho thí nghiệm này.`,
    );
  }

  // Enforce unique fileName (case-sensitive)
  const dup = existing.find((it) => it.fileName === file.name);
  if (dup) {
    throw new Error(`Đã có file này: ${file.name}`);
  }

  const uid = window.currentAuth?.user?.uid;
  if (!uid) throw new Error('Chưa đăng nhập');

  const storagePath = buildStoragePath(refType, refId, file.name);
  const fileRef = stRef(storage, storagePath);

  // Upload with progress
  const task = uploadBytesResumable(fileRef, file, {
    contentType: file.type || 'application/octet-stream',
    customMetadata: { uid, refType, refId, category },
  });

  await new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (typeof onProgress === 'function') {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          onProgress(pct);
        }
      },
      reject,
      resolve,
    );
  });

  const downloadURL = await getDownloadURL(fileRef);

  // Write metadata to RTDB
  const attachmentId = fbPushKey(`attachments/${refType}/${refId}`);
  const record = {
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

  // Audit log
  try {
    await logHistory({
      action: 'attachment_upload',
      target: `${refType}/${refId}`,
      detail: `${category}: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
    });
  } catch (e) {
    // History is best-effort; don't fail upload because of it.
    console.warn('logHistory failed', e);
  }

  return { id: attachmentId, ...record };
}

/**
 * Delete an attachment (Storage object + RTDB metadata).
 * Caller must check permission before calling.
 */
export async function deleteAttachment({ refType, refId, attachmentId }) {
  validateRef(refType, refId);
  if (!attachmentId) throw new Error('Thiếu attachmentId');

  const meta = await fbGet(`attachments/${refType}/${refId}/${attachmentId}`);
  if (!meta) throw new Error('Attachment không tồn tại');

  // Delete Storage object first (if fails, metadata stays so user can retry).
  try {
    const fileRef = stRef(storage, meta.storagePath);
    await deleteObject(fileRef);
  } catch (e) {
    // If file already missing (404), continue to clean metadata.
    if (e?.code !== 'storage/object-not-found') {
      throw e;
    }
  }

  await fbRemove(`attachments/${refType}/${refId}/${attachmentId}`);

  try {
    await logHistory({
      action: 'attachment_delete',
      target: `${refType}/${refId}`,
      detail: `${meta.category}: ${meta.fileName}`,
    });
  } catch (e) {
    console.warn('logHistory failed', e);
  }
}

/**
 * Bulk upload (called by drag-drop multi-file).
 * Each file uploaded sequentially to keep progress UX simple and
 * to avoid hammering the limit check race condition.
 */
export async function uploadMany({ refType, refId, category, files, onItemProgress }) {
  const results = [];
  for (const file of files) {
    try {
      const rec = await uploadAttachment({
        refType,
        refId,
        category,
        file,
        onProgress: (pct) => onItemProgress?.(file.name, pct),
      });
      results.push({ ok: true, file: file.name, record: rec });
    } catch (e) {
      results.push({ ok: false, file: file.name, error: e.message || String(e) });
      showToast(e.message, 'danger');
    }
  }
  return results;
}
