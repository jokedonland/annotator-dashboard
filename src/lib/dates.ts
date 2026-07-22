import { formatInTimeZone } from "date-fns-tz";

export const TZ = "America/Los_Angeles";

/**
 * Parse a dump timestamp like "2026-07-02 18:06:01.037+00" and return the
 * LA calendar date "YYYY-MM-DD", or null for blank/invalid values.
 */
export function toLaDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Normalize "2026-07-02 18:06:01.037+00" → ISO 8601.
  let iso = trimmed.replace(" ", "T");
  if (/[+-]\d{2}$/.test(iso)) iso += ":00";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}

/** Parse "M/D/YYYY" (already a calendar date) → "YYYY-MM-DD". */
export function parseSlashDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, day, yr] = m;
  return `${yr}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Add n days (may be negative) to a "YYYY-MM-DD" string. Pure calendar math, DST-safe. */
export function addDays(date: string, n: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Inclusive [start, end] membership for "YYYY-MM-DD" strings. */
export function inRange(date: string | null, start: string | null, end: string): boolean {
  if (!date) return false;
  if (start && date < start) return false;
  return date <= end;
}

/** Monday of the ISO week containing the given date. */
export function mondayOf(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const dow = dt.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(date, -back);
}

export interface Window {
  key: "allTime" | "last2w" | "last3d";
  label: string;
  start: string | null; // null = unbounded (all-time)
  end: string;
}

/** The three rolling windows, anchored to dataThrough (inclusive). */
export function windows(dataThrough: string): Window[] {
  return [
    { key: "allTime", label: "All-time", start: null, end: dataThrough },
    { key: "last2w", label: "Last 2 weeks", start: addDays(dataThrough, -13), end: dataThrough },
    { key: "last3d", label: "Last 3 days", start: addDays(dataThrough, -2), end: dataThrough },
  ];
}
