/**
 * Tool: searchExperiments
 *
 * Tra cứu thí nghiệm qua 4 categories:
 * - hydro: tổng hợp thủy nhiệt
 * - electrode: chế tạo điện cực
 * - electrochem: đo điện hóa
 * - ink: công thức mực
 */
import { db, fuzzyMatch, normalizeDate } from "./utils";

export interface ExperimentRecord {
  id: string;
  category: string;
  code: string;
  date?: string;
  status?: string;
  person?: string;
  // Category-specific (passed through as-is)
  [key: string]: any;
}

export interface SearchExperimentsArgs {
  category?: "hydro" | "electrode" | "electrochem" | "ink" | "all";
  query?: string;
  person?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export interface SearchExperimentsResult {
  total: number;
  returned: number;
  experiments: ExperimentRecord[];
  message?: string;
  by_category?: Record<string, number>;
}

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;
const CATEGORIES = ["hydro", "electrode", "electrochem", "ink"];

export async function searchExperiments(
  args: SearchExperimentsArgs
): Promise<SearchExperimentsResult> {
  const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

  const targetCategories =
    args.category && args.category !== "all"
      ? [args.category]
      : CATEGORIES;

  let allResults: ExperimentRecord[] = [];
  const byCategory: Record<string, number> = {};

  const dateFrom = args.date_from ? normalizeDate(args.date_from) : null;
  const dateTo = args.date_to ? normalizeDate(args.date_to) : null;

  for (const cat of targetCategories) {
    const snap = await db().ref(cat).once("value");
    const data = snap.val() || {};
    let catCount = 0;

    for (const [id, raw] of Object.entries(data)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as any;

      // Skip samples (template/example records)
      if (r.isSample) continue;

      const record: ExperimentRecord = {
        id,
        category: cat,
        code: r.code || id,
        date: r.date,
        status: r.status,
        person: r.person,
      };

      // Copy other fields (skip noisy ones)
      const skipFields = new Set([
        "createdBy",
        "createdAt",
        "updatedAt",
        "uid",
        "isSample",
      ]);
      for (const [k, v] of Object.entries(r)) {
        if (!skipFields.has(k) && !(k in record)) {
          record[k] = v;
        }
      }

      // Filter by query (code/material/person)
      if (args.query) {
        const matched =
          fuzzyMatch(record.code, args.query) ||
          fuzzyMatch(r.material || "", args.query) ||
          fuzzyMatch(r.name || "", args.query) ||
          fuzzyMatch(record.person || "", args.query);
        if (!matched) continue;
      }

      // Filter by person
      if (args.person && !fuzzyMatch(record.person || "", args.person)) {
        continue;
      }

      // Filter by status
      if (args.status && !fuzzyMatch(record.status || "", args.status)) {
        continue;
      }

      // Filter by date range
      if (dateFrom || dateTo) {
        const recordDate = normalizeDate(record.date || r.createdAt);
        if (!recordDate) continue;
        if (dateFrom && recordDate < dateFrom) continue;
        if (dateTo && recordDate > dateTo) continue;
      }

      allResults.push(record);
      catCount++;
    }

    if (catCount > 0) byCategory[cat] = catCount;
  }

  const total = allResults.length;

  // Sort by date desc (most recent first)
  allResults.sort((a, b) => {
    const da = normalizeDate(a.date)?.getTime() || 0;
    const db_ = normalizeDate(b.date)?.getTime() || 0;
    return db_ - da;
  });

  const returned = allResults.slice(0, limit);

  let message: string | undefined;
  if (total === 0) {
    message = "Không tìm thấy thí nghiệm nào khớp với điều kiện.";
  } else if (total > limit) {
    message = `Có ${total} thí nghiệm, hiển thị ${limit} mới nhất.`;
  }

  return {
    total,
    returned: returned.length,
    experiments: returned,
    by_category: byCategory,
    message,
  };
}
