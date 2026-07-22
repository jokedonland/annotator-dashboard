/**
 * Eyeball-verification harness (build-order step 2).
 * Loads the real CSV dumps and prints a metrics table for a few users so the
 * numbers can be checked against spreadsheet math before the UI exists.
 *
 * Usage:
 *   npx tsx scripts/verify.ts <tasks.csv> <hours.csv> <roles.csv> [email ...]
 * With no emails given, picks three automatically: the busiest reviewer, the
 * busiest super-writer (self-review rows), and the busiest plain writer.
 */
import { readFileSync } from "node:fs";
import { buildDataset } from "../src/lib/parse";
import { computeUserMetrics } from "../src/lib/metrics";
import { windows } from "../src/lib/dates";

const [tasksPath, hoursPath, rolesPath, ...emails] = process.argv.slice(2);
if (!tasksPath || !hoursPath || !rolesPath) {
  console.error("usage: tsx scripts/verify.ts <tasks.csv> <hours.csv> <roles.csv> [email ...]");
  process.exit(1);
}

const ds = buildDataset(
  readFileSync(tasksPath, "utf8"),
  readFileSync(hoursPath, "utf8"),
  readFileSync(rolesPath, "utf8")
);

console.log(`Dataset: ${ds.tasks.length} tasks, ${ds.hoursSnapshots.length} hours rows, ${ds.roles.length} roles`);
console.log(`Data through: ${ds.dataThrough} (America/Los_Angeles)`);
const ws = windows(ds.dataThrough);
console.log(`Windows: last 2 weeks = ${ws[1].start}..${ws[1].end}, last 3 days = ${ws[2].start}..${ws[2].end}\n`);

let picks = emails.map((e) => e.toLowerCase().trim());
if (picks.length === 0) {
  const reviewCounts = new Map<string, number>();
  const selfCounts = new Map<string, number>();
  const writeCounts = new Map<string, number>();
  for (const t of ds.tasks) {
    writeCounts.set(t.writerEmail, (writeCounts.get(t.writerEmail) ?? 0) + 1);
    if (t.reviewerEmail && t.reviewerEmail !== t.writerEmail)
      reviewCounts.set(t.reviewerEmail, (reviewCounts.get(t.reviewerEmail) ?? 0) + 1);
    if (t.isSelfReview) selfCounts.set(t.writerEmail, (selfCounts.get(t.writerEmail) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, exclude: string[]) =>
    [...m.entries()]
      .filter(([e]) => !exclude.includes(e))
      .sort((a, b) => b[1] - a[1])[0]?.[0];
  const topReviewer = top(reviewCounts, []);
  const topSelf = top(selfCounts, [topReviewer]);
  const topWriter = top(
    new Map([...writeCounts].filter(([e]) => !selfCounts.has(e) && !reviewCounts.has(e))),
    [topReviewer, topSelf]
  );
  picks = [topReviewer, topSelf, topWriter].filter(Boolean) as string[];
}

const fmt = (v: number | null, digits = 2) => (v === null ? "—" : v.toFixed(digits));
const pct = (v: number | null) =>
  v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

for (const email of picks) {
  const role = ds.roles.find((r) => r.contractorEmail === email);
  const m = computeUserMetrics(ds, email);
  console.log("=".repeat(78));
  console.log(`${role?.name ?? "(not in roles)"} <${email}>`);
  console.log(
    `Role: ${role?.resolvedRole ?? "?"}${role?.isOnboarding ? " (Onboarding)" : ""}  Tags: ${role?.tags.join(", ") || "—"}  Status: ${role?.contractStatus ?? "—"}`
  );
  console.log(
    `Current week (${m.currentWeek.weekStart}..${m.currentWeek.weekEnd}): ` +
      `${m.currentWeek.approvedThisWeek} approved · ${m.currentWeek.touchesThisWeek} touches`
  );

  console.log("\n  WRITER VIEW");
  console.log(
    "  window        hours   written  attempts  approved   AHT     dev      /touch"
  );
  for (const w of m.writer) {
    console.log(
      `  ${w.window.padEnd(11)} ${fmt(w.hours).padStart(7)} ${String(w.tasksWritten).padStart(8)} ` +
        `${String(w.totalAttempts).padStart(9)} ${String(w.approvedCount).padStart(9)} ` +
        `${fmt(w.aht.value).padStart(6)} ${pct(w.aht.devianceFromTarget).padStart(8)} ${fmt(w.perTouchAht.value).padStart(8)}`
    );
  }

  console.log("\n  REVIEWER VIEW (self rows excluded)");
  console.log(
    "  window        hours  reviewed  rev-touch  own-att  touches   AHT     dev      /touch"
  );
  for (const w of m.reviewer) {
    console.log(
      `  ${w.window.padEnd(11)} ${fmt(w.hours).padStart(7)} ${String(w.tasksReviewed).padStart(8)} ` +
        `${String(w.reviewTouches).padStart(10)} ${String(w.ownWriteAttempts).padStart(8)} ${String(w.totalTouches).padStart(8)} ` +
        `${fmt(w.aht.value).padStart(6)} ${pct(w.aht.devianceFromTarget).padStart(8)} ${fmt(w.perTouchAht.value).padStart(8)}`
    );
  }

  console.log("\n  QUALITY (own written work)");
  console.log("  window        reviewed-tasks  w/major  major-rate  top types");
  for (const q of m.quality) {
    const tops = q.byType
      .filter((t) => t.major + t.minor > 0)
      .slice(0, 3)
      .map((t) => `${t.type} ${t.major}M/${t.minor}m`)
      .join(", ");
    console.log(
      `  ${q.window.padEnd(11)} ${String(q.denominator).padStart(14)} ${String(q.tasksWithMajor).padStart(8)} ` +
        `${pct(q.majorErrorRate).padStart(11)}  ${tops || "—"}`
    );
  }
  console.log();
}

console.log("=".repeat(78));
console.log("DATA HEALTH SUMMARY");
const h = ds.health;
console.log(`  unparseable ERROR_CATEGORY cells: ${h.unparseableErrorCategories.length}`);
console.log(`  negative daily-hour diffs (clamped): ${h.negativeDailyDiffs.length}`);
console.log(
  `  hours validation deviations (3d/7d): ${h.hoursValidationDiscrepancies.length} ` +
    `(expected: the dump's last_3d/7d are rolling 72h/168h windows, not calendar days)`
);
console.log(`  attempt outliers (>50): ${h.attemptOutliers.length}`);
console.log(`  approved without review date: ${h.approvedWithoutReviewDate.length}`);
console.log(`  emails in tasks not in roles: ${h.emailsInTasksNotInRoles.length}`);
console.log(`  emails in hours not in roles: ${h.emailsInHoursNotInRoles.length}`);
console.log(`  emails in roles with no data: ${h.emailsInRolesNotInData.length}`);
console.log(`  rows skipped (tasks/hours/roles): ${h.taskRowsSkipped.length}/${h.hoursRowsSkipped.length}/${h.rolesRowsSkipped.length}`);
const selfRows = ds.tasks.filter((t) => t.isSelfReview).length;
const blankRev = ds.tasks.filter((t) => t.reviewerEmail === null).length;
console.log(`  self-review (super-writer) rows: ${selfRows} (${((selfRows / ds.tasks.length) * 100).toFixed(1)}%)`);
console.log(`  blank reviewer (awaiting review): ${blankRev} (${((blankRev / ds.tasks.length) * 100).toFixed(1)}%)`);
