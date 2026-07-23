import Papa from "papaparse";
import {
  Task,
  TaskError,
  HoursSnapshot,
  RoleRow,
  ResolvedRole,
  DataHealth,
  Dataset,
} from "./types";
import { toLaDate, parseSlashDate } from "./dates";
import { reconstructDailyHours } from "./hours";

export function normEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Header names are matched case-insensitively (trimmed, lowercased): real
 * exports have renamed columns between dumps (ERROR_CATEGORY → error_category),
 * so every field lookup in this file uses the lowercase name.
 */
function parseCsv(text: string): Record<string, string>[] {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  return res.data;
}

/**
 * Parse an ERROR_CATEGORY cell. Returns the salvageable errors plus whether
 * anything failed to parse (unparseable → treated as no-errors, but flagged).
 */
export function parseErrorCategory(raw: string | null | undefined): {
  errors: TaskError[];
  failed: boolean;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "[]") return { errors: [], failed: false };
  let items: unknown;
  try {
    items = JSON.parse(trimmed);
  } catch {
    return { errors: [], failed: true };
  }
  if (!Array.isArray(items)) return { errors: [], failed: true };
  const errors: TaskError[] = [];
  let failed = false;
  for (const item of items) {
    if (typeof item !== "string") {
      failed = true;
      continue;
    }
    // "<Type> - <severity>", severity is only ever major|minor
    const m = item.match(/^(.*\S)\s+-\s+(major|minor)\s*$/i);
    if (!m) {
      failed = true;
      continue;
    }
    errors.push({ type: m[1].trim(), severity: m[2].toLowerCase() as TaskError["severity"] });
  }
  return { errors, failed };
}

function num(raw: string | undefined): number | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
}

function yn(raw: string | undefined): boolean {
  return (raw ?? "").trim().toLowerCase() === "y";
}

export function parseTasks(
  text: string
): {
  tasks: Task[];
  skipped: { line: number; reason: string }[];
  unparseable: { taskId: string; raw: string }[];
  unclaimed: number;
} {
  const rows = parseCsv(text);
  const tasks: Task[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const unparseable: { taskId: string; raw: string }[] = [];
  let unclaimed = 0;

  rows.forEach((row, i) => {
    const taskId = (row["task_id"] ?? "").trim();
    const writerEmail = normEmail(row["writer_email"]);
    if (taskId && !writerEmail) {
      // Task exists in the pool but nobody has written it yet — expected in
      // newer dumps, counted but not listed as malformed.
      unclaimed++;
      return;
    }
    if (!taskId) {
      skipped.push({ line: i + 2, reason: "missing TASK_ID" });
      return;
    }
    const reviewerEmail = normEmail(row["reviewer_email"]) || null;
    const { errors, failed } = parseErrorCategory(row["error_category"]);
    if (failed) unparseable.push({ taskId, raw: row["error_category"] ?? "" });

    const approved = yn(row["approved"]);
    const qaApproved = yn(row["qa_approved"]);
    const isApproved = approved || qaApproved; // count once, never double
    const dateWritten = toLaDate(row["date_written"]);
    const dateReviewed = toLaDate(row["date_reviewed"]);
    const dateQaReviewed = toLaDate(row["date_qa_reviewed"]);

    // Approval dates at review time; fallback to written date. A QA-only
    // approval (qa_approved without approved) dates to the QA review date.
    let approvalDate: string | null = null;
    if (isApproved) {
      if (approved) approvalDate = dateReviewed ?? dateWritten;
      else approvalDate = dateQaReviewed ?? dateReviewed ?? dateWritten;
    }

    tasks.push({
      taskId,
      writerClaimTime: num(row["writer_claim_time"]),
      reviewerClaimTime: num(row["reviewer_claim_time"]),
      qaClaimTime: num(row["qa_claim_time"]),
      writerEmail,
      reviewerEmail,
      qaEmail: normEmail(row["qa_email"]) || null,
      writerName: (row["writer_name"] ?? "").trim(),
      reviewerName: (row["reviewer_name"] ?? "").trim(),
      qaName: (row["qa_name"] ?? "").trim(),
      dateWritten,
      dateReviewed,
      dateQaReviewed,
      dateWrittenRaw: (row["date_written"] ?? "").trim(),
      dateReviewedRaw: (row["date_reviewed"] ?? "").trim(),
      dateQaReviewedRaw: (row["date_qa_reviewed"] ?? "").trim(),
      numWriterAttempts: Math.max(1, num(row["num_writer_attempts"]) ?? 1),
      approved,
      qaApproved,
      errors,
      errorCategoryRaw: row["error_category"] ?? "",
      errorParseFailed: failed,
      fieldDomain: (row["field_domain"] ?? "").trim(),
      numSources: (row["num_sources"] ?? "").trim(),
      listLength: (row["list_length"] ?? "").trim(),
      isSelfReview: reviewerEmail !== null && reviewerEmail === writerEmail,
      isApproved,
      approvalDate,
    });
  });

  return { tasks, skipped, unparseable, unclaimed };
}

export function parseHours(
  text: string
): { snapshots: HoursSnapshot[]; skipped: { line: number; reason: string }[] } {
  const rows = parseCsv(text);
  const snapshots: HoursSnapshot[] = [];
  const skipped: { line: number; reason: string }[] = [];

  rows.forEach((row, i) => {
    const email = normEmail(row["mercor_expert_email"]);
    const date = parseSlashDate(row["date (add)"]);
    const total = num(row["total_hours_all_time"]);
    if (!email || !date || total === null) {
      skipped.push({
        line: i + 2,
        reason: !email ? "missing email" : !date ? "bad Date (Add)" : "bad total_hours_all_time",
      });
      return;
    }
    snapshots.push({
      userId: (row["userid"] ?? "").trim(),
      userName: (row["user_name"] ?? "").trim(),
      email,
      totalHoursAllTime: total,
      totalHoursInPeriod: num(row["total_hours_in_period"]) ?? 0,
      hoursLast1d: num(row["hours_last_1d"]) ?? 0,
      hoursLast3d: num(row["hours_last_3d"]) ?? 0,
      hoursLast7d: num(row["hours_last_7d"]) ?? 0,
      date,
    });
  });

  return { snapshots, skipped };
}

export function resolveRole(tags: string[]): { role: ResolvedRole; isOnboarding: boolean } {
  const set = new Set(tags.map((t) => t.toLowerCase()));
  if (set.has("reviewer") || set.has("auditor")) return { role: "Reviewer", isOnboarding: false };
  if (set.has("writer") || set.has("super-writer")) return { role: "Writer", isOnboarding: false };
  if (set.has("epm")) return { role: "Staff", isOnboarding: false };
  // Only Onboarding tags, or no tags at all → Writer targets with badge
  return { role: "Writer", isOnboarding: true };
}

export function parseRoles(
  text: string
): { roles: RoleRow[]; skipped: { line: number; reason: string }[] } {
  const rows = parseCsv(text);
  const roles: RoleRow[] = [];
  const skipped: { line: number; reason: string }[] = [];

  rows.forEach((row, i) => {
    const contractorEmail = normEmail(row["contractor email"]);
    if (!contractorEmail) {
      skipped.push({ line: i + 2, reason: "missing Contractor Email" });
      return;
    }
    const tags = (row["tags"] ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const { role, isOnboarding } = resolveRole(tags);
    roles.push({
      name: (row["name"] ?? "").trim(),
      personalEmail: (row["email"] ?? "").trim(),
      contractorEmail,
      helper: (row["helper"] ?? "").trim(),
      tags,
      contractStatus: (row["contract status"] ?? "").trim(),
      resolvedRole: role,
      isOnboarding,
    });
  });

  return { roles, skipped };
}

const ATTEMPT_OUTLIER_THRESHOLD = 50;

/** Assemble the full dataset from the three raw CSV texts. */
export function buildDataset(tasksCsv: string, hoursCsv: string, rolesCsv: string): Dataset {
  const t = parseTasks(tasksCsv);
  const h = parseHours(hoursCsv);
  const r = parseRoles(rolesCsv);

  const { daily, negatives, discrepancies } = reconstructDailyHours(h.snapshots);

  const roleEmails = new Set(r.roles.map((x) => x.contractorEmail));
  const taskEmails = new Set<string>();
  for (const task of t.tasks) {
    taskEmails.add(task.writerEmail);
    if (task.reviewerEmail) taskEmails.add(task.reviewerEmail);
    if (task.qaEmail) taskEmails.add(task.qaEmail);
  }
  const hoursEmails = new Set(h.snapshots.map((s) => s.email));

  const health: DataHealth = {
    unparseableErrorCategories: t.unparseable,
    negativeDailyDiffs: negatives,
    hoursValidationDiscrepancies: discrepancies,
    attemptOutliers: t.tasks
      .filter((task) => task.numWriterAttempts > ATTEMPT_OUTLIER_THRESHOLD)
      .map((task) => ({ taskId: task.taskId, writerEmail: task.writerEmail, attempts: task.numWriterAttempts })),
    unclaimedTaskRows: t.unclaimed,
    approvedWithoutReviewDate: t.tasks
      .filter((task) => task.isApproved && !task.dateReviewed)
      .map((task) => task.taskId),
    emailsInTasksNotInRoles: [...taskEmails].filter((e) => !roleEmails.has(e)).sort(),
    emailsInHoursNotInRoles: [...hoursEmails].filter((e) => !roleEmails.has(e)).sort(),
    emailsInRolesNotInData: [...roleEmails]
      .filter((e) => !taskEmails.has(e) && !hoursEmails.has(e))
      .sort(),
    taskRowsSkipped: t.skipped,
    hoursRowsSkipped: h.skipped,
    rolesRowsSkipped: r.skipped,
  };

  // Latest LA date present anywhere in the data.
  let dataThrough = "";
  for (const task of t.tasks) {
    for (const d of [task.dateWritten, task.dateReviewed, task.dateQaReviewed]) {
      if (d && d > dataThrough) dataThrough = d;
    }
  }
  for (const s of h.snapshots) {
    if (s.date > dataThrough) dataThrough = s.date;
  }

  return {
    tasks: t.tasks,
    hoursSnapshots: h.snapshots,
    dailyHours: daily,
    roles: r.roles,
    dataThrough,
    health,
  };
}
