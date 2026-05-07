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
 * Execute a tool by name. Throws if tool not found.
 */
export async function executeTool(
  name: string,
  args: any
): Promise<{ ok: boolean; result?: any; error?: string }> {
  const tool = TOOLS[name];
  if (!tool) {
    return { ok: false, error: `Tool not found: ${name}` };
  }

  try {
    const result = await tool.handler(args || {});
    return { ok: true, result };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export const TOOL_NAMES = Object.keys(TOOLS);
