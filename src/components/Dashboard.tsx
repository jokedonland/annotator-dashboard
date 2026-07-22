"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardData } from "@/lib/view";
import { WriterWindowMetrics, ReviewerWindowMetrics } from "@/lib/metrics";
import { StatCard } from "./StatCard";
import { TrendChart } from "./TrendChart";
import { ErrorBars } from "./ErrorBars";
import { TaskTable } from "./TaskTable";
import { UserSwitcher } from "./UserSwitcher";
import {
  WINDOW_LABELS,
  devianceStatus,
  fmtDayYear,
  fmtHours,
  fmtPct,
  fmtPctSigned,
  majorRateStatus,
  statusChipClass,
} from "./format";

const TABS = ["AHT", "Tasks", "Quality"] as const;

export function Dashboard({
  data,
  viewer,
  directory,
}: {
  data: DashboardData;
  viewer: { email: string; isAdmin: boolean };
  directory: { name: string; email: string; role: string }[] | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("AHT");
  const isReviewer = data.role === "Reviewer";
  const [taskMode, setTaskMode] = useState<"writes" | "reviews">(
    isReviewer && data.reviews.length > 0 ? "reviews" : "writes"
  );

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
      {/* ---- header ---- */}
      <header className="flex flex-wrap items-start justify-between gap-3 py-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{data.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-series-1/10 px-2 py-0.5 font-semibold text-series-1">
              {data.role}
            </span>
            {data.isOnboarding && (
              <span className="rounded-full bg-tint-warning px-2 py-0.5 font-medium text-ink">
                Onboarding
              </span>
            )}
            {data.tags.length > 0 && (
              <span className="text-ink-2">{data.tags.join(" · ")}</span>
            )}
            {data.contractStatus && <span className="text-muted">· {data.contractStatus}</span>}
            {!data.inRoles && <span className="text-muted">· not in roles file</span>}
          </div>
          <div className="mt-1.5 text-xs text-ink-2">
            Targets: <strong>{data.targets.aht} hrs</strong> AHT ·{" "}
            <strong>{data.targets.output}</strong> {data.targets.outputLabel}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-borderc bg-surface px-2.5 py-1 text-xs text-ink-2">
              Data through <strong className="text-ink">{fmtDayYear(data.dataThrough)}</strong>
            </span>
            <button
              onClick={logout}
              className="rounded-lg border border-borderc bg-surface px-3 py-1 text-xs font-medium hover:bg-page"
            >
              Log out
            </button>
          </div>
          {viewer.isAdmin && directory && (
            <UserSwitcher directory={directory} current={data.email} />
          )}
          {viewer.isAdmin && (
            <div className="flex gap-2 text-xs">
              <a className="text-series-1 hover:underline" href="/admin/upload">
                Upload data
              </a>
              <a className="text-series-1 hover:underline" href="/admin/health">
                Data health
              </a>
            </div>
          )}
        </div>
      </header>

      {/* ---- tabs ---- */}
      <div className="mb-5 inline-flex rounded-lg border border-borderc bg-surface p-0.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${
              tab === t ? "bg-series-1 text-white" : "text-ink-2 hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "AHT" && <AhtTab data={data} />}
      {tab === "Tasks" && (
        <TasksTab data={data} mode={taskMode} setMode={setTaskMode} />
      )}
      {tab === "Quality" && <QualityTab data={data} />}
    </div>
  );
}

/* ================= AHT tab ================= */

function AhtTab({ data }: { data: DashboardData }) {
  const isReviewer = data.role === "Reviewer";
  const m = data.metrics;

  const rows = (isReviewer ? m.reviewer : m.writer) as (WriterWindowMetrics | ReviewerWindowMetrics)[];

  const trendPoints = m.weeklyTrend.map((p) => ({
    weekStart: p.weekStart,
    aht: isReviewer ? p.reviewerAht : p.writerAht,
    hours: p.hours,
    count: isReviewer ? p.reviewed : p.approved,
  }));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-borderc bg-surface px-4 py-3 text-sm">
        Your AHT target: <strong>{data.targets.aht} hrs</strong>
        <span className="ml-2 text-xs text-muted">
          hours ÷ {isReviewer ? "tasks reviewed" : "approved tasks"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((w) => {
          const st = devianceStatus(w.aht.devianceFromTarget);
          return (
            <StatCard
              key={`aht-${w.window}`}
              label={`AHT — ${WINDOW_LABELS[w.window]}`}
              value={fmtHours(w.aht.value)}
              unit="hrs"
              badge={
                st ? { text: fmtPctSigned(w.aht.devianceFromTarget), status: st } : null
              }
              hint={w.aht.value === null ? "no data in this period" : undefined}
            />
          );
        })}
        {rows.map((w) => {
          const st = devianceStatus(w.perTouchAht.devianceFromTarget);
          return (
            <StatCard
              key={`pt-${w.window}`}
              label={`Per-touch AHT — ${WINDOW_LABELS[w.window]}`}
              value={fmtHours(w.perTouchAht.value)}
              unit="hrs"
              badge={
                st ? { text: fmtPctSigned(w.perTouchAht.devianceFromTarget), status: st } : null
              }
              hint={w.perTouchAht.value === null ? "no data in this period" : undefined}
            />
          );
        })}
      </div>

      <div className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">
          Weekly AHT ({isReviewer ? "hours ÷ tasks reviewed" : "hours ÷ approved tasks"})
        </h2>
        <TrendChart
          points={trendPoints}
          target={data.targets.aht}
          countLabel={isReviewer ? "reviewed" : "approved"}
        />
      </div>
    </div>
  );
}

/* ================= Tasks tab ================= */

function TasksTab({
  data,
  mode,
  setMode,
}: {
  data: DashboardData;
  mode: "writes" | "reviews";
  setMode: (m: "writes" | "reviews") => void;
}) {
  const isReviewer = data.role === "Reviewer";
  const m = data.metrics;
  const dualRole = data.writes.length > 0 && data.reviews.length > 0;

  const progress = isReviewer ? m.currentWeek.touchesThisWeek : m.currentWeek.approvedThisWeek;
  const pctDone = Math.min(1, progress / data.targets.output);

  return (
    <div className="space-y-5">
      {/* output-target banner with current-week progress */}
      <div className="rounded-xl border border-borderc bg-surface px-4 py-3">
        <div className="flex items-baseline justify-between text-sm">
          <span>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>
              {progress} of {data.targets.output}
            </strong>{" "}
            {isReviewer ? "touches" : "approved"} this week
          </span>
          <span className="text-xs text-muted">
            Mon–Sun (PT), week of {fmtDayYear(m.currentWeek.weekStart)}
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-series-1-track">
          <div
            className="h-2 rounded-full bg-series-1"
            style={{ width: `${pctDone * 100}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={data.targets.output}
          />
        </div>
      </div>

      {dualRole && (
        <div className="inline-flex rounded-lg border border-borderc bg-surface p-0.5" role="tablist">
          {(["writes", "reviews"] as const).map((mo) => (
            <button
              key={mo}
              role="tab"
              aria-selected={mode === mo}
              onClick={() => setMode(mo)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                mode === mo ? "bg-series-1 text-white" : "text-ink-2 hover:text-ink"
              }`}
            >
              {mo} ({mo === "writes" ? data.writes.length : data.reviews.length})
            </button>
          ))}
        </div>
      )}

      {/* count cards respect the toggle */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {mode === "writes"
          ? m.writer.map((w) => (
              <StatCard
                key={w.window}
                label={WINDOW_LABELS[w.window]}
                value={`${w.tasksWritten}`}
                unit={`written · ${w.approvedCount} approved`}
                hint={w.tasksWritten === 0 ? "no data in this period" : undefined}
              />
            ))
          : m.reviewer.map((w) => (
              <StatCard
                key={w.window}
                label={WINDOW_LABELS[w.window]}
                value={`${w.tasksReviewed}`}
                unit={`reviewed · ${w.totalTouches} touches`}
                hint={w.tasksReviewed === 0 ? "no data in this period" : undefined}
              />
            ))}
      </div>

      <TaskTable
        rows={mode === "writes" ? data.writes : data.reviews}
        mode={mode}
        hasQaActivity={data.hasQaActivity}
      />
    </div>
  );
}

/* ================= Quality tab ================= */

function QualityTab({ data }: { data: DashboardData }) {
  const m = data.metrics;
  const allTime = m.quality.find((q) => q.window === "allTime")!;
  const top = allTime.byType.find((t) => t.major + t.minor > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {m.quality.map((q) => {
          const st = majorRateStatus(q.majorErrorRate);
          return (
            <StatCard
              key={q.window}
              label={`Major error rate — ${WINDOW_LABELS[q.window]}`}
              value={fmtPct(q.majorErrorRate)}
              badge={
                st
                  ? {
                      text: `${q.tasksWithMajor}/${q.denominator} tasks`,
                      status: st,
                      suffix: "with a major flag",
                    }
                  : null
              }
              hint={q.majorErrorRate === null ? "no reviewed tasks in this period" : undefined}
            />
          );
        })}
      </div>
      <p className="-mt-3 text-xs text-muted">
        Color thresholds are provisional: ≤10% green · ≤25% amber · &gt;25% red.
      </p>

      {top && (
        <div className="rounded-xl border border-borderc bg-surface px-4 py-3 text-sm">
          Your top recurring flag is <strong>{top.type}</strong> —{" "}
          {top.major + top.minor} task{top.major + top.minor === 1 ? "" : "s"} all-time
          {top.major > 0 && (
            <span className="text-ink-2">
              {" "}
              ({top.major} major). Worth a look before your next batch.
            </span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-borderc bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Error types on your written work</h2>
        <ErrorBars quality={m.quality} />
      </div>
    </div>
  );
}
