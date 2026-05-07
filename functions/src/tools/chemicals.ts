/**
 * Tool: searchChemicals
 *
 * Tra cứu hóa chất trong kho lab. Hỗ trợ:
 * - Search theo tên/CAS/công thức
 * - Filter theo nhóm, low-stock
 * - Strip image field (base64 lớn)
 */
import { db, fuzzyMatch, stripLargeFields } from "./utils";

export interface ChemicalRecord {
  id: string;
  name: string;
  cas: string;
  formula: string;
  stock: number;
  alert: number;
  unit: string;
  qty: number;
  mw?: number;
  purity?: string;
  group?: string;
  location?: string;
  vendor?: string;
  isLowStock?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchChemicalsArgs {
  query?: string;
  group?: string;
  low_stock_only?: boolean;
  limit?: number;
}

export interface SearchChemicalsResult {
  total: number;
  returned: number;
  chemicals: ChemicalRecord[];
  message?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function searchChemicals(
  args: SearchChemicalsArgs
): Promise<SearchChemicalsResult> {
  const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

  const snap = await db().ref("chemicals").once("value");
  const data = snap.val() || {};

  let results: ChemicalRecord[] = [];

  for (const [id, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== "object") continue;

    const r = raw as any;
    const stock = Number(r.stock) || 0;
    const alert = Number(r.alert) || 0;

    const record: ChemicalRecord = {
      id,
      name: r.name || "",
      cas: r.cas || "",
      formula: r.formula || "",
      stock,
      alert,
      unit: r.unit || "",
      qty: Number(r.qty) || 0,
      mw: r.mw,
      purity: r.purity,
      group: r.group || "",
      location: r.location || "",
      vendor: r.vendor || "",
      isLowStock: alert > 0 && stock <= alert,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };

    // Filter by query (name/cas/formula)
    if (args.query) {
      const matched =
        fuzzyMatch(record.name, args.query) ||
        fuzzyMatch(record.cas, args.query) ||
        fuzzyMatch(record.formula, args.query);
      if (!matched) continue;
    }

    // Filter by group
    if (args.group && !fuzzyMatch(record.group || "", args.group)) {
      continue;
    }

    // Filter low-stock only
    if (args.low_stock_only && !record.isLowStock) {
      continue;
    }

    results.push(stripLargeFields(record));
  }

  const total = results.length;

  // Sort: low-stock first, then by name
  results.sort((a, b) => {
    if (a.isLowStock && !b.isLowStock) return -1;
    if (!a.isLowStock && b.isLowStock) return 1;
    return (a.name || "").localeCompare(b.name || "", "vi");
  });

  const returned = results.slice(0, limit);

  let message: string | undefined;
  if (total === 0) {
    message = "Không tìm thấy hóa chất nào khớp với điều kiện.";
  } else if (total > limit) {
    message = `Có ${total} kết quả, chỉ hiển thị ${limit} đầu tiên (sắp xếp: low-stock trước, alphabetical).`;
  }

  return { total, returned: returned.length, chemicals: returned, message };
}
