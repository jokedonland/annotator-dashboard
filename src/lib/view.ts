import { Dataset, RoleRow, TARGETS } from "./types";
import { computeUserMetrics, UserMetrics } from "./metrics";
import { normEmail } from "./parse";

/** Row shape the task table renders — serializable, no Dataset reference. */
export interface TaskRowView {
  taskId: string;
  date: string | null; // date_written (writes view) or date_reviewed (reviews view)
  dateRaw: string;
  reviewed: boolean;
  errors: { type: string; severity: "major" | "minor"; count: number }[];
  approved: boolean;
  qaReviewed: boolean;
  qaApproved: boolean;
  attempts: number;
  fieldDomain: string;
  writerName?: string; // reviews view: whose task it was
}

export interface DashboardData {
  email: string;
  name: string;
  role: "Writer" | "Reviewer" | "Staff";
  isOnboarding: boolean;
  tags: string[];
  contractStatus: string;
  inRoles: boolean;
  dataThrough: string;
  hasQaActivity: boolean;
  targets: { aht: number; output: number; outputLabel: string };
  metrics: UserMetrics;
  writes: TaskRowView[];
  reviews: TaskRowView[];
}

function errorChips(t: { errors: { type: string; severity: "major" | "minor" }[] }) {
  const byKey = new Map<string, { type: string; severity: "major" | "minor"; count: number }>();
  for (const e of t.errors) {
    const key = `${e.type}|${e.severity}`;
    const cur = byKey.get(key);
    if (cur) cur.count++;
    else byKey.set(key, { type: e.type, severity: e.severity, count: 1 });
  }
  // majors first, then by type name
  return [...byKey.values()].sort((a, b) =>
    a.severity !== b.severity ? (a.severity === "major" ? -1 : 1) : a.type.localeCompare(b.type)
  );
}

export function buildDashboardData(ds: Dataset, emailRaw: string): DashboardData {
  const email = normEmail(emailRaw);
  const role: RoleRow | undefined = ds.roles.find((r) => r.contractorEmail === email);
  const metrics = computeUserMetrics(ds, email);

  const writes: TaskRowView[] = ds.tasks
    .filter((t) => t.writerEmail === email)
    .map((t) => ({
      taskId: t.taskId,
      date: t.dateWritten,
      dateRaw: t.dateWrittenRaw,
      reviewed: t.dateReviewed !== null && t.reviewerEmail !== null,
      errors: errorChips(t),
      approved: t.isApproved,
      qaReviewed: t.dateQaReviewed !== null,
      qaApproved: t.qaApproved,
      attempts: t.numWriterAttempts,
      fieldDomain: t.fieldDomain,
    }))
    .sort((a, b) => (b.dateRaw || "").localeCompare(a.dateRaw || ""));

  const reviews: TaskRowView[] = ds.tasks
    .filter((t) => t.reviewerEmail === email && t.writerEmail !== email)
    .map((t) => ({
      taskId: t.taskId,
      date: t.dateReviewed,
      dateRaw: t.dateReviewedRaw,
      reviewed: t.dateReviewed !== null,
      errors: errorChips(t),
      approved: t.isApproved,
      qaReviewed: t.dateQaReviewed !== null,
      qaApproved: t.qaApproved,
      attempts: t.numWriterAttempts,
      fieldDomain: t.fieldDomain,
      writerName: t.writerName,
    }))
    .sort((a, b) => (b.dateRaw || "").localeCompare(a.dateRaw || ""));

  const resolvedRole = role?.resolvedRole ?? "Writer";
  const targets = resolvedRole === "Reviewer" ? TARGETS.Reviewer : TARGETS.Writer;

  // Fall back to a name seen in the task dump when the user isn't in roles.
  const nameFromTasks =
    ds.tasks.find((t) => t.writerEmail === email)?.writerName ||
    ds.tasks.find((t) => t.reviewerEmail === email)?.reviewerName ||
    "";

  return {
    email,
    name: role?.name || nameFromTasks || email,
    role: resolvedRole,
    isOnboarding: role?.isOnboarding ?? false,
    tags: role?.tags ?? [],
    contractStatus: role?.contractStatus ?? "",
    inRoles: !!role,
    dataThrough: ds.dataThrough,
    hasQaActivity: metrics.hasQaActivity,
    targets: { aht: targets.aht, output: targets.output, outputLabel: targets.outputLabel },
    metrics,
    writes,
    reviews,
  };
}

/** Directory for the admin user-switcher: everyone in roles, plus emails seen in data. */
export function buildUserDirectory(ds: Dataset): { name: string; email: string; role: string }[] {
  const out = new Map<string, { name: string; email: string; role: string }>();
  for (const r of ds.roles) {
    out.set(r.contractorEmail, { name: r.name, email: r.contractorEmail, role: r.resolvedRole });
  }
  for (const t of ds.tasks) {
    if (!out.has(t.writerEmail)) {
      out.set(t.writerEmail, { name: t.writerName || t.writerEmail, email: t.writerEmail, role: "(not in roles)" });
    }
    if (t.reviewerEmail && !out.has(t.reviewerEmail)) {
      out.set(t.reviewerEmail, { name: t.reviewerName || t.reviewerEmail, email: t.reviewerEmail, role: "(not in roles)" });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
