/**
 * Tool registry — danh mục tools với JSON schemas (Gemini function declarations).
 *
 * Add new tools here. The registry powers:
 * - tool-executor.ts (dispatcher)
 * - gemini-proxy.ts (inject tool defs vào API request)
 */
import { searchChemicals } from "./chemicals";
import { searchEquipment } from "./equipment";
import { searchExperiments } from "./experiments";
import { getBookings } from "./bookings";
import { listMembers } from "./members";
import { getCurrentDate } from "./utils";

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for parameters (Gemini function declaration format) */
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<any>;
}

export const TOOLS: Record<string, ToolDefinition> = {
  searchChemicals: {
    name: "searchChemicals",
    description:
      "Tra cứu hóa chất trong kho lab theo tên/CAS/công thức. Có thể filter theo nhóm hoặc chỉ lấy hóa chất sắp hết. Trả về thông tin: tên, công thức, CAS, tồn kho hiện tại, mức cảnh báo, vị trí, đơn vị.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Từ khóa tìm kiếm (tên, CAS, hoặc công thức hóa học). Ví dụ: 'Na2WO4', 'thiourea', '7778-80-5'. Để trống để liệt kê tất cả.",
        },
        group: {
          type: "string",
          description:
            "Filter theo nhóm hóa chất (vd: 'Acid', 'Muối', 'Dung môi'). Optional.",
        },
        low_stock_only: {
          type: "boolean",
          description:
            "Chỉ trả về hóa chất sắp hết (stock <= alert level). Default false.",
        },
        limit: {
          type: "number",
          description: "Số kết quả tối đa. Default 20, max 50.",
        },
      },
    },
    handler: searchChemicals,
  },

  searchEquipment: {
    name: "searchEquipment",
    description:
      "Tra cứu thiết bị trong lab theo tên/model/hãng. Trả về: tên, model, hãng, status (đang sử dụng / ngưng), vị trí, số lượng.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Từ khóa tìm kiếm (tên, model, hãng sản xuất). Vd: 'Autolab', 'lò nung', 'autoclave'.",
        },
        status: {
          type: "string",
          description:
            "Filter theo trạng thái: 'Đang sử dụng' hoặc 'Ngưng sử dụng'. Optional.",
        },
        location: {
          type: "string",
          description: "Filter theo vị trí (vd: 'Cơ sở 1', 'Phòng A'). Optional.",
        },
        limit: {
          type: "number",
          description: "Số kết quả tối đa. Default 20.",
        },
      },
    },
    handler: searchEquipment,
  },

  searchExperiments: {
    name: "searchExperiments",
    description:
      "Tra cứu thí nghiệm đã thực hiện qua 4 categories: hydro (thủy nhiệt), electrode (chế tạo điện cực), electrochem (đo điện hóa), ink (công thức mực). Hỗ trợ filter theo người, status, khoảng ngày.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["hydro", "electrode", "electrochem", "ink", "all"],
          description:
            "Loại thí nghiệm. 'all' để tra cứu tất cả categories. Default 'all'.",
        },
        query: {
          type: "string",
          description:
            "Từ khóa: code, vật liệu, hoặc tên thí nghiệm. Vd: 'WS2', 'HT-001'.",
        },
        person: {
          type: "string",
          description: "Tên người thực hiện. Vd: 'Nam'.",
        },
        status: {
          type: "string",
          description:
            "Trạng thái: 'Đang thực hiện', 'Hoàn thành', 'Hủy', vv.",
        },
        date_from: {
          type: "string",
          description:
            "Ngày bắt đầu (DD/MM/YYYY hoặc YYYY-MM-DD). Optional.",
        },
        date_to: {
          type: "string",
          description: "Ngày kết thúc. Optional.",
        },
        limit: {
          type: "number",
          description: "Số kết quả tối đa. Default 15, max 30.",
        },
      },
    },
    handler: searchExperiments,
  },

  getBookings: {
    name: "getBookings",
    description:
      "Tra cứu lịch booking thiết bị. Filter theo thiết bị, người, khoảng ngày, status.",
    parameters: {
      type: "object",
      properties: {
        equipment_name: {
          type: "string",
          description: "Tên thiết bị. Optional.",
        },
        person: {
          type: "string",
          description: "Tên người booking. Optional.",
        },
        status: {
          type: "string",
          description: "Trạng thái booking. Optional.",
        },
        date_from: {
          type: "string",
          description: "Ngày bắt đầu. Optional.",
        },
        date_to: {
          type: "string",
          description: "Ngày kết thúc. Optional.",
        },
        limit: {
          type: "number",
          description: "Default 20.",
        },
      },
    },
    handler: getBookings,
  },

  listMembers: {
    name: "listMembers",
    description:
      "Liệt kê thành viên lab (chỉ những user chưa bị xóa). Có thể filter theo role hoặc tên/email. Trả về kèm thống kê số lượng theo role.",
    parameters: {
      type: "object",
      properties: {
        role: {
          type: "string",
          enum: ["superadmin", "admin", "member", "viewer", "pending"],
          description:
            "Filter theo role. Để trống để lấy tất cả (kèm thống kê).",
        },
        query: {
          type: "string",
          description: "Tìm kiếm theo tên hiển thị hoặc email.",
        },
        limit: {
          type: "number",
          description: "Default 50.",
        },
      },
    },
    handler: listMembers,
  },

  getCurrentDate: {
    name: "getCurrentDate",
    description:
      "Lấy ngày giờ hiện tại theo múi giờ Việt Nam (UTC+7). Hữu ích khi user hỏi về 'hôm nay', 'tuần này', hay cần ngày để filter dữ liệu.",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async () => getCurrentDate(),
  },
};

/**
 * Get tool definitions in Gemini API format (for streamGenerateContent tools param).
 */
export function getGeminiToolDefinitions() {
  return [
    {
      functionDeclarations: Object.values(TOOLS).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

/**
 * Execute a tool by name with caller context (uid for action tools).
 * Throws if tool not found.
 */
export async function executeTool(
  name: string,
  args: any,
  context: { uid: string } = { uid: "" }
): Promise<{ ok: boolean; result?: any; error?: string }> {
  const tool = TOOLS[name];
  if (!tool) {
    return { ok: false, error: `Tool not found: ${name}` };
  }

  try {
    // Round 115a: action tools need uid for permission/audit
    // Inject _uid into args (read tools ignore it)
    const argsWithCtx = { ...(args || {}), _uid: context.uid };
    const result = await tool.handler(argsWithCtx);
    return { ok: true, result };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export const TOOL_NAMES = Object.keys(TOOLS);

// ════════════════════════════════════════════════════════════
// Round 115a: Action tools (write operations, superadmin only)
// ════════════════════════════════════════════════════════════

import {
  createExperimentDraft,
  updateChemicalStockDraft,
  createBookingDraft,
  recordExperimentResultDraft,
} from "./actions";

// Tool definitions for action tools
const ACTION_TOOLS_DEFS: Record<string, ToolDefinition> = {
  createExperimentDraft: {
    name: "createExperimentDraft",
    description:
      "Tạo DRAFT thí nghiệm mới (KHÔNG ghi DB ngay - tạo bản nháp để user xác nhận). " +
      "Hỗ trợ 2 loại: 'hydro' (thủy nhiệt) và 'electrochem' (đo điện hóa). " +
      "Dùng khi user muốn tạo, ghi sổ, lưu thí nghiệm mới. " +
      "Tool trả về draft với mã code, fields đã parse - frontend show confirm dialog cho user.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["hydro", "electrochem"],
          description: "Loại thí nghiệm: hydro (thủy nhiệt) hoặc electrochem (đo điện hóa)",
        },
        date: {
          type: "string",
          description: "Ngày thí nghiệm dạng YYYY-MM-DD. Default = hôm nay.",
        },
        person: {
          type: "string",
          description: "Tên người thực hiện. Default = current user.",
        },
        note: { type: "string", description: "Ghi chú (optional)" },
        isSample: { type: "boolean", description: "Là mẫu test? Default false." },

        // Hydro fields
        material: { type: "string", description: "Vật liệu (cho hydro)" },
        temp: { type: "number", description: "Nhiệt độ °C (cho hydro)" },
        time: { type: "number", description: "Thời gian giữ (giờ, cho hydro)" },
        rate: { type: "number", description: "Tốc độ gia nhiệt °C/min (hydro) hoặc scan rate (electrochem)" },
        ph: { type: "number", description: "pH (cho hydro)" },
        vol: { type: "number", description: "Thể tích mL (cho hydro)" },

        // Electrochem fields
        electrode: { type: "string", description: "Tên điện cực làm việc (cho electrochem)" },
        ec_type: {
          type: "string",
          description: "Loại đo điện hóa: CV, LSV, CA, CP, EIS, GCD (cho electrochem)",
        },
        reaction: {
          type: "string",
          description: "Phản ứng: HER, OER, ORR, NRR, etc. (cho electrochem)",
        },
        electrolyte: { type: "string", description: "Dung dịch điện ly (cho electrochem)" },
        re: { type: "string", description: "Reference electrode (cho electrochem)" },
        ce: { type: "string", description: "Counter electrode (cho electrochem)" },
        inst: { type: "string", description: "Thiết bị/máy đo (cho electrochem)" },
        estart: { type: "string", description: "E start (V vs RE)" },
        eend: { type: "string", description: "E end (V vs RE)" },
        ir: { type: "string", description: "iR compensation (cho electrochem)" },
      },
      required: ["category"],
    },
    handler: async (args: any) => createExperimentDraft(args._uid, args),
  },

  updateChemicalStockDraft: {
    name: "updateChemicalStockDraft",
    description:
      "Tạo DRAFT cập nhật tồn kho hóa chất (KHÔNG ghi DB ngay - bản nháp). " +
      "Search hóa chất theo tên/CAS/công thức, tính giá trị mới (theo newStock tuyệt đối hoặc delta tương đối). " +
      "Default update field 'stock' (lượng còn lại trong chai). Field 'qty' là số chai/lọ. " +
      "Frontend show confirm dialog với old vs new value cho user xác nhận.",
    parameters: {
      type: "object",
      properties: {
        chemicalQuery: {
          type: "string",
          description: "Tên/CAS/công thức hóa chất cần update. Vd: 'NaCl', 'Thiourea'.",
        },
        newStock: {
          type: "number",
          description: "Giá trị tuyệt đối mới. Vd: 50 (g hoặc unit của chemical).",
        },
        delta: {
          type: "number",
          description: "Thay đổi tương đối. Vd: -100 (giảm 100), +50 (thêm 50).",
        },
        field: {
          type: "string",
          enum: ["stock", "qty"],
          description:
            "Field cần update: 'stock' (lượng trong 1 chai, default) hoặc 'qty' (số chai).",
        },
        reason: { type: "string", description: "Lý do cập nhật (optional)" },
      },
      required: ["chemicalQuery"],
    },
    handler: async (args: any) => updateChemicalStockDraft(args._uid, args),
  },

  createBookingDraft: {
    name: "createBookingDraft",
    description:
      "Tạo DRAFT đặt lịch dùng thiết bị (KHÔNG ghi DB ngay - bản nháp). " +
      "Search thiết bị theo tên, validate time format, trả về draft cho user xác nhận. " +
      "Status mặc định 'pending'.",
    parameters: {
      type: "object",
      properties: {
        equipmentQuery: {
          type: "string",
          description: "Tên thiết bị cần đặt. Vd: 'SEM', 'Máy ly tâm', 'Autolab'.",
        },
        date: {
          type: "string",
          description: "Ngày đặt YYYY-MM-DD. Vd: '2026-05-08'.",
        },
        startTime: {
          type: "string",
          description: "Giờ bắt đầu HH:MM. Vd: '09:00'.",
        },
        endTime: {
          type: "string",
          description: "Giờ kết thúc HH:MM. Vd: '11:00'.",
        },
        purpose: {
          type: "string",
          description: "Mục đích sử dụng (optional)",
        },
      },
      required: ["equipmentQuery", "date", "startTime", "endTime"],
    },
    handler: async (args: any) => createBookingDraft(args._uid, args),
  },

  recordExperimentResultDraft: {
    name: "recordExperimentResultDraft",
    description:
      "Tạo DRAFT cập nhật KẾT QUẢ thí nghiệm (KHÔNG ghi DB ngay). " +
      "Dùng khi user nói thí nghiệm đã xong, có kết quả đo. " +
      "Code prefix HT- (hydro) hoặc EC- (electrochem) — backend tự detect category. " +
      "Update partial fields, không touch các field khác (date, material, etc.).",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Mã thí nghiệm cần update. VD: HT-1778... hoặc EC-1778...",
        },
        status: {
          type: "string",
          enum: ["Hoàn thành", "Thất bại", "Cần làm lại"],
          description: "Trạng thái mới",
        },
        note: {
          type: "string",
          description: "Ghi chú kết quả (optional)",
        },
        yield_mass: {
          type: "number",
          description: "Khối lượng sản phẩm (mg, cho hydro)",
        },
        color: {
          type: "string",
          description: "Màu sản phẩm (cho hydro)",
        },
        eta10: {
          type: "number",
          description: "Overpotential @ 10 mA/cm² (mV, cho electrochem HER/OER)",
        },
        tafel: {
          type: "number",
          description: "Tafel slope (mV/dec, cho electrochem)",
        },
        j0: {
          type: "number",
          description: "Exchange current density j₀ (mA/cm², cho electrochem)",
        },
        rs: {
          type: "number",
          description: "Series resistance Rs (Ω, cho electrochem EIS)",
        },
        rct: {
          type: "number",
          description: "Charge transfer resistance Rct (Ω, cho electrochem EIS)",
        },
        ecsa: {
          type: "number",
          description: "Electrochemical surface area (cm², cho electrochem)",
        },
      },
      required: ["code", "status"],
    },
    handler: async (args: any) => recordExperimentResultDraft(args._uid, args),
  },
};

// Action tool names — for permission check in tool-executor
export const ACTION_TOOL_NAMES = Object.keys(ACTION_TOOLS_DEFS);

// Add action tools to TOOLS registry
Object.assign(TOOLS, ACTION_TOOLS_DEFS);

// Round 115a2: Re-derive TOOL_NAMES after assign
// (TOOL_NAMES exported above was computed BEFORE action tools were merged)
// Workaround: mutate the array in place to include action tool names
TOOL_NAMES.push(...ACTION_TOOL_NAMES.filter((n) => !TOOL_NAMES.includes(n)));

