"use client";

import { useState } from "react";
import { QualityWindowMetrics } from "@/lib/metrics";
import { WINDOW_LABELS } from "./format";

/** Horizontal stacked bars, one row per error type: major (critical) + minor
 *  (warning) segments, 2px surface gaps, totals at the bar tip, legend, and a
 *  window selector row above. Per-segment hover tooltips via title + lift. */
export function ErrorBars({ quality }: { quality: QualityWindowMetrics[] }) {
  const [win, setWin] = useState<string>("allTime");
  const q = quality.find((x) => x.window === win) ?? quality[0];
  const rows = q.byType.filter((t) => t.major + t.minor > 0);
  const max = Math.max(1, ...rows.map((r) => r.major + r.minor));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {/* window selector */}
        <div className="inline-flex rounded-lg border border-borderc p-0.5" role="tablist">
          {quality.map((x) => (
            <button
              key={x.window}
              role="tab"
              aria-selected={win === x.window}
              onClick={() => setWin(x.window)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                win === x.window ? "bg-series-1 text-white" : "text-ink-2 hover:bg-page"
              }`}
            >
              {WINDOW_LABELS[x.window]}
            </button>
          ))}
        </div>
        {/* legend (2 series) */}
        <div className="flex items-center gap-3 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-critical" aria-hidden /> Major
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-warning" aria-hidden /> Minor
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-muted">
          No errors recorded in this period 🎉
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const total = r.major + r.minor;
            return (
              <div key={r.type} className="flex items-center gap-2">
                <div className="w-36 shrink-0 truncate text-right text-xs text-ink-2">{r.type}</div>
                <div className="flex h-5 flex-1 items-center">
                  {r.major > 0 && (
                    <div
                      className="h-5 rounded-l-[4px] bg-critical transition-opacity hover:opacity-80"
                      style={{
                        width: `${(r.major / max) * 100}%`,
                        minWidth: 6,
                        marginRight: r.minor > 0 ? 2 : 0,
                        borderTopRightRadius: r.minor === 0 ? 4 : 0,
                        borderBottomRightRadius: r.minor === 0 ? 4 : 0,
                      }}
                      title={`${r.type}: ${r.major} task${r.major === 1 ? "" : "s"} with a major flag`}
                    />
                  )}
                  {r.minor > 0 && (
                    <div
                      className={`h-5 bg-warning transition-opacity hover:opacity-80 ${r.major === 0 ? "rounded-l-[4px]" : ""} rounded-r-[4px]`}
                      style={{ width: `${(r.minor / max) * 100}%`, minWidth: 6 }}
                      title={`${r.type}: ${r.minor} task${r.minor === 1 ? "" : "s"} with a minor flag`}
                    />
                  )}
                  <span
                    className="ml-2 text-xs font-semibold"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {total}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Counts are tasks flagged with each type in {WINDOW_LABELS[win].toLowerCase()} (
        {q.denominator} reviewed task{q.denominator === 1 ? "" : "s"}).
      </p>
    </div>
  );
}
