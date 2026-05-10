/**
 * pages/experiments-unified.ts — Unified Experiments page list view (R152c-1)
 *
 * Read from Firestore experiments collection (new schema). Legacy
 * RTDB collections (hydro/electrode/electrochem) NOT shown here —
 * those have their own legacy pages still active.
 *
 * Future R152c-2: CRUD form with type-specific conditions.
 * Future R152d/e: bulk migration UI to populate this page from legacy.
 */

// @ts-nocheck

import { listExperiments } from "../services/experiments.js";
import type { Experiment, ExperimentType, ExperimentStatus } from "../types/research.js";
import { escapeHtml } from "../utils/format.js";
import { openModal } from "../ui/modal.js";

const TYPE_LABELS: Record<ExperimentType, string> = {
  synthesis: "Synthesis",
  hydrothermal: "Hydrothermal",
  "sol-gel": "Sol-gel",
  cvd: "CVD",
  annealing: "Annealing",
  "electrode-prep": "Electrode prep",
  "ink-formulation": "Ink",
  measurement: "Measurement",
  electrochemistry: "Electrochemistry",
  characterization: "Characterization",
  compute: "Compute",
  other: "Other",
};

const STATUS_LABELS: Record<ExperimentStatus, string> = {
  planned: "Planned",
  "in-progress": "In progress",
  completed: "Completed",
  failed: "Failed",
  abandoned: "Abandoned",
};

const STATUS_COLORS: Record<ExperimentStatus, string> = {
  planned: "#6B7280",
  "in-progress": "#3B82F6",
  completed: "#10B981",
  failed: "#EF4444",
  abandoned: "#9CA3AF",
};

let _cache: Experiment[] | null = null;
let _filterType: ExperimentType | "" = "";

export async function renderExperimentsUnified(): Promise<void> {
  const root = document.getElementById("page-experiments-unified");
  if (!root) return;

  const contentEl = root.querySelector("[data-experiments-content]") as HTMLElement | null;
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="text-gray-500 py-8 text-center">Đang tải...</div>';

  let items: Experiment[];
  try {
    const opts: any = { limit: 500 };
    if (_filterType) opts.type = _filterType;
    items = await listExperiments(opts);
    _cache = items;
  } catch (err) {
    console.error("[experiments-unified] load failed:", err);
    contentEl.innerHTML =
      '<div class="text-red-600 py-8 text-center">Không tải được dữ liệu Experiments.</div>';
    return;
  }

  if (items.length === 0) {
    const msg = _filterType
      ? `Không có experiment nào loại "${escapeHtml(TYPE_LABELS[_filterType] || _filterType)}".`
      : 'Chưa có experiment nào trong schema mới.<br>' +
        '<span class="text-xs text-gray-400">Lab vẫn dùng trang Thủy nhiệt / Chuẩn bị điện cực / Đo điện hóa hiện tại — chưa migrate.<br>' +
        'CRUD form mới ở R152c-2. Bulk migration ở R152d.</span>';
    contentEl.innerHTML = `<div class="text-gray-500 py-8 text-center">${msg}</div>`;
    return;
  }

  // Group by type
  const byType = new Map<ExperimentType, Experiment[]>();
  for (const e of items) {
    const type = e.type || "other";
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(e);
  }

  // Type order: same as enum
  const typeOrder: ExperimentType[] = [
    "synthesis", "hydrothermal", "sol-gel", "cvd", "annealing",
    "electrode-prep", "ink-formulation", "measurement",
    "electrochemistry", "characterization", "compute", "other",
  ];

  const html = typeOrder
    .filter((t) => byType.has(t))
    .map((t) => {
      const list = byType.get(t)!;
      const cards = list.map(renderCard).join("");
      return `
        <section class="mb-6">
          <h2 class="text-lg font-semibold mb-3" style="color:#0F172A">
            ${escapeHtml(TYPE_LABELS[t] || t)}
            <span class="text-sm font-normal text-gray-500">(${list.length})</span>
          </h2>
          <div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
            ${cards}
          </div>
        </section>
      `;
    })
    .join("");

  contentEl.innerHTML = html;
}

function renderCard(e: Experiment): string {
  const code = escapeHtml(e.code || "");
  const status = e.status || "completed";
  const statusColor = STATUS_COLORS[status] || "#9CA3AF";
  const statusLabel = STATUS_LABELS[status] || status;
  const inCount = (e.inputSamples || []).length;
  const outCount = (e.outputSamples || []).length;
  const isLegacy = !!e.legacyRef;

  return `
    <div class="card p-3 cursor-pointer hover:shadow-md transition" style="background:white;border:1px solid #E2E8F0;border-radius:8px"
         data-action="open-experiment-detail" data-id="${escapeHtml(e.id)}">
      <div class="flex items-start justify-between gap-2 mb-1">
        <div class="font-mono text-sm font-semibold flex-1 min-w-0 truncate" style="color:#0F172A">${code}</div>
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${statusColor};white-space:nowrap">
          <span style="width:8px;height:8px;border-radius:50%;background:${statusColor}"></span>
          ${escapeHtml(statusLabel)}
        </span>
      </div>
      <div class="text-xs text-gray-500 mt-1 flex justify-between gap-2">
        <span>${inCount} in / ${outCount} out</span>
        ${isLegacy ? '<span class="font-mono text-amber-600" title="Adapted from legacy RTDB">legacy</span>' : ""}
      </div>
    </div>
  `;
}

export function openExperimentDetail(id: string): void {
  if (!_cache) return;
  const e = _cache.find((x) => x.id === id);
  if (!e) return;

  const props: Array<[string, string]> = [];
  props.push(["Type", TYPE_LABELS[e.type] || e.type]);
  props.push(["Status", STATUS_LABELS[e.status] || e.status]);
  props.push(["Operator", e.operatorId || "—"]);
  if (e.parentExperiment) props.push(["Parent experiment", e.parentExperiment]);
  if (e.duration != null) props.push(["Duration (ms)", String(e.duration)]);

  const propsHtml = props.map(([k, v]) => `
    <div class="flex justify-between py-1 border-b border-gray-100">
      <span class="text-sm text-gray-600">${escapeHtml(k)}</span>
      <span class="text-sm font-mono text-right">${escapeHtml(v)}</span>
    </div>
  `).join("");

  // Conditions block
  const conditions = e.conditions || {};
  const condEntries = Object.entries(conditions);
  const conditionsHtml = condEntries.length > 0
    ? `<div class="mt-4"><h3 class="font-semibold mb-2">Conditions</h3>` +
      condEntries.map(([k, v]) => {
        let valStr: string;
        if (v == null) {
          valStr = "—";
        } else if (typeof v === "object" && "value" in v && "unit" in v) {
          valStr = `${v.value} ${v.unit}`;
        } else if (typeof v === "object") {
          valStr = JSON.stringify(v);
        } else {
          valStr = String(v);
        }
        return `
          <div class="flex justify-between py-1 border-b border-gray-100">
            <span class="text-sm text-gray-600">${escapeHtml(k)}</span>
            <span class="text-sm font-mono text-right">${escapeHtml(valStr)}</span>
          </div>
        `;
      }).join("") +
      `</div>`
    : '<div class="mt-3 text-xs text-gray-500">No conditions recorded</div>';

  // Samples (clickable → navigate to that sample in samples page)
  const inputsHtml = (e.inputSamples || []).length > 0
    ? `<div class="mt-3"><span class="text-xs text-gray-500">Input samples (${e.inputSamples.length}):</span><br>` +
      e.inputSamples.map((s) =>
        `<span class="badge font-mono text-xs cursor-pointer hover:underline" data-action="open-sample-detail" data-id="${escapeHtml(s)}" title="${escapeHtml(s)}">${escapeHtml(s)}</span>`
      ).join(" ") +
      `</div>`
    : "";

  const outputsHtml = (e.outputSamples || []).length > 0
    ? `<div class="mt-2"><span class="text-xs text-gray-500">Output samples (${e.outputSamples.length}):</span><br>` +
      e.outputSamples.map((s) =>
        `<span class="badge font-mono text-xs cursor-pointer hover:underline" data-action="open-sample-detail" data-id="${escapeHtml(s)}" title="${escapeHtml(s)}">${escapeHtml(s)}</span>`
      ).join(" ") +
      `</div>`
    : "";

  // Derived metrics
  const metrics = e.derivedMetrics || {};
  const metricsEntries = Object.entries(metrics);
  const metricsHtml = metricsEntries.length > 0
    ? `<div class="mt-4"><h3 class="font-semibold mb-2">Derived metrics</h3>` +
      metricsEntries.map(([k, v]) => `
        <div class="flex justify-between py-1 border-b border-gray-100">
          <span class="text-sm text-gray-600">${escapeHtml(k)}</span>
          <span class="text-sm font-mono text-right">${escapeHtml(typeof v === "object" ? JSON.stringify(v) : String(v))}</span>
        </div>
      `).join("") +
      `</div>`
    : "";

  const conclusionHtml = e.conclusion
    ? `<div class="mt-3"><span class="text-xs text-gray-500">Conclusion:</span><br>` +
      `<div class="text-sm whitespace-pre-wrap">${escapeHtml(e.conclusion)}</div></div>`
    : "";

  const tagsHtml = (e.tags || []).length > 0
    ? `<div class="mt-3"><span class="text-xs text-gray-500">Tags:</span> ` +
      e.tags.map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join(" ") +
      `</div>`
    : "";

  const notesHtml = e.notes
    ? `<div class="mt-3"><span class="text-xs text-gray-500">Notes:</span><br>` +
      `<div class="text-sm whitespace-pre-wrap">${escapeHtml(e.notes)}</div></div>`
    : "";

  const legacyHtml = e.legacyRef
    ? `<div class="mt-3 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
         <span class="font-semibold">Legacy:</span> Adapted from RTDB
         <span class="font-mono">${escapeHtml(e.legacyRef.collection)}/${escapeHtml(e.legacyRef.id)}</span>
       </div>`
    : "";

  const bodyEl = document.getElementById("modal-experiment-detail-body");
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div data-experiment-id="${escapeHtml(e.id)}">
        <div class="font-mono text-xl font-bold" style="color:#0F172A">${escapeHtml(e.code)}</div>
      </div>
      <div class="mt-3">${propsHtml}</div>
      ${conditionsHtml}
      ${inputsHtml}
      ${outputsHtml}
      ${metricsHtml}
      ${conclusionHtml}
      ${tagsHtml}
      ${notesHtml}
      ${legacyHtml}
      <div class="text-xs text-gray-400 mt-4 pt-3 border-t">
        ID: <span class="font-mono">${escapeHtml(e.id)}</span><br>
        Tenant: <span class="font-mono">${escapeHtml(e.tenantId)}</span>
      </div>
    `;
  }
  openModal("modal-experiment-detail");
}

export async function filterExperimentsByType(type: ExperimentType | ""): Promise<void> {
  _filterType = type;
  await renderExperimentsUnified();
}

(window as any).renderExperimentsUnified = renderExperimentsUnified;
(window as any).openExperimentDetail = openExperimentDetail;
(window as any).filterExperimentsByType = filterExperimentsByType;
