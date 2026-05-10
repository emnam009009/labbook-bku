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
