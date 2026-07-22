import { Status, statusChipClass } from "./format";

/** Stat tile: label · value · optional status delta badge · optional hint. */
export function StatCard({
  label,
  value,
  unit,
  badge,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  badge?: { text: string; status: Status; suffix?: string } | null;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-borderc bg-surface p-4">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold">{value}</span>
        {unit && value !== "—" && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {badge && (
        <span
          className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusChipClass[badge.status]}`}
        >
          <span aria-hidden>{badge.status === "good" ? "▼" : "▲"}</span>
          {badge.text}
          <span className="font-normal opacity-80">{badge.suffix ?? "vs target"}</span>
        </span>
      )}
      {!badge && hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </div>
  );
}
