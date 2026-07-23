import { Dataset, Task, TARGETS, KNOWN_ERROR_TYPES } from "./types";
import { Window, windows, mondayOf, addDays, inRange } from "./dates";
import { hoursInWindow } from "./hours";

export interface RatioMetric {
  numeratorHours: number;
  denominator: number;
  value: number | null; // null when denominator is 0 → render "—"
  devianceFromTarget: number | null; // signed fraction, e.g. +0.12
}

function ratio(hours: number, denom: number, target: number): RatioMetric {
  const value = denom > 0 ? hours / denom : null;
  return {
    numeratorHours: hours,
    denominator: denom,
    value,
    devianceFromTarget: value === null ? null : (value - target) / target,
  };
}

export interface WriterWindowMetrics {
  window: Window["key"];
  hours: number;
  approvedCount: number; // by approvalDate, OR/dedup rule
  tasksWritten: number; // by date_written
  totalAttempts: number; // Σ num_writer_attempts over tasks written in window
  aht: RatioMetric; // hours ÷ approved
  perTouchAht: RatioMetric; // hours ÷ total attempts
}

export interface ReviewerWindowMetrics {
  window: Window["key"];
  hours: number;
  tasksReviewed: number; // others' tasks only, by date_reviewed
  tasksApprovedByThem: number;
  reviewTouches: number; // Σ num_writer_attempts on others' reviewed tasks
  ownWriteAttempts: number; // Σ own num_writer_attempts on tasks written in window
  totalTouches: number;
  aht: RatioMetric; // hours ÷ all tasks reviewed (confirmed)
  perTouchAht: RatioMetric; // hours ÷ total touches
}

export interface QualityWindowMetrics {
  window: Window["key"];
  denominator: number; // written tasks with date_reviewed in window (self rows INCLUDED)
  tasksWithMajor: number;
  majorErrorRate: number | null;
  byType: { type: string; major: number; minor: number }[]; // task counts, sorted total desc
}

export interface UserMetrics {
  email: string;
  dataThrough: string;
  hasQaActivity: boolean;
  writer: WriterWindowMetrics[];
  reviewer: ReviewerWindowMetrics[];
  quality: QualityWindowMetrics[];
  weeklyTrend: WeeklyPoint[];
  currentWeek: CurrentWeekProgress;
}

export interface WeeklyPoint {
  weekStart: string; // Monday, LA
  hours: number;
  approved: number; // writer denominator
  reviewed: number; // reviewer denominator (others' tasks)
  writerAht: number | null;
  reviewerAht: number | null;
}

export interface CurrentWeekProgress {
  weekStart: string; // Monday of the week containing dataThrough
  weekEnd: string;
  approvedThisWeek: number; // writers: X of 10
  touchesThisWeek: number; // reviewers: X of 32
}

/** Does any task in the dataset show QA activity? */
export function hasQaActivity(tasks: Task[]): boolean {
  return tasks.some((t) => t.qaApproved || t.dateQaReviewed !== null || t.qaEmail !== null);
}

function windowHours(ds: Dataset, email: string, w: Window): number {
  // Every window — all-time included — sums the reconstructed dailies, so
  // "all-time" means "over the data currently loaded" and stays consistent
  // with the task dump's coverage even when dumps carry partial history.
  // (The latest cumulative total_hours_all_time reaches back before the task
  // data starts, which made all-time AHT meaningless on truncated dumps.)
  return hoursInWindow(ds.dailyHours, email, w.start, w.end);
}

export function writerMetrics(ds: Dataset, email: string, w: Window): WriterWindowMetrics {
  const own = ds.tasks.filter((t) => t.writerEmail === email);
  const approvedCount = own.filter(
    (t) => t.isApproved && inRange(t.approvalDate, w.start, w.end)
  ).length;
  const writtenInWindow = own.filter((t) => inRange(t.dateWritten, w.start, w.end));
  const totalAttempts = writtenInWindow.reduce((s, t) => s + t.numWriterAttempts, 0);
  const hours = windowHours(ds, email, w);
  return {
    window: w.key,
    hours,
    approvedCount,
    tasksWritten: writtenInWindow.length,
    totalAttempts,
    aht: ratio(hours, approvedCount, TARGETS.Writer.aht),
    perTouchAht: ratio(hours, totalAttempts, TARGETS.Writer.aht),
  };
}

export function reviewerMetrics(ds: Dataset, email: string, w: Window): ReviewerWindowMetrics {
  // Real reviews only: reviewer is the user AND it isn't a self/super-writer row.
  const reviewed = ds.tasks.filter(
    (t) =>
      t.reviewerEmail === email &&
      t.writerEmail !== email &&
      inRange(t.dateReviewed, w.start, w.end)
  );
  const reviewTouches = reviewed.reduce((s, t) => s + t.numWriterAttempts, 0);
  const ownWriteAttempts = ds.tasks
    .filter((t) => t.writerEmail === email && inRange(t.dateWritten, w.start, w.end))
    .reduce((s, t) => s + t.numWriterAttempts, 0);
  const totalTouches = reviewTouches + ownWriteAttempts;
  const hours = windowHours(ds, email, w);
  return {
    window: w.key,
    hours,
    tasksReviewed: reviewed.length,
    tasksApprovedByThem: reviewed.filter((t) => t.approved).length,
    reviewTouches,
    ownWriteAttempts,
    totalTouches,
    aht: ratio(hours, reviewed.length, TARGETS.Reviewer.aht),
    perTouchAht: ratio(hours, totalTouches, TARGETS.Reviewer.aht),
  };
}

export function qualityMetrics(ds: Dataset, email: string, w: Window): QualityWindowMetrics {
  // The user's OWN written work that got reviewed in the window — self rows
  // included, the errors on them are real.
  const denomTasks = ds.tasks.filter(
    (t) => t.writerEmail === email && inRange(t.dateReviewed, w.start, w.end)
  );
  const tasksWithMajor = denomTasks.filter((t) =>
    t.errors.some((e) => e.severity === "major")
  ).length;

  const counts = new Map<string, { major: number; minor: number }>();
  for (const type of KNOWN_ERROR_TYPES) counts.set(type, { major: 0, minor: 0 });
  for (const t of denomTasks) {
    // Count tasks (not error instances) per type/severity.
    const seen = new Set<string>();
    for (const e of t.errors) {
      const key = `${e.type}|${e.severity}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = counts.get(e.type) ?? { major: 0, minor: 0 };
      c[e.severity]++;
      counts.set(e.type, c);
    }
  }

  return {
    window: w.key,
    denominator: denomTasks.length,
    tasksWithMajor,
    majorErrorRate: denomTasks.length > 0 ? tasksWithMajor / denomTasks.length : null,
    byType: [...counts.entries()]
      .map(([type, c]) => ({ type, ...c }))
      .sort((a, b) => b.major + b.minor - (a.major + a.minor)),
  };
}

export function weeklyTrend(ds: Dataset, email: string): WeeklyPoint[] {
  const byWeek = new Map<string, WeeklyPoint>();
  const get = (weekStart: string): WeeklyPoint => {
    let p = byWeek.get(weekStart);
    if (!p) {
      p = { weekStart, hours: 0, approved: 0, reviewed: 0, writerAht: null, reviewerAht: null };
      byWeek.set(weekStart, p);
    }
    return p;
  };

  for (const d of ds.dailyHours) {
    if (d.email !== email) continue;
    get(mondayOf(d.date)).hours += d.hours;
  }
  for (const t of ds.tasks) {
    if (t.writerEmail === email && t.isApproved && t.approvalDate) {
      get(mondayOf(t.approvalDate)).approved++;
    }
    if (t.reviewerEmail === email && t.writerEmail !== email && t.dateReviewed) {
      get(mondayOf(t.dateReviewed)).reviewed++;
    }
  }

  const points = [...byWeek.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  for (const p of points) {
    p.writerAht = p.approved > 0 ? p.hours / p.approved : null;
    p.reviewerAht = p.reviewed > 0 ? p.hours / p.reviewed : null;
  }
  return points;
}

export function currentWeekProgress(ds: Dataset, email: string): CurrentWeekProgress {
  const weekStart = mondayOf(ds.dataThrough);
  const weekEnd = addDays(weekStart, 6);
  const w: Window = { key: "last3d", label: "current week", start: weekStart, end: weekEnd };
  const approvedThisWeek = ds.tasks.filter(
    (t) => t.writerEmail === email && t.isApproved && inRange(t.approvalDate, weekStart, weekEnd)
  ).length;
  const rm = reviewerMetrics(ds, email, w);
  return { weekStart, weekEnd, approvedThisWeek, touchesThisWeek: rm.totalTouches };
}

export function computeUserMetrics(ds: Dataset, emailRaw: string): UserMetrics {
  const email = emailRaw.trim().toLowerCase();
  const ws = windows(ds.dataThrough);
  return {
    email,
    dataThrough: ds.dataThrough,
    hasQaActivity: hasQaActivity(ds.tasks),
    writer: ws.map((w) => writerMetrics(ds, email, w)),
    reviewer: ws.map((w) => reviewerMetrics(ds, email, w)),
    quality: ws.map((w) => qualityMetrics(ds, email, w)),
    weeklyTrend: weeklyTrend(ds, email),
    currentWeek: currentWeekProgress(ds, email),
  };
}
