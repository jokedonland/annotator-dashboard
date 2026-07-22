"use client";

import { useMemo, useState } from "react";
import { TaskRowView } from "@/lib/view";
import { fmtDay } from "./format";

const PAGE_SIZE = 25;

type SortKey = "date" | "attempts" | "approved";

function YesNo({ v, dash }: { v: boolean; dash?: boolean }) {
  if (dash) return <span className="text-muted">—</span>;
  return v ? (
    <span className="font-medium text-success-text">y</span>
  ) : (
    <span className="text-ink-2">n</span>
  );
}

export function TaskTable({
  rows,
  mode,
  hasQaActivity,
}: {
  rows: TaskRowView[];
  mode: "writes" | "reviews";
  hasQaActivity: boolean;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [copied, setCopied] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "date") cmp = (a.dateRaw || "").localeCompare(b.dateRaw || "");
      else if (sort.key === "attempts") cmp = a.attempts - b.attempts;
      else cmp = Number(a.approved) - Number(b.approved);
      return cmp * sort.dir;
    });
    return arr;
  }, [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const view = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setPage(0);
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
  }

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }

  const arrow = (key: SortKey) =>
    sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : "";

  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-borderc bg-surface text-sm text-muted">
        No {mode === "writes" ? "written tasks" : "reviews"} yet
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-borderc bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-grid text-left text-xs text-ink-2">
              <th className="px-3 py-2.5 font-medium">Task ID</th>
              <th className="px-3 py-2.5 font-medium">
                <button onClick={() => toggleSort("date")} className="hover:text-ink">
                  {mode === "writes" ? "Written" : "Reviewed"}
                  {arrow("date")}
                </button>
              </th>
              {mode === "reviews" && <th className="px-3 py-2.5 font-medium">Writer</th>}
              <th className="px-3 py-2.5 font-medium">Reviewed?</th>
              <th className="px-3 py-2.5 font-medium">Errors</th>
              <th className="px-3 py-2.5 font-medium">
                <button onClick={() => toggleSort("approved")} className="hover:text-ink">
                  Approved?{arrow("approved")}
                </button>
              </th>
              <th className="px-3 py-2.5 font-medium" title={hasQaActivity ? undefined : "No QA reviews yet"}>
                QA rev?
              </th>
              <th className="px-3 py-2.5 font-medium" title={hasQaActivity ? undefined : "No QA reviews yet"}>
                QA appr?
              </th>
              <th className="px-3 py-2.5 text-right font-medium">
                <button onClick={() => toggleSort("attempts")} className="hover:text-ink">
                  Attempts{arrow("attempts")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.taskId} className="border-b border-grid last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  <span className="inline-flex items-center gap-1">
                    {r.taskId.slice(0, 13)}…
                    <button
                      onClick={() => copy(r.taskId)}
                      title="Copy full task id"
                      aria-label={`Copy task id ${r.taskId}`}
                      className="rounded px-1 text-muted hover:bg-page hover:text-ink"
                    >
                      {copied === r.taskId ? "✓" : "⧉"}
                    </button>
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtDay(r.date)}
                </td>
                {mode === "reviews" && (
                  <td className="max-w-40 truncate px-3 py-2 text-ink-2">{r.writerName}</td>
                )}
                <td className="px-3 py-2">
                  <YesNo v={r.reviewed} />
                </td>
                <td className="px-3 py-2">
                  {r.errors.length === 0 ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.errors.map((e) => (
                        <span
                          key={`${e.type}-${e.severity}`}
                          title={`${e.severity} — ${e.type}${e.count > 1 ? ` ×${e.count}` : ""}`}
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                            e.severity === "major"
                              ? "bg-tint-critical text-critical"
                              : "bg-tint-warning text-ink"
                          }`}
                        >
                          {e.type}
                          {e.count > 1 && ` ×${e.count}`}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <YesNo v={r.approved} />
                </td>
                <td className="px-3 py-2">
                  <YesNo v={r.qaReviewed} dash={!hasQaActivity} />
                </td>
                <td className="px-3 py-2">
                  <YesNo v={r.qaApproved} dash={!hasQaActivity} />
                </td>
                <td className="px-3 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {r.attempts}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-grid px-3 py-2 text-xs text-ink-2">
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {page * PAGE_SIZE + 1}–{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} of{" "}
            {sorted.length}
          </span>
          <span className="flex gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-borderc px-2 py-1 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-borderc px-2 py-1 disabled:opacity-40"
            >
              Next →
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
