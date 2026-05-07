/**
 * Tool utilities — date normalize, fuzzy match, common helpers.
 *
 * Used by all Round 112+ tools.
 */
import * as admin from "firebase-admin";

/**
 * Normalize date input → ISO 8601 string.
 * Accepts: "DD/MM/YYYY", "YYYY-MM-DD", ISO timestamp, Date object.
 */
export function normalizeDate(
  input: string | number | Date | null | undefined
): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;

  if (typeof input === "number") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(input).trim();

  // DD/MM/YYYY format
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO or YYYY-MM-DD
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format date for human display (DD/MM/YYYY).
 */
export function formatDateVN(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Vietnamese-aware fuzzy match.
 * Removes diacritics, lowercases, and checks substring match.
 */
export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .trim();

  return normalize(haystack).includes(normalize(needle));
}

/**
 * Get current date in Vietnam timezone with weekday.
 */
export function getCurrentDate(): {
  iso: string;
  date: string;
  weekday: string;
  time: string;
  timezone: string;
} {
  const now = new Date();
  const vnOffset = 7 * 60; // UTC+7 in minutes
  const localOffset = now.getTimezoneOffset();
  const vnTime = new Date(now.getTime() + (vnOffset + localOffset) * 60 * 1000);

  const weekdays = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];

  const dd = String(vnTime.getUTCDate()).padStart(2, "0");
  const mm = String(vnTime.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = vnTime.getUTCFullYear();
  const hh = String(vnTime.getUTCHours()).padStart(2, "0");
  const min = String(vnTime.getUTCMinutes()).padStart(2, "0");

  return {
    iso: now.toISOString(),
    date: `${dd}/${mm}/${yyyy}`,
    weekday: weekdays[vnTime.getUTCDay()],
    time: `${hh}:${min}`,
    timezone: "Asia/Ho_Chi_Minh (UTC+7)",
  };
}

/**
 * Strip large fields (image base64) before sending to LLM.
 */
export function stripLargeFields<T extends Record<string, any>>(
  obj: T,
  fieldsToStrip: string[] = ["image", "thumbnail", "photo"]
): T {
  const cleaned = { ...obj };
  for (const field of fieldsToStrip) {
    if (field in cleaned) delete (cleaned as any)[field];
  }
  return cleaned;
}

/**
 * Helper: get database reference
 */
export function db() {
  return admin.database();
}
