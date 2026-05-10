/**
 * pages/samples.ts — Sample browser list view (R151c)
 *
 * Phase B.5 second user-visible page. Lists samples grouped by status,
 * click card → detail modal.
 *
 * Out of scope (R151d/e):
 *   - Create/edit form
 *   - Lineage tree visualization
 *   - Material link in detail
 */

// @ts-nocheck

import { listSamples } from "../services/samples.js";
import type { Sample, SampleStatus } from "../types/research.js";
import { escapeHtml } from "../utils/format.js";
import { openModal } from "../ui/modal.js";

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
  available: "#10B981",   // green
  "in-use": "#3B82F6",    // blue
  consumed: "#6B7280",    // gray
  archived: "#9CA3AF",    // light gray
  discarded: "#EF4444",   // red
};

let _cache: Sample[] | null = null;

export async function renderSamples(): Promise<void> {
  const root = document.getElementById("page-samples");
  if (!root) return;

  const contentEl = root.querySelector("[data-samples-content]") as HTMLElement | null;
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="text-gray-500 py-8 text-center">Đang tải...</div>';

  let items: Sample[];
  try {
    items = await listSamples({ limit: 500 });
    _cache = items;
  } catch (err) {
    console.error("[samples] load failed:", err);
    contentEl.innerHTML =
      '<div class="text-red-600 py-8 text-center">Không tải được dữ liệu Samples. ' +
      'Kiểm tra Firestore rules và tenantId claim.</div>';
    return;
  }

  if (items.length === 0) {
    contentEl.innerHTML =
      '<div class="text-gray-500 py-8 text-center">Chưa có sample nào. ' +
      'CRUD UI sẽ thêm ở R151d.</div>';
    return;
  }

  // Group by status
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
    })
    .join("");

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

  const propsHtml = props
    .map(([k, v]) => `
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

(window as any).renderSamples = renderSamples;
(window as any).openSampleDetail = openSampleDetail;
