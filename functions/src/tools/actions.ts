/**
 * Action Tools — Round 115a
 *
 * Write-side tools for AI assistant. KHÁC với read tools (R112) —
 * action tools KHÔNG ghi DB ngay, mà trả về DRAFT structure để
 * frontend show confirmation UI. User confirm xong thì frontend
 * gọi `confirmAction` endpoint riêng để actually commit.
 *
 * Permission: chỉ superadmin được dùng action tools.
 *
 * 3 tools:
 * - createExperimentDraft (hydro | electrochem)
 * - updateChemicalStockDraft
 * - createBookingDraft
 */

import * as admin from "firebase-admin";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface ExperimentDraft {
  type: "experiment-draft";
  draftId: string;
  category: "hydro" | "electrochem";
  preview: {
    code: string;
    date: string;
    person: string;
    fields: Record<string, any>;
  };
  payload: Record<string, any>; // Full payload to write
  targetPath: string; // RTDB path to write to
}

export interface ChemicalStockDraft {
  type: "chemical-stock-draft";
  draftId: string;
  preview: {
    chemicalName: string;
    chemicalKey: string;
    field: "stock" | "qty";
    oldValue: number;
    newValue: number;
    delta: number;
    unit: string;
    reason?: string;
  };
  payload: {
    [field: string]: number | string; // partial update
  };
  targetPath: string;
}

export interface BookingDraft {
  type: "booking-draft";
  draftId: string;
  preview: {
    code: string;
    equipmentName: string;
    equipmentKey: string;
    date: string;
    startTime: string;
    endTime: string;
    purpose: string;
    userName: string;
  };
  payload: Record<string, any>;
  targetPath: string;
}

export type ActionDraft =
  | ExperimentDraft
  | ChemicalStockDraft
  | BookingDraft
  | ExperimentResultDraft;

// ────────────────────────────────────────────────────────────
// Helper: get user displayName
// ────────────────────────────────────────────────────────────

async function getUserDisplayName(uid: string): Promise<string> {
  try {
    const snap = await admin.database().ref(`users/${uid}/displayName`).once("value");
    return snap.val() || "Unknown User";
  } catch {
    return "Unknown User";
  }
}

// ────────────────────────────────────────────────────────────
// Helper: today's date in formats
// ────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function generateDraftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ────────────────────────────────────────────────────────────
// Tool 1: createExperimentDraft
// ────────────────────────────────────────────────────────────

interface CreateExperimentParams {
  category: "hydro" | "electrochem";
  // Common
  date?: string;
  person?: string;
  note?: string;
  isSample?: boolean;
  // Hydro
  material?: string;
  temp?: number;
  time?: number;
  rate?: number;
  ph?: number;
  vol?: number;
  // Electrochem
  electrode?: string;
  ec_type?: string; // "type" is reserved-ish
  reaction?: string;
  electrolyte?: string;
  re?: string;
  ce?: string;
  inst?: string;
  estart?: string;
  eend?: string;
  ir?: string;
}

export async function createExperimentDraft(
  uid: string,
  params: CreateExperimentParams
): Promise<ExperimentDraft | { error: string }> {
  const { category } = params;
  if (category !== "hydro" && category !== "electrochem") {
    return { error: `Category không hợp lệ: ${category}. Chỉ hỗ trợ: hydro, electrochem` };
  }

  const displayName = params.person || (await getUserDisplayName(uid));
  const date = params.date || todayISO();
  const code = category === "hydro" ? `HT-${Date.now()}` : `EC-${Date.now()}`;

  let payload: Record<string, any>;
  let fields: Record<string, any>;

  if (category === "hydro") {
    payload = {
      code,
      date,
      person: displayName,
      uid,
      createdBy: displayName,
      createdAt: todayDDMMYYYY(),
      status: "Đang thực hiện",
      isSample: params.isSample || false,
      material: params.material || "",
      note: params.note || "",
      temp: params.temp ?? 0,
      time: params.time ?? 0,
      rate: params.rate ?? 0,
      ph: params.ph ?? 7,
      vol: params.vol ?? 0,
    };
    fields = {
      "Vật liệu": params.material || "(chưa nhập)",
      "Nhiệt độ": params.temp ? `${params.temp}°C` : "(chưa nhập)",
      "Thời gian giữ": params.time ? `${params.time}h` : "(chưa nhập)",
      "Tốc độ gia nhiệt": params.rate ? `${params.rate}°C/min` : "(chưa nhập)",
      "pH": params.ph ?? 7,
      "Thể tích": params.vol ? `${params.vol} mL` : "(chưa nhập)",
      "Mẫu test": params.isSample ? "Có" : "Không",
    };
  } else {
    // electrochem
    payload = {
      code,
      date,
      person: displayName,
      createdBy: displayName,
      createdAt: todayDDMMYYYY(),
      status: "Đang xử lý",
      electrode: params.electrode || "",
      type: params.ec_type || "",
      reaction: params.reaction || "",
      electrolyte: params.electrolyte || "",
      re: params.re || "",
      ce: params.ce || "",
      inst: params.inst || "",
      estart: params.estart || "",
      eend: params.eend || "",
      rate: params.rate ?? "",
      ir: params.ir || "",
      // Optional metrics — null
      eta10: null,
      tafel: null,
      j0: null,
      rs: null,
      rct: null,
      ecsa: null,
    };
    fields = {
      "Loại đo": params.ec_type || "(chưa nhập)",
      "Phản ứng": params.reaction || "(chưa nhập)",
      "Điện cực": params.electrode || "(chưa nhập)",
      "Điện ly": params.electrolyte || "(chưa nhập)",
      "RE": params.re || "(chưa nhập)",
      "CE": params.ce || "(chưa nhập)",
      "Thiết bị": params.inst || "(chưa nhập)",
      "E start": params.estart || "(chưa nhập)",
      "E end": params.eend || "(chưa nhập)",
      "Rate": params.rate || "(chưa nhập)",
      "IR": params.ir || "(chưa nhập)",
    };
  }

  return {
    type: "experiment-draft",
    draftId: generateDraftId(),
    category,
    preview: { code, date, person: displayName, fields },
    payload,
    targetPath: category, // "hydro" or "electrochem" — will be pushed to /hydro or /electrochem
  };
}

// ────────────────────────────────────────────────────────────
// Tool 2: updateChemicalStockDraft
// ────────────────────────────────────────────────────────────

interface UpdateChemicalParams {
  chemicalQuery: string; // "NaCl", "Na2WO4", etc.
  newStock?: number;
  delta?: number; // alternative: relative change
  field?: "stock" | "qty"; // default "stock"
  reason?: string;
}

export async function updateChemicalStockDraft(
  uid: string,
  params: UpdateChemicalParams
): Promise<ChemicalStockDraft | { error: string }> {
  const { chemicalQuery, newStock, delta, field = "stock", reason } = params;

  if (!chemicalQuery) {
    return { error: "Thiếu chemicalQuery" };
  }
  if (newStock === undefined && delta === undefined) {
    return { error: "Cần newStock hoặc delta" };
  }

  // Search chemical
  const snap = await admin.database().ref("chemicals").once("value");
  const chemicals = snap.val() || {};

  const queryLower = chemicalQuery.toLowerCase().trim();
  let matchKey: string | null = null;
  let matchData: any = null;

  // Exact match first
  for (const [k, v] of Object.entries<any>(chemicals)) {
    if (
      v.name?.toLowerCase() === queryLower ||
      v.formula?.toLowerCase() === queryLower ||
      v.cas?.toLowerCase() === queryLower
    ) {
      matchKey = k;
      matchData = v;
      break;
    }
  }

  // Partial match if no exact
  if (!matchKey) {
    for (const [k, v] of Object.entries<any>(chemicals)) {
      if (
        v.name?.toLowerCase().includes(queryLower) ||
        v.formula?.toLowerCase().includes(queryLower)
      ) {
        matchKey = k;
        matchData = v;
        break;
      }
    }
  }

  if (!matchKey) {
    return { error: `Không tìm thấy hóa chất khớp với "${chemicalQuery}"` };
  }

  const oldValue = matchData[field] ?? 0;
  let newValue: number;
  let actualDelta: number;

  if (newStock !== undefined) {
    newValue = newStock;
    actualDelta = newValue - oldValue;
  } else {
    actualDelta = delta!;
    newValue = oldValue + actualDelta;
  }

  if (newValue < 0) {
    return { error: `Giá trị mới không được âm (${newValue})` };
  }

  return {
    type: "chemical-stock-draft",
    draftId: generateDraftId(),
    preview: {
      chemicalName: matchData.name || matchKey,
      chemicalKey: matchKey,
      field,
      oldValue,
      newValue,
      delta: actualDelta,
      unit: matchData.unit || "",
      reason,
    },
    payload: {
      [field]: newValue,
      updatedAt: todayDDMMYYYY(),
      updatedBy: await getUserDisplayName(uid),
    },
    targetPath: `chemicals/${matchKey}`,
  };
}

// ────────────────────────────────────────────────────────────
// Tool 3: createBookingDraft
// ────────────────────────────────────────────────────────────

interface CreateBookingParams {
  equipmentQuery: string; // "SEM", "máy ly tâm", etc.
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  purpose?: string;
}

export async function createBookingDraft(
  uid: string,
  params: CreateBookingParams
): Promise<BookingDraft | { error: string }> {
  const { equipmentQuery, date, startTime, endTime, purpose } = params;

  if (!equipmentQuery || !date || !startTime || !endTime) {
    return { error: "Thiếu fields: equipmentQuery, date, startTime, endTime" };
  }

  // Validate time format
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { error: "startTime/endTime phải dạng HH:MM" };
  }
  if (startTime >= endTime) {
    return { error: "startTime phải nhỏ hơn endTime" };
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "date phải dạng YYYY-MM-DD" };
  }

  // Search equipment
  const snap = await admin.database().ref("equipment").once("value");
  const equipment = snap.val() || {};

  const queryLower = equipmentQuery.toLowerCase().trim();
  let equipmentKey: string | null = null;
  let equipmentData: any = null;

  for (const [k, v] of Object.entries<any>(equipment)) {
    const name = (v.name || "").toLowerCase();
    if (name === queryLower || name.includes(queryLower)) {
      equipmentKey = k;
      equipmentData = v;
      break;
    }
  }

  if (!equipmentKey) {
    return { error: `Không tìm thấy thiết bị khớp với "${equipmentQuery}"` };
  }

  const userName = await getUserDisplayName(uid);
  const code = `BK-${Date.now()}`;

  return {
    type: "booking-draft",
    draftId: generateDraftId(),
    preview: {
      code,
      equipmentName: equipmentData.name || "",
      equipmentKey,
      date,
      startTime,
      endTime,
      purpose: purpose || "",
      userName,
    },
    payload: {
      code,
      createdAt: new Date().toISOString(),
      date,
      startTime,
      endTime,
      equipmentKey,
      equipmentName: equipmentData.name || "",
      purpose: purpose || "",
      status: "pending",
      userId: uid,
      userName,
    },
    targetPath: "bookings",
  };
}

// ────────────────────────────────────────────────────────────
// Confirm action: actually write to DB
// ────────────────────────────────────────────────────────────

export async function commitDraft(
  uid: string,
  draft: ActionDraft
): Promise<{ success: boolean; resultKey?: string; error?: string }> {
  try {
    let resultKey: string;
    const db = admin.database();

    if (draft.type === "experiment-draft") {
      // Push to /hydro or /electrochem
      const ref = db.ref(draft.targetPath);
      const newRef = ref.push();
      await newRef.set(draft.payload);
      resultKey = newRef.key || "";
    } else if (draft.type === "chemical-stock-draft") {
      // Update fields at /chemicals/{key}
      await db.ref(draft.targetPath).update(draft.payload);
      resultKey = draft.preview.chemicalKey;
    } else if (draft.type === "booking-draft") {
      const ref = db.ref(draft.targetPath);
      const newRef = ref.push();
      await newRef.set(draft.payload);
      resultKey = newRef.key || "";
    } else if (draft.type === "experiment-result-draft") {
      // Round 129a: Update existing record (partial fields)
      // targetPath: "hydro/{key}" or "electrochem/{key}"
      await db.ref(draft.targetPath).update(draft.payload);
      const parts = draft.targetPath.split("/");
      resultKey = parts[parts.length - 1] || "";
    } else {
      return { success: false, error: "Unknown draft type" };
    }

    // Audit log
    await db.ref(`actionAudit/${Date.now()}`).set({
      uid,
      action: draft.type,
      targetPath: draft.targetPath,
      resultKey,
      timestamp: Date.now(),
    });

    return { success: true, resultKey };
  } catch (e: any) {
    console.error("[commitDraft] Error:", e);
    return { success: false, error: e.message || String(e) };
  }
}


// ────────────────────────────────────────────────────────────
// Round 129a: recordExperimentResultDraft
// ────────────────────────────────────────────────────────────

export interface ExperimentResultDraft {
  type: "experiment-result-draft";
  draftId: string;
  category: "hydro" | "electrochem";
  preview: {
    code: string;
    person: string;
    oldStatus: string;
    newStatus: string;
    changes: Record<string, { old: any; new: any }>;
  };
  payload: Record<string, any>;
  targetPath: string;
}

interface RecordResultParams {
  code: string;
  status: string;
  note?: string;
  yield_mass?: number;
  color?: string;
  eta10?: number;
  tafel?: number;
  j0?: number;
  rs?: number;
  rct?: number;
  ecsa?: number;
  _uid?: string;
}

const VALID_RESULT_STATUSES = ["Hoàn thành", "Thất bại", "Cần làm lại"];

export async function recordExperimentResultDraft(
  uid: string,
  params: RecordResultParams
): Promise<ExperimentResultDraft | { error: string }> {
  const { code, status } = params;

  if (!code) return { error: "Thiếu code thí nghiệm" };
  if (!status) return { error: "Thiếu status mới" };
  if (!VALID_RESULT_STATUSES.includes(status)) {
    return {
      error: `Status không hợp lệ. Cho phép: ${VALID_RESULT_STATUSES.join(", ")}`,
    };
  }

  // Detect category từ code prefix
  let category: "hydro" | "electrochem";
  if (code.startsWith("HT-")) category = "hydro";
  else if (code.startsWith("EC-")) category = "electrochem";
  else
    return {
      error: `Code không nhận diện: ${code}. Phải bắt đầu HT- hoặc EC-`,
    };

  // Search record by code
  const snap = await admin.database().ref(category).once("value");
  const records = snap.val() || {};

  let recordKey: string | null = null;
  let oldRecord: any = null;
  for (const [k, v] of Object.entries<any>(records)) {
    if (v && v.code === code) {
      recordKey = k;
      oldRecord = v;
      break;
    }
  }

  if (!recordKey) {
    return {
      error: `Không tìm thấy thí nghiệm với mã ${code} trong /${category}`,
    };
  }

  // Build payload (chỉ fields user cung cấp + status + meta)
  const payload: Record<string, any> = {
    status,
    updatedAt: todayDDMMYYYY(),
    updatedBy: await getUserDisplayName(uid),
  };
  const changes: Record<string, { old: any; new: any }> = {};

  if (oldRecord.status !== status) {
    changes["Trạng thái"] = {
      old: oldRecord.status || "(chưa set)",
      new: status,
    };
  }

  if (params.note !== undefined) {
    payload.note = params.note;
    if ((oldRecord.note || "") !== params.note) {
      changes["Ghi chú"] = {
        old: oldRecord.note || "(rỗng)",
        new: params.note,
      };
    }
  }

  if (category === "hydro") {
    if (params.yield_mass !== undefined) {
      payload.yield_mass = params.yield_mass;
      changes["Khối lượng sản phẩm"] = {
        old: oldRecord.yield_mass ?? "(chưa có)",
        new: `${params.yield_mass} mg`,
      };
    }
    if (params.color !== undefined) {
      payload.color = params.color;
      changes["Màu sản phẩm"] = {
        old: oldRecord.color || "(chưa có)",
        new: params.color,
      };
    }
  }

  if (category === "electrochem") {
    const metrics: Array<[keyof RecordResultParams, string, string]> = [
      ["eta10", "η@10 mA/cm²", "mV"],
      ["tafel", "Tafel slope", "mV/dec"],
      ["j0", "j₀", "mA/cm²"],
      ["rs", "Rs", "Ω"],
      ["rct", "Rct", "Ω"],
      ["ecsa", "ECSA", "cm²"],
    ];
    for (const [key, label, unit] of metrics) {
      const val = params[key];
      if (val !== undefined && val !== null) {
        payload[key as string] = val;
        changes[label] = {
          old: oldRecord[key as string] ?? "(chưa có)",
          new: `${val} ${unit}`,
        };
      }
    }
  }

  if (Object.keys(changes).length === 0) {
    return {
      error: "Không có field nào thay đổi (status giống cũ + không có metric mới)",
    };
  }

  return {
    type: "experiment-result-draft",
    draftId: generateDraftId(),
    category,
    preview: {
      code,
      person: oldRecord.person || oldRecord.createdBy || "—",
      oldStatus: oldRecord.status || "(chưa set)",
      newStatus: status,
      changes,
    },
    payload,
    targetPath: `${category}/${recordKey}`,
  };
}
