/**
 * pages/samples.ts — Sample browser + CRUD (R151c + R151d-1)
 *
 * R151c: list grouped by status, detail modal
 * R151d-1: CRUD form (no lineage), search, edit
 *
 * Out of scope (R151d-2):
 *   - Lineage parents picker
 *   - Auto-compute rootMaterials + generation
 *   - MaterialRef dropdown picker (using text input for now)
 */

// @ts-nocheck

import {
  listSamples,
  searchSamples,
  createSample,
  updateSample,
} from "../services/samples.js";
import type { Sample, SampleStatus } from "../types/research.js";
import { escapeHtml } from "../utils/format.js";
import { openModal, closeModal } from "../ui/modal.js";
import { auth } from "../firebase.js";

const STATUS_LABELS: Record<SampleStatus, string> = {
  available: "Available (sẵn dùng)",
  "in-use": "In use (đang dùng)",
  consumed: "Consumed (đã hết)",
  archived: "Archived (lưu trữ)",
  discarded: "Discarded (đã hủy)",
};

const STATUS_ORDER: SampleStatus[] = [
  "available", "in-use", "consumed", "archived", "discarded",
];

const STATUS_COLORS: Record<SampleStatus, string> = {
  available: "#10B981",
  "in-use": "#3B82F6",
  consumed: "#6B7280",
  archived: "#9CA3AF",
  discarded: "#EF4444",
};

let _cache: Sample[] | null = null;
let _editingSample: Sample | null = null;
let _searchQuery = "";

export async function renderSamples(): Promise<void> {
  const root = document.getElementById("page-samples");
  if (!root) return;

  const contentEl = root.querySelector("[data-samples-content]") as HTMLElement | null;
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="text-gray-500 py-8 text-center">Đang tải...</div>';

  let items: Sample[];
  try {
    if (_searchQuery.trim()) {
      items = await searchSamples(_searchQuery, { limit: 500 });
    } else {
      items = await listSamples({ limit: 500 });
    }
    _cache = items;
  } catch (err) {
    console.error("[samples] load failed:", err);
    contentEl.innerHTML =
      '<div class="text-red-600 py-8 text-center">Không tải được dữ liệu Samples.</div>';
    return;
  }

  if (items.length === 0) {
    const msg = _searchQuery.trim()
      ? `Không tìm thấy mẫu khớp "${escapeHtml(_searchQuery)}".`
      : 'Chưa có mẫu nào. Bấm "Thêm mẫu" để bắt đầu.';
    contentEl.innerHTML = `<div class="text-gray-500 py-8 text-center">${msg}</div>`;
    return;
  }

  const byStatus = new Map<SampleStatus, Sample[]>();
  for (const s of items) {
    const status = s.status || "available";
    if (!byStatus.has(status)) byStatus.set(status, []);
    byStatus.get(status)!.push(s);
  }

  const html = STATUS_ORDER
    .filter((st) => byStatus.has(st))
    .map((st) => {
      const list = byStatus.get(st)!;
      const cards = list.map(renderCard).join("");
      const color = STATUS_COLORS[st];
      return `
        <section class="mb-6">
          <h2 class="text-lg font-semibold mb-3" style="color:#0F172A">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px"></span>
            ${escapeHtml(STATUS_LABELS[st] || st)}
            <span class="text-sm font-normal text-gray-500">(${list.length})</span>
          </h2>
          <div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
            ${cards}
          </div>
        </section>
      `;
    }).join("");

  contentEl.innerHTML = html;
}

function renderCard(s: Sample): string {
  const name = escapeHtml(s.name || "(no name)");
  const composition = escapeHtml(s.composition || "");
  const shortCode = s.shortCode ? escapeHtml(s.shortCode) : "";
  const amount = s.amount ? `${s.amount.value} ${escapeHtml(s.amount.unit)}` : "";
  const generation = s.generation ?? 0;
  const genBadge = generation > 0
    ? `<span class="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Gen ${generation}</span>`
    : `<span class="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Fresh</span>`;
  const tags = (s.tags || []).slice(0, 2).map((t) => escapeHtml(t)).join(", ");

  return `
    <div class="card p-3 cursor-pointer hover:shadow-md transition" style="background:white;border:1px solid #E2E8F0;border-radius:8px"
         data-action="open-sample-detail" data-id="${escapeHtml(s.id)}">
      <div class="flex items-start justify-between gap-2 mb-1">
        <div class="font-mono text-sm font-semibold flex-1 min-w-0 truncate" style="color:#0F172A" title="${name}">${name}</div>
        ${genBadge}
      </div>
      <div class="text-sm text-gray-700">${composition}${shortCode ? ` · ${shortCode}` : ""}</div>
      <div class="text-xs text-gray-500 mt-2 flex justify-between gap-2">
        <span class="truncate">${tags}</span>
        ${amount ? `<span class="font-mono whitespace-nowrap">${escapeHtml(amount)}</span>` : ""}
      </div>
    </div>
  `;
}

export function openSampleDetail(id: string): void {
  if (!_cache) return;
  const s = _cache.find((x) => x.id === id);
  if (!s) return;
  _editingSample = s;

  const props: Array<[string, string]> = [];
  props.push(["Composition", s.composition]);
  props.push(["Status", STATUS_LABELS[s.status] || s.status]);
  if (s.shortCode) props.push(["Short code", s.shortCode]);
  if (s.materialRef) props.push(["Material ref", s.materialRef]);
  props.push(["Generation", String(s.generation ?? 0)]);
  props.push(["Composite", s.isComposite ? "Yes" : "No"]);
  if (s.synthesisMethod) props.push(["Synthesis method", s.synthesisMethod]);
  if (s.amount) props.push(["Amount", `${s.amount.value} ${s.amount.unit}`]);
  if (s.initialAmount) props.push(["Initial amount", `${s.initialAmount.value} ${s.initialAmount.unit}`]);
  if (s.storageLocation) props.push(["Location", s.storageLocation]);

  const propsHtml = props.map(([k, v]) => `
    <div class="flex justify-between py-1 border-b border-gray-100">
      <span class="text-sm text-gray-600">${escapeHtml(k)}</span>
      <span class="text-sm font-mono text-right">${escapeHtml(v)}</span>
    </div>
  `).join("");

  const parentsHtml = (s.parents || []).length > 0
    ? `<div class="mt-3"><span class="text-xs text-gray-500">Derived from ${s.parents.length} parent(s):</span><br>` +
      s.parents.map((p) => `<span class="badge font-mono text-xs">${escapeHtml(p)}</span>`).join(" ") +
      `</div>`
    : `<div class="mt-3 text-xs text-gray-500">Fresh synthesis (no parents)</div>`;

  const rootMatHtml = (s.rootMaterials || []).length > 0
    ? `<div class="mt-2"><span class="text-xs text-gray-500">Root materials:</span> ` +
      s.rootMaterials.map((r) => `<span class="badge font-mono text-xs">${escapeHtml(r)}</span>`).join(" ") +
      `</div>`
    : "";

  const tagsHtml = (s.tags || []).length > 0
    ? `<div class="mt-3"><span class="text-xs text-gray-500">Tags:</span> ` +
      s.tags.map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join(" ") +
      `</div>`
    : "";

  const notesHtml = s.notes
    ? `<div class="mt-3"><span class="text-xs text-gray-500">Notes:</span><br>` +
      `<div class="text-sm whitespace-pre-wrap">${escapeHtml(s.notes)}</div></div>`
    : "";

  const bodyEl = document.getElementById("modal-sample-detail-body");
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div data-sample-id="${escapeHtml(s.id)}">
        <div class="font-mono text-xl font-bold" style="color:#0F172A">${escapeHtml(s.name)}</div>
      </div>
      <div class="mt-3">${propsHtml}</div>
      ${parentsHtml}
      ${rootMatHtml}
      ${tagsHtml}
      ${notesHtml}
      <div class="text-xs text-gray-400 mt-4 pt-3 border-t">
        ID: <span class="font-mono">${escapeHtml(s.id)}</span><br>
        Tenant: <span class="font-mono">${escapeHtml(s.tenantId)}</span>
      </div>
    `;
  }
  openModal("modal-sample-detail");
}

/**
 * Open create/edit form (R151d-1).
 * editing=null → create mode; else edit (name field readonly to keep audit trail).
 */
export function openSampleForm(editing: Sample | null = null): void {
  _editingSample = editing;

  const titleEl = document.getElementById("modal-sample-form-title");
  const nameEl = document.getElementById("smp-name") as HTMLInputElement | null;
  const shortCodeEl = document.getElementById("smp-shortcode") as HTMLInputElement | null;
  const compositionEl = document.getElementById("smp-composition") as HTMLInputElement | null;
  const materialRefEl = document.getElementById("smp-materialref") as HTMLInputElement | null;
  const statusEl = document.getElementById("smp-status") as HTMLSelectElement | null;
  const amountValueEl = document.getElementById("smp-amount-value") as HTMLInputElement | null;
  const amountUnitEl = document.getElementById("smp-amount-unit") as HTMLInputElement | null;
  const locationEl = document.getElementById("smp-location") as HTMLInputElement | null;
  const tagsEl = document.getElementById("smp-tags") as HTMLInputElement | null;
  const notesEl = document.getElementById("smp-notes") as HTMLTextAreaElement | null;

  if (titleEl) titleEl.textContent = editing ? "Sửa mẫu" : "Thêm mẫu";

  if (editing) {
    if (nameEl) { nameEl.value = editing.name || ""; nameEl.readOnly = true; }
    if (shortCodeEl) shortCodeEl.value = editing.shortCode || "";
    if (compositionEl) compositionEl.value = editing.composition || "";
    if (materialRefEl) materialRefEl.value = editing.materialRef || "";
    if (statusEl) statusEl.value = editing.status || "available";
    if (amountValueEl) amountValueEl.value = editing.amount ? String(editing.amount.value) : "";
    if (amountUnitEl) amountUnitEl.value = editing.amount?.unit || "";
    if (locationEl) locationEl.value = editing.storageLocation || "";
    if (tagsEl) tagsEl.value = (editing.tags || []).join(", ");
    if (notesEl) notesEl.value = editing.notes || "";
  } else {
    if (nameEl) { nameEl.value = ""; nameEl.readOnly = false; }
    if (shortCodeEl) shortCodeEl.value = "";
    if (compositionEl) compositionEl.value = "";
    if (materialRefEl) materialRefEl.value = "";
    if (statusEl) statusEl.value = "available";
    if (amountValueEl) amountValueEl.value = "";
    if (amountUnitEl) amountUnitEl.value = "";
    if (locationEl) locationEl.value = "";
    if (tagsEl) tagsEl.value = "";
    if (notesEl) notesEl.value = "";
  }

  openModal("modal-sample-form");
}

export async function submitSampleForm(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    (window as any).showToast?.("Bạn cần đăng nhập", "error");
    return;
  }

  const name = (document.getElementById("smp-name") as HTMLInputElement | null)?.value.trim() || "";
  const shortCode = (document.getElementById("smp-shortcode") as HTMLInputElement | null)?.value.trim();
  const composition = (document.getElementById("smp-composition") as HTMLInputElement | null)?.value.trim() || "";
  const materialRef = (document.getElementById("smp-materialref") as HTMLInputElement | null)?.value.trim();
  const status = ((document.getElementById("smp-status") as HTMLSelectElement | null)?.value || "available") as SampleStatus;
  const amountValueStr = (document.getElementById("smp-amount-value") as HTMLInputElement | null)?.value.trim();
  const amountUnit = (document.getElementById("smp-amount-unit") as HTMLInputElement | null)?.value.trim();
  const storageLocation = (document.getElementById("smp-location") as HTMLInputElement | null)?.value.trim();
  const tagsRaw = (document.getElementById("smp-tags") as HTMLInputElement | null)?.value || "";
  const notes = (document.getElementById("smp-notes") as HTMLTextAreaElement | null)?.value.trim();

  if (!composition) {
    (window as any).showToast?.("Cần nhập composition", "error");
    return;
  }

  const tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  let amount: { value: number; unit: string } | undefined;
  if (amountValueStr && amountUnit) {
    const v = parseFloat(amountValueStr);
    if (isNaN(v)) {
      (window as any).showToast?.("Amount phải là số", "error");
      return;
    }
    amount = { value: v, unit: amountUnit };
  } else if (amountValueStr || amountUnit) {
    (window as any).showToast?.("Amount cần cả value và unit", "error");
    return;
  }

  try {
    if (_editingSample) {
      const patch: any = {
        composition,
        status,
        tags,
      };
      if (shortCode !== undefined) patch.shortCode = shortCode || undefined;
      if (materialRef !== undefined) patch.materialRef = materialRef || undefined;
      if (amount !== undefined) patch.amount = amount;
      if (storageLocation !== undefined) patch.storageLocation = storageLocation || undefined;
      if (notes !== undefined) patch.notes = notes || undefined;
      // Strip undefined values (avoid Firestore reject)
      const cleanPatch: any = {};
      for (const k of Object.keys(patch)) {
        if (patch[k] !== undefined) cleanPatch[k] = patch[k];
      }
      await updateSample(_editingSample.id, cleanPatch, uid);
      (window as any).showToast?.("Đã cập nhật mẫu", "success");
    } else {
      const input: any = {
        composition,
        status,
        tags,
      };
      if (name) input.name = name;
      if (shortCode) input.shortCode = shortCode;
      if (materialRef) {
        input.materialRef = materialRef;
        input.rootMaterials = [materialRef];
      }
      if (amount) {
        input.amount = amount;
        input.initialAmount = amount;
      }
      if (storageLocation) input.storageLocation = storageLocation;
      if (notes) input.notes = notes;
      await createSample(input, uid);
      (window as any).showToast?.("Đã thêm mẫu", "success");
    }
    closeModal("modal-sample-form");
    _editingSample = null;
    await renderSamples();
  } catch (err: any) {
    console.error("[submitSampleForm]", err);
    const msg = err?.message?.includes("PERMISSION_DENIED") || err?.code === "permission-denied"
      ? "Không có quyền (rules check role member/admin/superadmin)."
      : `Lỗi: ${err?.message || err}`;
    (window as any).showToast?.(msg, "error");
  }
}

export async function searchSamplesHandler(query: string): Promise<void> {
  _searchQuery = query || "";
  await renderSamples();
}

(window as any).renderSamples = renderSamples;
(window as any).openSampleDetail = openSampleDetail;
(window as any).openSampleForm = openSampleForm;
(window as any).submitSampleForm = submitSampleForm;
(window as any).searchSamplesHandler = searchSamplesHandler;

(window as any).openSampleFormFromDetail = function() {
  if (_editingSample) {
    openSampleForm(_editingSample);
  }
};
