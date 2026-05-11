/**
 * pages/materials.ts — Materials browser + CRUD (R150d-1 + R150d-2)
 */

// @ts-nocheck — Legacy DOM page — will be replaced in Next.js + Carbon port (Phase E). Don't fix here.

import {
  listMaterials,
  searchMaterials,
  createMaterial,
  updateMaterial,
} from "@/domains/materials/service";
import type { Material, MaterialCategory } from "@/shared/domain";
import { escapeHtml } from "@/utils/format.js";
import { openModal, closeModal } from "@/ui/modal.js";
import { auth } from "@/firebase.js";

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  TMD: "TMD (Transition Metal Dichalcogenide)",
  oxide: "Oxide",
  perovskite: "Perovskite",
  MOF: "MOF (Metal-Organic Framework)",
  alloy: "Alloy",
  polymer: "Polymer",
  carbon: "Carbon",
  salt: "Salt / Precursor",
  composite: "Composite",
  other: "Other",
};

const CATEGORY_ORDER: MaterialCategory[] = [
  "TMD", "oxide", "perovskite", "MOF", "carbon",
  "alloy", "polymer", "salt", "composite", "other",
];

let _cache: Material[] | null = null;
let _editingMaterial: Material | null = null;
let _searchQuery = "";

export async function renderMaterials(): Promise<void> {
  const root = document.getElementById("page-materials");
  if (!root) return;

  const contentEl = root.querySelector("[data-materials-content]") as HTMLElement | null;
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="text-gray-500 py-8 text-center">Đang tải...</div>';

  let items: Material[];
  try {
    if (_searchQuery.trim()) {
      items = await searchMaterials(_searchQuery, { limit: 500 });
    } else {
      items = await listMaterials({ limit: 500 });
    }
    _cache = items;
  } catch (err) {
    console.error("[materials] load failed:", err);
    contentEl.innerHTML =
      '<div class="text-red-600 py-8 text-center">Không tải được dữ liệu Materials. ' +
      'Kiểm tra Firestore rules và tenantId claim.</div>';
    return;
  }

  if (items.length === 0) {
    const msg = _searchQuery.trim()
      ? `Không tìm thấy vật liệu khớp "${escapeHtml(_searchQuery)}".`
      : 'Chưa có vật liệu nào. Bấm "Thêm vật liệu" để bắt đầu.';
    contentEl.innerHTML = `<div class="text-gray-500 py-8 text-center">${msg}</div>`;
    return;
  }

  const byCategory = new Map<MaterialCategory, Material[]>();
  for (const m of items) {
    const cat = m.category || "other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(m);
  }

  const html = CATEGORY_ORDER
    .filter((cat) => byCategory.has(cat))
    .map((cat) => {
      const list = byCategory.get(cat)!;
      const cards = list.map(renderCard).join("");
      return `
        <section class="mb-6">
          <h2 class="text-lg font-semibold mb-3" style="color:#0F172A">
            ${escapeHtml(CATEGORY_LABELS[cat] || cat)}
            <span class="text-sm font-normal text-gray-500">(${list.length})</span>
          </h2>
          <div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
            ${cards}
          </div>
        </section>
      `;
    })
    .join("");

  contentEl.innerHTML = html;
}

function renderCard(m: Material): string {
  const formula = escapeHtml(m.formula || "");
  const name = escapeHtml(m.name || "");
  const aliasCount = (m.aliases || []).length;
  const refCount = (m.references || []).length;
  return `
    <div class="card p-3 cursor-pointer hover:shadow-md transition" style="background:white;border:1px solid #E2E8F0;border-radius:8px"
         data-action="open-material-detail" data-id="${escapeHtml(m.id)}">
      <div class="font-mono text-base font-semibold" style="color:#0F172A">${formula}</div>
      <div class="text-sm text-gray-600 mt-1">${name}</div>
      <div class="text-xs text-gray-400 mt-2 flex gap-3">
        ${aliasCount > 0 ? `<span>${aliasCount} alias</span>` : ""}
        ${refCount > 0 ? `<span>${refCount} ref</span>` : ""}
      </div>
    </div>
  `;
}

export function openMaterialDetail(id: string): void {
  if (!_cache) return;
  const m = _cache.find((x) => x.id === id);
  if (!m) return;
  _editingMaterial = m;

  const props = m.knownProperties || {};
  const propsHtml = Object.entries(props)
    .map(
      ([k, v]) => `
        <div class="flex justify-between py-1 border-b border-gray-100">
          <span class="text-sm text-gray-600">${escapeHtml(k)}</span>
          <span class="text-sm font-mono">${escapeHtml(String(v))}</span>
        </div>
      `,
    )
    .join("");

  const aliasesHtml = (m.aliases || []).length
    ? `<div class="mt-3"><span class="text-xs text-gray-500">Aliases:</span> ` +
      (m.aliases || []).map((a) => `<span class="badge">${escapeHtml(a)}</span>`).join(" ") +
      `</div>`
    : "";

  const refsHtml = (m.references || []).length
    ? `<div class="mt-3"><span class="text-xs text-gray-500">References:</span> ` +
      `${(m.references || []).length} paper(s) — link UI in R150e</div>`
    : "";

  // R150e: lookup chemicals matching this material's formula
  const chemicalsHtml = renderLinkedChemicals(m.formula);

  const bodyEl = document.getElementById("modal-material-detail-body");
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div data-material-id="${escapeHtml(m.id)}">
        <div class="font-mono text-2xl font-bold" style="color:#0F172A">${escapeHtml(m.formula)}</div>
        <div class="text-base text-gray-700 mt-1">${escapeHtml(m.name)}</div>
        <div class="text-xs text-gray-500 mt-1">Category: ${escapeHtml(CATEGORY_LABELS[m.category] || m.category)}</div>
      </div>
      ${aliasesHtml}
      ${propsHtml ? `<div class="mt-4"><h3 class="font-semibold mb-2">Known properties</h3>${propsHtml}</div>` : ""}
      ${refsHtml}
      ${chemicalsHtml}
      <div class="text-xs text-gray-400 mt-4 pt-3 border-t">
        ID: <span class="font-mono">${escapeHtml(m.id)}</span><br>
        Tenant: <span class="font-mono">${escapeHtml(m.tenantId)}</span>
      </div>
    `;
  }
  openModal("modal-material-detail");
}

/**
 * R150e: Find chemicals in window.cache.chemicals with matching formula
 * (case-insensitive). Returns HTML section or empty string if none.
 */
function renderLinkedChemicals(formula: string): string {
  const cache = (window as any).cache;
  if (!cache || !cache.chemicals) return "";

  const normFormula = (formula || "").trim().toLowerCase();
  if (!normFormula) return "";

  // cache.chemicals is keyed object — iterate values
  const matches: Array<{ key: string; data: any }> = [];
  for (const key of Object.keys(cache.chemicals)) {
    const c = cache.chemicals[key];
    if (!c) continue;
    const cFormula = (c.formula || "").trim().toLowerCase();
    if (cFormula && cFormula === normFormula) {
      matches.push({ key, data: c });
    }
  }

  if (matches.length === 0) {
    return `
      <div class="mt-4 pt-3 border-t">
        <h3 class="font-semibold mb-2">Hóa chất trong kho</h3>
        <div class="text-xs text-gray-500">
          Không có chai hóa chất nào trùng công thức "${escapeHtml(formula)}" trong kho.
        </div>
      </div>
    `;
  }

  const rows = matches.map(({ key, data }) => {
    const name = escapeHtml(data.name || "(không tên)");
    const vendor = escapeHtml(data.vendor || "");
    const stock = data.stock != null ? String(data.stock) : "—";
    const unit = escapeHtml(data.unit || "");
    const purity = data.purity != null ? `${data.purity}%` : "";
    return `
      <div class="flex items-center justify-between py-2 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
           data-action="show-page" data-page="chemicals">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">${name}</div>
          <div class="text-xs text-gray-500">${vendor}${vendor && purity ? " · " : ""}${purity}</div>
        </div>
        <div class="text-sm font-mono text-gray-700 ml-2">${escapeHtml(stock)} ${unit}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="mt-4 pt-3 border-t">
      <h3 class="font-semibold mb-2">
        Hóa chất trong kho
        <span class="text-xs font-normal text-gray-500">(${matches.length} chai)</span>
      </h3>
      <div>${rows}</div>
      <div class="text-xs text-gray-400 mt-2">
        Click 1 chai để mở trang Hóa chất.
      </div>
    </div>
  `;
}

export function openMaterialForm(editing: Material | null = null): void {
  _editingMaterial = editing;

  const titleEl = document.getElementById("modal-material-form-title");
  const formulaEl = document.getElementById("mat-formula") as HTMLInputElement | null;
  const nameEl = document.getElementById("mat-name") as HTMLInputElement | null;
  const aliasesEl = document.getElementById("mat-aliases") as HTMLInputElement | null;
  const categoryEl = document.getElementById("mat-category") as HTMLSelectElement | null;
  const subcategoryEl = document.getElementById("mat-subcategory") as HTMLInputElement | null;
  const propertiesEl = document.getElementById("mat-properties") as HTMLTextAreaElement | null;

  if (titleEl) titleEl.textContent = editing ? "Sửa vật liệu" : "Thêm vật liệu";

  if (editing) {
    if (formulaEl) { formulaEl.value = editing.formula || ""; formulaEl.readOnly = true; }
    if (nameEl) nameEl.value = editing.name || "";
    if (aliasesEl) aliasesEl.value = (editing.aliases || []).join(", ");
    if (categoryEl) categoryEl.value = editing.category || "other";
    if (subcategoryEl) subcategoryEl.value = editing.subcategory || "";
    if (propertiesEl) {
      const props = editing.knownProperties || {};
      propertiesEl.value = Object.keys(props).length
        ? JSON.stringify(props, null, 2)
        : "";
    }
  } else {
    if (formulaEl) { formulaEl.value = ""; formulaEl.readOnly = false; }
    if (nameEl) nameEl.value = "";
    if (aliasesEl) aliasesEl.value = "";
    if (categoryEl) categoryEl.value = "other";
    if (subcategoryEl) subcategoryEl.value = "";
    if (propertiesEl) propertiesEl.value = "";
  }

  openModal("modal-material-form");
}

export async function submitMaterialForm(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    (window as any).showToast?.("Bạn cần đăng nhập", "error");
    return;
  }

  const formulaEl = document.getElementById("mat-formula") as HTMLInputElement | null;
  const nameEl = document.getElementById("mat-name") as HTMLInputElement | null;
  const aliasesEl = document.getElementById("mat-aliases") as HTMLInputElement | null;
  const categoryEl = document.getElementById("mat-category") as HTMLSelectElement | null;
  const subcategoryEl = document.getElementById("mat-subcategory") as HTMLInputElement | null;
  const propertiesEl = document.getElementById("mat-properties") as HTMLTextAreaElement | null;

  const formula = (formulaEl?.value || "").trim();
  const name = (nameEl?.value || "").trim();
  const aliases = (aliasesEl?.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const category = (categoryEl?.value || "other") as MaterialCategory;
  const subcategory = (subcategoryEl?.value || "").trim() || undefined;

  if (!formula || !name) {
    (window as any).showToast?.("Cần nhập formula và tên", "error");
    return;
  }

  let knownProperties: any = {};
  const propsRaw = (propertiesEl?.value || "").trim();
  if (propsRaw) {
    try {
      knownProperties = JSON.parse(propsRaw);
      if (typeof knownProperties !== "object" || Array.isArray(knownProperties)) {
        throw new Error("must be JSON object");
      }
    } catch (err: any) {
      (window as any).showToast?.(`JSON properties không hợp lệ: ${err.message}`, "error");
      return;
    }
  }

  try {
    if (_editingMaterial) {
      await updateMaterial(
        _editingMaterial.id,
        { name, aliases, category, subcategory, knownProperties },
        uid,
      );
      (window as any).showToast?.("Đã cập nhật vật liệu", "success");
    } else {
      await createMaterial(
        { formula, name, aliases, category, subcategory, knownProperties },
        uid,
      );
      (window as any).showToast?.("Đã thêm vật liệu", "success");
    }
    closeModal("modal-material-form");
    _editingMaterial = null;
    await renderMaterials();
  } catch (err: any) {
    console.error("[submitMaterialForm]", err);
    const msg = err?.message?.includes("PERMISSION_DENIED") || err?.code === "permission-denied"
      ? "Không có quyền (rules check role admin/superadmin trên claim — chưa migrate role)."
      : `Lỗi: ${err?.message || err}`;
    (window as any).showToast?.(msg, "error");
  }
}

export async function searchMaterialsHandler(query: string): Promise<void> {
  _searchQuery = query || "";
  await renderMaterials();
}

(window as any).renderMaterials = renderMaterials;
(window as any).openMaterialDetail = openMaterialDetail;
(window as any).openMaterialForm = openMaterialForm;
(window as any).submitMaterialForm = submitMaterialForm;
(window as any).searchMaterialsHandler = searchMaterialsHandler;

(window as any).openMaterialFormFromDetail = function() {
  if (_editingMaterial) {
    openMaterialForm(_editingMaterial);
  }
};
