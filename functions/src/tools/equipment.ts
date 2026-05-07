/**
 * Tool: searchEquipment
 *
 * Tra cứu thiết bị trong lab.
 */
import { db, fuzzyMatch } from "./utils";

export interface EquipmentRecord {
  id: string;
  name: string;
  model?: string;
  vendor?: string;
  serial?: string;
  qty: number;
  status: string; // 'Đang sử dụng' | 'Ngưng sử dụng'
  group?: string;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchEquipmentArgs {
  query?: string;
  status?: string;
  location?: string;
  limit?: number;
}

export interface SearchEquipmentResult {
  total: number;
  returned: number;
  equipment: EquipmentRecord[];
  message?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function searchEquipment(
  args: SearchEquipmentArgs
): Promise<SearchEquipmentResult> {
  const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

  const snap = await db().ref("equipment").once("value");
  const data = snap.val() || {};

  let results: EquipmentRecord[] = [];

  for (const [id, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as any;

    const record: EquipmentRecord = {
      id,
      name: r.name || "",
      model: r.model || "",
      vendor: r.vendor || "",
      serial: r.serial || "",
      qty: Number(r.qty) || 0,
      status: r.status || "Không rõ",
      group: r.group || "",
      location: r.location || "",
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };

    // Filter by query (name/model/vendor)
    if (args.query) {
      const matched =
        fuzzyMatch(record.name, args.query) ||
        fuzzyMatch(record.model || "", args.query) ||
        fuzzyMatch(record.vendor || "", args.query);
      if (!matched) continue;
    }

    // Filter by status (exact contains, accept "Đang sử dụng" / "đang" / "ngừng")
    if (args.status && !fuzzyMatch(record.status, args.status)) {
      continue;
    }

    // Filter by location
    if (args.location && !fuzzyMatch(record.location || "", args.location)) {
      continue;
    }

    results.push(record);
  }

  const total = results.length;

  // Sort by name
  results.sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));

  const returned = results.slice(0, limit);

  let message: string | undefined;
  if (total === 0) {
    message = "Không tìm thấy thiết bị nào khớp với điều kiện.";
  } else if (total > limit) {
    message = `Có ${total} kết quả, chỉ hiển thị ${limit} đầu tiên.`;
  }

  return { total, returned: returned.length, equipment: returned, message };
}
