/**
 * Tool: getBookings
 *
 * Truy vấn lịch booking thiết bị. Hiện tại bookings collection = null
 * (chưa có data) → return empty gracefully.
 */
import { db, fuzzyMatch, normalizeDate } from "./utils";

export interface BookingRecord {
  id: string;
  equipment?: string;
  user?: string;
  person?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  note?: string;
  [key: string]: any;
}

export interface GetBookingsArgs {
  equipment_name?: string;
  person?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  limit?: number;
}

export interface GetBookingsResult {
  total: number;
  returned: number;
  bookings: BookingRecord[];
  message?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function getBookings(
  args: GetBookingsArgs
): Promise<GetBookingsResult> {
  const limit = Math.min(args.limit || DEFAULT_LIMIT, MAX_LIMIT);

  const snap = await db().ref("bookings").once("value");
  const data = snap.val();

  if (!data || typeof data !== "object") {
    return {
      total: 0,
      returned: 0,
      bookings: [],
      message: "Hệ thống booking chưa có dữ liệu nào.",
    };
  }

  const dateFrom = args.date_from ? normalizeDate(args.date_from) : null;
  const dateTo = args.date_to ? normalizeDate(args.date_to) : null;

  let results: BookingRecord[] = [];

  for (const [id, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as any;

    const record: BookingRecord = {
      id,
      equipment: r.equipment || r.equipmentName || "",
      person: r.person || r.user || r.userName || "",
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status,
      note: r.note,
      ...r,
    };

    if (
      args.equipment_name &&
      !fuzzyMatch(record.equipment || "", args.equipment_name)
    ) {
      continue;
    }
    if (args.person && !fuzzyMatch(record.person || "", args.person)) {
      continue;
    }
    if (args.status && !fuzzyMatch(record.status || "", args.status)) {
      continue;
    }
    if (dateFrom || dateTo) {
      const d = normalizeDate(record.date);
      if (!d) continue;
      if (dateFrom && d < dateFrom) continue;
      if (dateTo && d > dateTo) continue;
    }

    results.push(record);
  }

  const total = results.length;

  results.sort((a, b) => {
    const da = normalizeDate(a.date)?.getTime() || 0;
    const db_ = normalizeDate(b.date)?.getTime() || 0;
    return db_ - da;
  });

  const returned = results.slice(0, limit);

  return {
    total,
    returned: returned.length,
    bookings: returned,
    message:
      total === 0 ? "Không tìm thấy booking khớp." : undefined,
  };
}
