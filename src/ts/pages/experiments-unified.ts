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

// @ts-nocheck — Legacy DOM page — will be replaced in Next.js + Carbon port (Phase E). Don't fix here.

import { listExperiments } from "../services/experiments.js";
import type { Experiment, ExperimentType, ExperimentStatus } from "../types/research.js";
import { escapeHtml } from "../utils/format.js";
import { openModal, closeModal } from "../ui/modal.js";

// R153b: DataAsset integration
import {
  uploadDataAsset, listByExperiment, getDataAssetURL,
  deleteDataAsset, formatFileSize, tsToDate,
  classifyDataAssetFile,
} from "../services/data-assets.js";
// R154-1: Lineage graph
import { buildLineageGraph } from "../services/lineage-service.js";
import { renderLineageGraph } from "../ui/lineage-graph.js";
import type { DataAsset, DataAssetType } from "../types/research.js";

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
  photocatalysis: "Photocatalysis",
  photoelectrochemistry: "PEC (Photoelectrochemistry)",
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
    "electrochemistry", "characterization",
    "photocatalysis", "photoelectrochemistry",
    "compute", "other",
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
    <div class="lb-card" data-action="open-experiment-detail" data-id="${escapeHtml(e.id)}">
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
      <div class="mt-4 pt-3 border-t">
        <h3 class="font-semibold mb-2">Tệp đính kèm</h3>
        <div id="exp-detail-dataassets" class="lb-da-section">
          <div class="lb-hint">Đang tải...</div>
        </div>
      </div>
      <div class="mt-4 pt-3 border-t flex justify-end">
        <button type="button" class="btn" data-action="open-lineage-graph" data-experiment-id="${escapeHtml(e.id)}">
          🔗 Xem lineage
        </button>
      </div>
      ${legacyHtml}
      <div class="text-xs text-gray-400 mt-4 pt-3 border-t">
        ID: <span class="font-mono">${escapeHtml(e.id)}</span><br>
        Tenant: <span class="font-mono">${escapeHtml(e.tenantId)}</span>
      </div>
    `;
  }
  openModal("modal-experiment-detail");
  // R153b: Async load DataAssets for this experiment
  void renderDataAssetsSection(e.id);
}

export async function filterExperimentsByType(type: ExperimentType | ""): Promise<void> {
  _filterType = type;
  await renderExperimentsUnified();
}

// ════════════════════════════════════════════════════════════
// R152c-2: Type-specific conditions schema (Approach C)
// ════════════════════════════════════════════════════════════

export type ConditionFieldType = "number" | "text" | "select" | "number-with-unit";

export interface ConditionField {
  key: string;
  label: string;
  type: ConditionFieldType;
  units?: string[];           // for number-with-unit
  options?: string[];         // for select
  required?: boolean;
  hint?: string;              // small helper text
  placeholder?: string;
}

const TYPE_CONDITIONS_SCHEMA: Partial<Record<ExperimentType, ConditionField[]>> = {
  hydrothermal: [
    { key: "temperature", label: "Temperature", type: "number-with-unit", units: ["°C", "K"], required: true },
    { key: "duration", label: "Duration", type: "number-with-unit", units: ["h", "min"], required: true },
    { key: "vesselType", label: "Vessel", type: "select", options: ["Teflon-lined autoclave", "stainless steel autoclave", "glass", "other"] },
    { key: "vesselVolumeML", label: "Vessel volume (mL)", type: "number" },
    { key: "fillRatioPercent", label: "Fill ratio (%)", type: "number" },
    { key: "pH", label: "pH", type: "number" },
    { key: "atmosphere", label: "Atmosphere", type: "select", options: ["air", "Ar", "N2", "vacuum"] },
    { key: "precursorMolarRatio", label: "Precursor molar ratio", type: "text", placeholder: "S/Mo = 4:1" },
    { key: "additives", label: "Additives", type: "text", placeholder: "l-cysteine, urea, F-127" },
  ],
  "electrode-prep": [
    { key: "substrate", label: "Substrate", type: "select", required: true,
      options: ["glassy carbon", "FTO", "ITO", "Ni foam", "carbon paper", "Cu foil", "other"] },
    { key: "substrateAreaCm2", label: "Substrate area (cm²)", type: "number", required: true },
    { key: "coatingMethod", label: "Coating method", type: "select", required: true,
      options: ["drop-casting", "spin-coating", "spray", "electrodeposition", "doctor-blade", "other"] },
    { key: "catalystLoadingMg", label: "Catalyst loading (mg)", type: "number" },
    { key: "loadingMgPerCm2", label: "Loading density (mg/cm²)", type: "number" },
    { key: "inkRefId", label: "Ink reference (ID/notes)", type: "text" },
    { key: "bindingAgent", label: "Binder", type: "select", options: ["Nafion", "PVDF", "PTFE", "none", "other"] },
    { key: "dryingTemp", label: "Drying temp", type: "number-with-unit", units: ["°C", "K"] },
    { key: "dryingDuration", label: "Drying time", type: "number-with-unit", units: ["min", "h"] },
  ],
  electrochemistry: [
    { key: "technique", label: "Technique", type: "select", required: true,
      options: ["CV", "LSV", "EIS", "Tafel", "Chronoamperometry", "GCD", "OCP", "other"] },
    { key: "electrolyteName", label: "Electrolyte", type: "text", required: true, placeholder: "0.5 M H2SO4" },
    { key: "electrolytePH", label: "Electrolyte pH", type: "number" },
    { key: "referenceElectrode", label: "Reference electrode", type: "select", required: true,
      options: ["Ag/AgCl", "SCE", "RHE", "Hg/HgO", "other"] },
    { key: "counterElectrode", label: "Counter electrode", type: "select", required: true,
      options: ["Pt wire", "Pt foil", "graphite rod", "other"] },
    { key: "workingArea", label: "Working area (cm²)", type: "number" },
    { key: "vStart", label: "V start (V vs ref)", type: "number" },
    { key: "vEnd", label: "V end (V vs ref)", type: "number" },
    { key: "scanRate", label: "Scan rate", type: "number-with-unit", units: ["mV/s", "V/s"], hint: "for CV/LSV" },
    { key: "cycles", label: "Cycles", type: "number", hint: "for CV" },
    { key: "frequency", label: "Frequency range", type: "text", placeholder: "100 kHz - 0.1 Hz", hint: "for EIS" },
    { key: "amplitude", label: "AC amplitude (mV)", type: "number", hint: "for EIS" },
    { key: "iRCompensation", label: "iR compensation (%)", type: "number" },
    { key: "atmosphere", label: "Atmosphere/Purge", type: "select", options: ["N2", "Ar", "O2", "air"] },
  ],
  "ink-formulation": [
    { key: "catalystMassMg", label: "Catalyst mass (mg)", type: "number", required: true },
    { key: "solventComposition", label: "Solvent", type: "text", required: true, placeholder: "water/IPA 4:1" },
    { key: "solventVolumeML", label: "Total solvent volume (mL)", type: "number", required: true },
    { key: "bindingAgent", label: "Binder", type: "select", options: ["Nafion 5%", "PVDF", "PTFE", "none", "other"] },
    { key: "binderVolumeUL", label: "Binder volume (μL)", type: "number" },
    { key: "sonicationDurationMin", label: "Sonication duration (min)", type: "number" },
    { key: "sonicationType", label: "Sonication type", type: "select", options: ["bath", "probe", "none"] },
  ],
  photocatalysis: [
    { key: "pollutantName", label: "Pollutant/dye", type: "select", required: true,
      options: ["MB (methylene blue)", "MO (methyl orange)", "RhB", "BG", "BPB", "phenol", "other"] },
    { key: "pollutantConcentrationMgL", label: "Initial concentration (mg/L)", type: "number", required: true },
    { key: "catalystMassMg", label: "Catalyst mass (mg)", type: "number", required: true },
    { key: "solutionVolumeML", label: "Solution volume (mL)", type: "number", required: true },
    { key: "lightSource", label: "Light source", type: "select", required: true,
      options: ["Xe lamp", "Hg lamp", "simulated sunlight AM1.5G", "visible LED", "UV LED", "sunlight", "other"] },
    { key: "lightPowerW", label: "Light power (W)", type: "number" },
    { key: "lightIntensity", label: "Light intensity", type: "text", placeholder: "100 mW/cm² (1 sun)" },
    { key: "distanceCm", label: "Distance light-sample (cm)", type: "number" },
    { key: "darkAdsorptionMin", label: "Dark adsorption (min)", type: "number", hint: "thường 30-60 min" },
    { key: "irradiationDurationMin", label: "Irradiation duration (min)", type: "number", required: true },
    { key: "samplingIntervalMin", label: "Sampling interval (min)", type: "number" },
    { key: "pH", label: "Initial pH", type: "number" },
    { key: "atmosphere", label: "Atmosphere", type: "select", options: ["air", "N2 (anaerobic)", "O2 (saturated)"] },
    { key: "scavenger", label: "Scavenger", type: "text", placeholder: "t-BuOH for OH" },
    { key: "analysisMethod", label: "Analysis method", type: "select", required: true,
      options: ["UV-Vis", "HPLC", "COD", "TOC", "other"] },
  ],
  photoelectrochemistry: [
    { key: "technique", label: "Technique", type: "select", required: true,
      options: ["LSV", "chronoamperometry (light on/off)", "EIS (PEIS)", "IPCE", "Mott-Schottky", "OCP", "other"] },
    { key: "electrolyteName", label: "Electrolyte", type: "text", required: true },
    { key: "electrolytePH", label: "Electrolyte pH", type: "number" },
    { key: "referenceElectrode", label: "Reference electrode", type: "select", required: true,
      options: ["Ag/AgCl", "SCE", "RHE", "Hg/HgO", "other"] },
    { key: "counterElectrode", label: "Counter electrode", type: "select", required: true,
      options: ["Pt wire", "Pt foil", "graphite", "other"] },
    { key: "lightSource", label: "Light source", type: "select", required: true,
      options: ["Xe lamp 300W", "Xe lamp 500W", "simulated sunlight AM1.5G", "visible LED", "UV LED", "monochromator", "other"] },
    { key: "lightIntensityMWcm2", label: "Light intensity (mW/cm²)", type: "number" },
    { key: "spectralFilter", label: "Filter", type: "text", placeholder: "AM1.5G, λ>420 nm" },
    { key: "illuminationMode", label: "Illumination mode", type: "select", options: ["front-side", "back-side", "both"] },
    { key: "biasV", label: "Bias (V vs ref)", type: "number", hint: "for chronoamp" },
    { key: "vStart", label: "V start (V vs ref)", type: "number", hint: "for LSV" },
    { key: "vEnd", label: "V end (V vs ref)", type: "number", hint: "for LSV" },
    { key: "scanRate", label: "Scan rate (mV/s)", type: "number" },
    { key: "frequency", label: "Frequency range", type: "text", hint: "for PEIS", placeholder: "10 kHz - 0.01 Hz" },
    { key: "amplitude", label: "AC amplitude (mV)", type: "number" },
    { key: "chopperFrequency", label: "Light chopper (Hz)", type: "number", hint: "for transient" },
    { key: "workingArea", label: "Working/Illuminated area (cm²)", type: "number" },
    { key: "atmosphere", label: "Atmosphere/Purge", type: "select", options: ["N2", "Ar", "O2", "air"] },
  ],
};


// ════════════════════════════════════════════════════════════
// R152c-2: Form state + helpers
// ════════════════════════════════════════════════════════════

let _formType: ExperimentType = "hydrothermal";
let _formInputSamples: string[] = [];
let _formOutputSamples: string[] = [];
let _samplePickerCache: any[] | null = null;

/**
 * Render conditions section based on selected type.
 * Common values (matching keys) preserved when type changes.
 */
function renderConditionsSection(type: ExperimentType): string {
  const schema = TYPE_CONDITIONS_SCHEMA[type] || [];
  if (schema.length === 0) {
    return `<div class="text-sm text-gray-500 py-3">
      Type "${escapeHtml(TYPE_LABELS[type] || type)}" chưa có schema chi tiết.
      Conditions để trống hoặc dùng "Notes" bên dưới.
    </div>`;
  }
  return schema.map(renderConditionField).join("");
}

function renderConditionField(f: ConditionField): string {
  const id = `exp-cond-${f.key}`;
  const required = f.required ? '<span class="lb-req">*</span>' : "";
  const hint = f.hint ? `<div class="lb-hint">${escapeHtml(f.hint)}</div>` : "";

  if (f.type === "number") {
    return `
      <div class="form-group">
        <label>${escapeHtml(f.label)} ${required}</label>
        <input type="number" step="any" id="${id}" data-cond-key="${escapeHtml(f.key)}"
               placeholder="${escapeHtml(f.placeholder || "")}">
        ${hint}
      </div>
    `;
  }
  if (f.type === "text") {
    return `
      <div class="form-group">
        <label>${escapeHtml(f.label)} ${required}</label>
        <input type="text" id="${id}" data-cond-key="${escapeHtml(f.key)}"
               placeholder="${escapeHtml(f.placeholder || "")}">
        ${hint}
      </div>
    `;
  }
  if (f.type === "select") {
    const options = (f.options || []).map((o) =>
      `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`
    ).join("");
    return `
      <div class="form-group">
        <label>${escapeHtml(f.label)} ${required}</label>
        <select class="cs-select" id="${id}" data-cond-key="${escapeHtml(f.key)}" data-cond-kind="select">
          <option value="">— chọn —</option>
          ${options}
        </select>
        ${hint}
      </div>
    `;
  }
  if (f.type === "number-with-unit") {
    const units = (f.units || []).map((u) =>
      `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`
    ).join("");
    return `
      <div class="form-group">
        <label>${escapeHtml(f.label)} ${required}</label>
        <div class="lb-num-unit">
          <input type="number" step="any" id="${id}-value" data-cond-key="${escapeHtml(f.key)}" data-cond-kind="value-unit-value"
                 placeholder="${escapeHtml(f.placeholder || "")}">
          <select class="cs-select" id="${id}-unit" data-cond-key="${escapeHtml(f.key)}" data-cond-kind="value-unit-unit">
            ${units}
          </select>
        </div>
        ${hint}
      </div>
    `;
  }
  return "";
}

/**
 * Collect form values into ExperimentConditions object.
 * Skip empty fields; for number-with-unit, only emit if both value+unit set.
 */
function collectConditions(): any {
  const result: any = {};
  const schema = TYPE_CONDITIONS_SCHEMA[_formType] || [];
  for (const f of schema) {
    const id = `exp-cond-${f.key}`;
    if (f.type === "number") {
      const el = document.getElementById(id) as HTMLInputElement | null;
      const v = el?.value.trim();
      if (v !== undefined && v !== "") {
        const num = parseFloat(v);
        if (!isNaN(num)) result[f.key] = num;
      }
    } else if (f.type === "text" || f.type === "select") {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      const v = (el?.value ?? "").trim();
      if (v) result[f.key] = v;
    } else if (f.type === "number-with-unit") {
      const valueEl = document.getElementById(`${id}-value`) as HTMLInputElement | null;
      const unitEl = document.getElementById(`${id}-unit`) as HTMLSelectElement | null;
      const vStr = valueEl?.value.trim();
      const u = unitEl?.value.trim();
      if (vStr && u) {
        const num = parseFloat(vStr);
        if (!isNaN(num)) result[f.key] = { value: num, unit: u };
      }
    }
  }
  return result;
}

/**
 * Validate required fields filled. Returns array of missing labels.
 */
function validateRequiredConditions(): string[] {
  const missing: string[] = [];
  const schema = TYPE_CONDITIONS_SCHEMA[_formType] || [];
  for (const f of schema) {
    if (!f.required) continue;
    const id = `exp-cond-${f.key}`;
    if (f.type === "number-with-unit") {
      const valueEl = document.getElementById(`${id}-value`) as HTMLInputElement | null;
      const unitEl = document.getElementById(`${id}-unit`) as HTMLSelectElement | null;
      if (!valueEl?.value.trim() || !unitEl?.value.trim()) missing.push(f.label);
    } else {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (!el?.value.trim()) missing.push(f.label);
    }
  }
  return missing;
}

/**
 * Open create form. Resets all state.
 */
export function openExperimentForm(): void {
  _formType = "hydrothermal";
  _formInputSamples = [];
  _formOutputSamples = [];

  const codeEl = document.getElementById("exp-form-code") as HTMLInputElement | null;
  const typeEl = document.getElementById("exp-form-type") as HTMLSelectElement | null;
  const statusEl = document.getElementById("exp-form-status") as HTMLSelectElement | null;
  const performedAtEl = document.getElementById("exp-form-performed-at") as HTMLInputElement | null;
  const conclusionEl = document.getElementById("exp-form-conclusion") as HTMLTextAreaElement | null;
  const tagsEl = document.getElementById("exp-form-tags") as HTMLInputElement | null;
  const notesEl = document.getElementById("exp-form-notes") as HTMLTextAreaElement | null;

  if (codeEl) codeEl.value = "";
  if (typeEl) typeEl.value = "hydrothermal";
  if (statusEl) statusEl.value = "completed";
  if (performedAtEl) {
    const now = new Date();
    performedAtEl.value = now.toISOString().slice(0, 16); // datetime-local
  }
  if (conclusionEl) conclusionEl.value = "";
  if (tagsEl) tagsEl.value = "";
  if (notesEl) notesEl.value = "";

  renderConditionsForCurrentType();
  renderInputSamplesBadges();
  renderOutputSamplesBadges();

  // Clear sample pickers
  const inSearchEl = document.getElementById("exp-input-sample-search") as HTMLInputElement | null;
  const outSearchEl = document.getElementById("exp-output-sample-search") as HTMLInputElement | null;
  if (inSearchEl) inSearchEl.value = "";
  if (outSearchEl) outSearchEl.value = "";
  hideSampleSuggestions("input");
  hideSampleSuggestions("output");

  openModal("modal-experiment-form");
}

function renderConditionsForCurrentType(): void {
  const sectionEl = document.getElementById("exp-conditions-section");
  if (!sectionEl) return;
  // Snapshot current values to restore matching keys
  const currentValues = collectConditions();
  sectionEl.innerHTML = renderConditionsSection(_formType);
  // Restore matching keys
  const newSchema = TYPE_CONDITIONS_SCHEMA[_formType] || [];
  for (const f of newSchema) {
    if (!(f.key in currentValues)) continue;
    const v = currentValues[f.key];
    const id = `exp-cond-${f.key}`;
    if (f.type === "number-with-unit" && v && typeof v === "object") {
      const valueEl = document.getElementById(`${id}-value`) as HTMLInputElement | null;
      const unitEl = document.getElementById(`${id}-unit`) as HTMLSelectElement | null;
      if (valueEl) valueEl.value = String(v.value);
      if (unitEl) unitEl.value = String(v.unit);
    } else {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (el) el.value = typeof v === "object" ? JSON.stringify(v) : String(v);
    }
  }
}

export function changeExperimentFormType(newType: ExperimentType): void {
  _formType = newType;
  renderConditionsForCurrentType();
}

// ─── Sample picker (input + output) ───

async function ensureSamplePickerCache(): Promise<any[]> {
  if (_samplePickerCache) return _samplePickerCache;
  try {
    const { listSamples } = await import("../services/samples.js");
    _samplePickerCache = await listSamples({ limit: 500 });
  } catch (err) {
    console.error("[exp form] sample picker cache load failed:", err);
    _samplePickerCache = [];
  }
  return _samplePickerCache;
}

function renderInputSamplesBadges(): void {
  const el = document.getElementById("exp-input-samples-badges");
  if (!el) return;
  if (_formInputSamples.length === 0) {
    el.innerHTML = '<span class="text-xs text-gray-400">Chưa chọn input sample</span>';
    return;
  }
  el.innerHTML = _formInputSamples.map((sid) => {
    const s = _samplePickerCache?.find((x) => x.id === sid);
    const label = s ? `${s.name}` : sid;
    return `
      <span class="lb-rmbadge lb-rmbadge--input">
        <span class="font-mono" title="${escapeHtml(sid)}">${escapeHtml(label)}</span>
        <button type="button" data-action="exp-remove-input-sample" data-id="${escapeHtml(sid)}" aria-label="Xóa">×</button>
      </span>
    `;
  }).join("");
}

function renderOutputSamplesBadges(): void {
  const el = document.getElementById("exp-output-samples-badges");
  if (!el) return;
  if (_formOutputSamples.length === 0) {
    el.innerHTML = '<span class="text-xs text-gray-400">Chưa chọn output sample</span>';
    return;
  }
  el.innerHTML = _formOutputSamples.map((sid) => {
    const s = _samplePickerCache?.find((x) => x.id === sid);
    const label = s ? `${s.name}` : sid;
    return `
      <span class="lb-rmbadge lb-rmbadge--output">
        <span class="font-mono" title="${escapeHtml(sid)}">${escapeHtml(label)}</span>
        <button type="button" data-action="exp-remove-output-sample" data-id="${escapeHtml(sid)}" aria-label="Xóa">×</button>
      </span>
    `;
  }).join("");
}

async function showSampleSuggestions(query: string, kind: "input" | "output"): Promise<void> {
  const suggestionsEl = document.getElementById(`exp-${kind}-sample-suggestions`);
  if (!suggestionsEl) return;

  const q = query.trim().toLowerCase();
  if (!q) {
    hideSampleSuggestions(kind);
    return;
  }

  const cache = await ensureSamplePickerCache();
  const selected = kind === "input" ? _formInputSamples : _formOutputSamples;
  const candidates = cache.filter((s) => {
    if (selected.includes(s.id)) return false;
    return s.name.toLowerCase().includes(q)
      || (s.composition || "").toLowerCase().includes(q)
      || (s.shortCode || "").toLowerCase().includes(q);
  }).slice(0, 8);

  if (candidates.length === 0) {
    suggestionsEl.innerHTML = '<div class="lb-suggestions-empty">Không tìm thấy mẫu khớp</div>';
    suggestionsEl.classList.add("lb-show");
    return;
  }

  suggestionsEl.innerHTML = candidates.map((s) => `
    <div class="lb-suggestion-item" data-action="exp-add-${kind}-sample" data-id="${escapeHtml(s.id)}">
      <div class="font-mono text-sm">${escapeHtml(s.name)}</div>
      <div class="text-xs text-gray-500">${escapeHtml(s.composition || "")}</div>
    </div>
  `).join("");
  suggestionsEl.classList.add("lb-show");
}

function hideSampleSuggestions(kind: "input" | "output"): void {
  const el = document.getElementById(`exp-${kind}-sample-suggestions`);
  if (el) el.classList.remove("lb-show");
}

export async function addExpInputSample(id: string): Promise<void> {
  if (!_formInputSamples.includes(id)) _formInputSamples.push(id);
  renderInputSamplesBadges();
  hideSampleSuggestions("input");
  const searchEl = document.getElementById("exp-input-sample-search") as HTMLInputElement | null;
  if (searchEl) searchEl.value = "";
}

export async function addExpOutputSample(id: string): Promise<void> {
  if (!_formOutputSamples.includes(id)) _formOutputSamples.push(id);
  renderOutputSamplesBadges();
  hideSampleSuggestions("output");
  const searchEl = document.getElementById("exp-output-sample-search") as HTMLInputElement | null;
  if (searchEl) searchEl.value = "";
}

export function removeExpInputSample(id: string): void {
  _formInputSamples = _formInputSamples.filter((x) => x !== id);
  renderInputSamplesBadges();
}

export function removeExpOutputSample(id: string): void {
  _formOutputSamples = _formOutputSamples.filter((x) => x !== id);
  renderOutputSamplesBadges();
}

export async function searchExpInputSamplesHandler(query: string): Promise<void> {
  await showSampleSuggestions(query, "input");
}

export async function searchExpOutputSamplesHandler(query: string): Promise<void> {
  await showSampleSuggestions(query, "output");
}

// ─── Submit ───

export async function submitExperimentForm(): Promise<void> {
  const { auth } = await import("../firebase.js");
  const uid = auth.currentUser?.uid;
  if (!uid) {
    (window as any).showToast?.("Bạn cần đăng nhập", "error");
    return;
  }

  const code = (document.getElementById("exp-form-code") as HTMLInputElement | null)?.value.trim() || undefined;
  const typeEl = document.getElementById("exp-form-type") as HTMLSelectElement | null;
  const type = (typeEl?.value || "hydrothermal") as ExperimentType;
  const statusEl = document.getElementById("exp-form-status") as HTMLSelectElement | null;
  const status = (statusEl?.value || "completed") as ExperimentStatus;
  const performedAtStr = (document.getElementById("exp-form-performed-at") as HTMLInputElement | null)?.value;
  const conclusion = (document.getElementById("exp-form-conclusion") as HTMLTextAreaElement | null)?.value.trim();
  const tagsRaw = (document.getElementById("exp-form-tags") as HTMLInputElement | null)?.value || "";
  const notes = (document.getElementById("exp-form-notes") as HTMLTextAreaElement | null)?.value.trim();

  // Validate required conditions
  const missing = validateRequiredConditions();
  if (missing.length > 0) {
    (window as any).showToast?.(`Thiếu fields bắt buộc: ${missing.join(", ")}`, "error");
    return;
  }

  const conditions = collectConditions();
  const tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  let performedAt: any = undefined;
  if (performedAtStr) {
    const d = new Date(performedAtStr);
    if (!isNaN(d.getTime())) performedAt = d.getTime();
  }

  try {
    const { createExperiment } = await import("../services/experiments.js");
    const input: any = {
      type,
      inputSamples: _formInputSamples,
      outputSamples: _formOutputSamples,
      conditions,
      status,
      tags,
    };
    if (code) input.code = code;
    if (performedAt !== undefined) input.performedAt = performedAt;
    if (conclusion) input.conclusion = conclusion;
    if (notes) input.notes = notes;

    await createExperiment(input, uid);
    (window as any).showToast?.("Đã tạo experiment", "success");
    closeModal("modal-experiment-form");
    await renderExperimentsUnified();
  } catch (err: any) {
    console.error("[submitExperimentForm]", err);
    const msg = err?.message?.includes("PERMISSION_DENIED") || err?.code === "permission-denied"
      ? "Không có quyền (rules check role member/admin/superadmin)."
      : `Lỗi: ${err?.message || err}`;
    (window as any).showToast?.(msg, "error");
  }
}

// ─── Window assignments ───

(window as any).renderExperimentsUnified = renderExperimentsUnified;
(window as any).openExperimentDetail = openExperimentDetail;
(window as any).filterExperimentsByType = filterExperimentsByType;
(window as any).openExperimentForm = openExperimentForm;
(window as any).changeExperimentFormType = changeExperimentFormType;
(window as any).submitExperimentForm = submitExperimentForm;
(window as any).addExpInputSample = addExpInputSample;
(window as any).addExpOutputSample = addExpOutputSample;
(window as any).removeExpInputSample = removeExpInputSample;
(window as any).removeExpOutputSample = removeExpOutputSample;
(window as any).searchExpInputSamplesHandler = searchExpInputSamplesHandler;
(window as any).searchExpOutputSamplesHandler = searchExpOutputSamplesHandler;


// ═══════════════════════════════════════════════════════════
// R153b — DataAssets section in experiment detail modal
// ═══════════════════════════════════════════════════════════

const _DA_TYPE_LABELS: Record<DataAssetType, string> = {
  'xrd':              'XRD',
  'sem':              'SEM',
  'tem':              'TEM',
  'raman':            'Raman',
  'ftir':             'FTIR',
  'uv-vis':           'UV-Vis',
  'uv-vis-drs':       'UV-Vis DRS',
  'pl':               'PL',
  'eds':              'EDS',
  'xps':              'XPS',
  'electrochem-csv':  'Điện hóa (CV/LSV/EIS)',
  'image':            'Ảnh',
  'document':         'Tài liệu',
  'other':            'Khác',
};

function detectDataAssetType(fileName: string, mimeType: string): DataAssetType {
  const lower = fileName.toLowerCase();
  if (/^image\//.test(mimeType)) return 'image';
  if (/^application\/pdf$/.test(mimeType) || lower.endsWith('.pdf')) return 'document';
  if (lower.endsWith('.csv')) {
    if (/cv[-_]/.test(lower) || /lsv/.test(lower) || /eis/.test(lower) || /tafel/.test(lower)) return 'electrochem-csv';
    if (/xrd|2theta|pattern/.test(lower)) return 'xrd';
    if (/raman/.test(lower)) return 'raman';
    if (/ftir|ir[-_]/.test(lower)) return 'ftir';
    if (/uv|vis|drs/.test(lower)) return 'uv-vis';
    if (/pl[-_]|photolum/.test(lower)) return 'pl';
    if (/xps/.test(lower)) return 'xps';
    return 'electrochem-csv';
  }
  if (/^application\/.*excel/.test(mimeType) || lower.endsWith('.xlsx')) return 'electrochem-csv';
  return 'other';
}

function fmtUploadDate(da: DataAsset): string {
  const d = tsToDate(da.uploadedAt);
  if (!d) return '—';
  return d.toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

async function renderDataAssetsSection(experimentId: string): Promise<void> {
  const el = document.getElementById('exp-detail-dataassets');
  if (!el) return;
  let assets: DataAsset[] = [];
  try {
    assets = await listByExperiment(experimentId);
  } catch (err: any) {
    el.innerHTML = `<div class="lb-hint" style="color:#EF4444">Lỗi tải: ${escapeHtml(err?.message || String(err))}</div>`;
    return;
  }
  const typeOptions = (Object.keys(_DA_TYPE_LABELS) as DataAssetType[]).map(t =>
    `<option value="${t}">${escapeHtml(_DA_TYPE_LABELS[t])}</option>`
  ).join('');
  const listHtml = assets.length === 0
    ? `<div class="lb-hint">Chưa có tệp đính kèm.</div>`
    : `<div class="lb-da-list">${assets.map(da => `
        <div class="lb-da-item" data-asset-id="${escapeHtml(da.id)}">
          <div class="lb-da-item-main">
            <span class="lb-da-type-badge" data-type="${escapeHtml(da.type)}">${escapeHtml(_DA_TYPE_LABELS[da.type] || da.type)}</span>
            <span class="lb-da-name" title="${escapeHtml(da.fileName)}">${escapeHtml(da.fileName)}</span>
          </div>
          <div class="lb-da-item-meta">
            <span>${escapeHtml(formatFileSize(da.fileSize))}</span>
            <span>${escapeHtml(fmtUploadDate(da))}</span>
            <button type="button" class="lb-da-btn lb-da-btn--download" data-action="da-download" data-asset-id="${escapeHtml(da.id)}" title="Tải về">⬇</button>
            <button type="button" class="lb-da-btn lb-da-btn--delete" data-action="da-delete" data-asset-id="${escapeHtml(da.id)}" data-asset-name="${escapeHtml(da.fileName)}" title="Xóa">×</button>
          </div>
        </div>
      `).join('')}</div>`;
  el.innerHTML = `
    ${listHtml}
    <div class="lb-da-upload" data-experiment-id="${escapeHtml(experimentId)}">
      <select class="cs-select lb-da-type-select" id="da-upload-type-${escapeHtml(experimentId)}">
        ${typeOptions}
      </select>
      <input type="file" class="lb-da-file" id="da-upload-file-${escapeHtml(experimentId)}" data-input-action="da-file-pick" data-experiment-id="${escapeHtml(experimentId)}">
      <div class="lb-da-progress" id="da-progress-${escapeHtml(experimentId)}" style="display:none">
        <div class="lb-da-progress-bar"><div class="lb-da-progress-fill" style="width:0%"></div></div>
        <span class="lb-da-progress-text">0%</span>
      </div>
    </div>
  `;
}

(window as any).renderDataAssetsSection = renderDataAssetsSection;

export async function handleDataAssetFilePick(experimentId: string): Promise<void> {
  const fileInput = document.getElementById(`da-upload-file-${experimentId}`) as HTMLInputElement | null;
  const typeSelect = document.getElementById(`da-upload-type-${experimentId}`) as HTMLSelectElement | null;
  const progressEl = document.getElementById(`da-progress-${experimentId}`);
  const progressFill = progressEl?.querySelector('.lb-da-progress-fill') as HTMLElement | null;
  const progressText = progressEl?.querySelector('.lb-da-progress-text') as HTMLElement | null;
  if (!fileInput || !typeSelect || !fileInput.files || fileInput.files.length === 0) return;
  const file = fileInput.files[0];

  // R153d: Content-aware classifier
  if (!typeSelect.dataset.userPicked) {
    try {
      const result = await classifyDataAssetFile(file);
      if (result.confidence >= 0.5) {
        typeSelect.value = result.type;
        // Show classifier hint inline below upload zone
        const uploadEl = typeSelect.closest('.lb-da-upload') as HTMLElement | null;
        if (uploadEl) {
          let hint = uploadEl.querySelector('.lb-da-classify-hint') as HTMLElement | null;
          if (!hint) {
            hint = document.createElement('div');
            hint.className = 'lb-da-classify-hint';
            uploadEl.appendChild(hint);
          }
          const pct = Math.round(result.confidence * 100);
          hint.innerHTML = `🔍 Đã phát hiện: <strong>${result.type}</strong> (${pct}%) — ${result.reason}`;
        }
      } else {
        // Fallback to filename-only heuristic (R153b original)
        typeSelect.value = detectDataAssetType(file.name, file.type);
      }
    } catch (err) {
      console.warn('[classify] Error', err);
      typeSelect.value = detectDataAssetType(file.name, file.type);
    }
  }
  const type = typeSelect.value as DataAssetType;
  if (progressEl) progressEl.style.display = '';
  try {
    await uploadDataAsset(file, { experimentId, type }, (pct) => {
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (progressText) progressText.textContent = `${pct}%`;
    });
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast(`Đã tải lên: ${file.name}`, 'success');
    }
    await renderDataAssetsSection(experimentId);
  } catch (err: any) {
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast(`Lỗi tải lên: ${err?.message || err}`, 'error');
    }
    if (progressEl) progressEl.style.display = 'none';
  }
}

(window as any).handleDataAssetFilePick = handleDataAssetFilePick;

export async function handleDataAssetDownload(assetId: string): Promise<void> {
  try {
    // Fetch the asset doc to get storagePath
    const { getDataAsset } = await import('../services/data-assets.js');
    const asset = await getDataAsset(assetId);
    if (!asset) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Không tìm thấy tệp', 'error');
      }
      return;
    }
    const url = await getDataAssetURL(asset);
    // Open in new tab (browser handles download via Storage URL)
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (err: any) {
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast(`Lỗi tải về: ${err?.message || err}`, 'error');
    }
  }
}

(window as any).handleDataAssetDownload = handleDataAssetDownload;

export async function handleDataAssetDelete(assetId: string, assetName: string, experimentId: string): Promise<void> {
  if (!confirm(`Xóa "${assetName}"?\nHành động này không thể hoàn tác.`)) return;
  try {
    await deleteDataAsset(assetId);
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast(`Đã xóa: ${assetName}`, 'success');
    }
    await renderDataAssetsSection(experimentId);
  } catch (err: any) {
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast(`Lỗi xóa: ${err?.message || err}`, 'error');
    }
  }
}

(window as any).handleDataAssetDelete = handleDataAssetDelete;


// ═══════════════════════════════════════════════════════════
// R154-1 — Lineage graph modal handler
// ═══════════════════════════════════════════════════════════

export async function openLineageGraphModal(experimentId: string): Promise<void> {
  if (!_cache) return;
  const exp = _cache.find(x => x.id === experimentId);
  if (!exp) return;

  const container = document.getElementById('lineage-graph-container');
  const statusEl = document.getElementById('lineage-graph-status');
  if (!container || !statusEl) return;

  container.innerHTML = '';
  statusEl.textContent = 'Đang tải dữ liệu lineage...';
  statusEl.style.color = '#475569';
  openModal('modal-lineage-graph');

  try {
    const graph = await buildLineageGraph(exp);
    if (graph.nodes.length === 0) {
      statusEl.textContent = 'Không có dữ liệu lineage cho thí nghiệm này.';
      statusEl.style.color = '#EF4444';
      return;
    }
    statusEl.textContent = `${graph.nodes.length} node, ${graph.edges.length} liên kết. Kéo để di chuyển, scroll để zoom.`;
    statusEl.style.color = '#0D9488';
    renderLineageGraph(container, graph);
  } catch (err: any) {
    console.error('[lineage] render failed', err);
    statusEl.textContent = `Lỗi: ${err?.message || String(err)}`;
    statusEl.style.color = '#EF4444';
  }
}

(window as any).openLineageGraphModal = openLineageGraphModal;

// Handler for node click (close lineage modal, navigate to entity detail)
(window as any).onLineageNodeClick = (type: string, refId: string) => {
  closeModal('modal-lineage-graph');
  // Small delay to let modal close animation finish
  setTimeout(() => {
    if (type === 'experiment') {
      if (typeof (window as any).openExperimentDetail === 'function') {
        (window as any).openExperimentDetail(refId);
      }
    } else if (type === 'sample') {
      if (typeof (window as any).openSampleDetail === 'function') {
        (window as any).openSampleDetail(refId);
      }
    } else if (type === 'material') {
      if (typeof (window as any).openMaterialDetail === 'function') {
        (window as any).openMaterialDetail(refId);
      }
    } else if (type === 'dataasset') {
      if (typeof (window as any).openDataAssetPreview === 'function') {
        (window as any).openDataAssetPreview(refId);
      }
    }
  }, 150);
};
