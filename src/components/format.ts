export type Status = "good" | "warning" | "critical";

export const WINDOW_LABELS: Record<string, string> = {
  allTime: "All-time",
  last2w: "Last 2 weeks",
  last3d: "Last 3 days",
};

export function fmtHours(v: number | null, digits = 2): string {
  return v === null ? "—" : v.toFixed(digits);
}

export function fmtPctSigned(v: number | null): string {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)}%`;
}

export function fmtPct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

/** Deviance color rule from the spec: green ≤ 0, amber ≤ +15%, red beyond. */
export function devianceStatus(v: number | null): Status | null {
  if (v === null) return null;
  if (v <= 0) return "good";
  if (v <= 0.15) return "warning";
  return "critical";
}

/** Provisional major-error-rate thresholds (marked as such in the UI). */
export function majorRateStatus(v: number | null): Status | null {
  if (v === null) return null;
  if (v <= 0.1) return "good";
  if (v <= 0.25) return "warning";
  return "critical";
}

export const statusChipClass: Record<Status, string> = {
  good: "bg-tint-good text-success-text",
  warning: "bg-tint-warning text-ink",
  critical: "bg-tint-critical text-critical",
};

export function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtDayYear(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
