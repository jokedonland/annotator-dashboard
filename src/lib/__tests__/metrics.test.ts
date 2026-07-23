import { describe, it, expect } from "vitest";
import { buildDataset, parseErrorCategory, parseTasks, resolveRole } from "../parse";
import { toLaDate, mondayOf, addDays, windows } from "../dates";
import { computeUserMetrics, hasQaActivity } from "../metrics";
import { TASKS_CSV, HOURS_CSV, ROLES_CSV, ALICE, BOB, CAROL, DAVE } from "./fixtures";

const ds = buildDataset(TASKS_CSV, HOURS_CSV, ROLES_CSV);
const byKey = <T extends { window: string }>(arr: T[], key: string): T =>
  arr.find((m) => m.window === key)!;

describe("date handling", () => {
  it("converts UTC dump timestamps to LA calendar dates", () => {
    expect(toLaDate("2026-07-02 18:06:01.037+00")).toBe("2026-07-02");
    // 03:00 UTC in July is 20:00 the previous day in LA (UTC-7)
    expect(toLaDate("2026-07-15 03:00:00+00")).toBe("2026-07-14");
    expect(toLaDate("")).toBeNull();
    expect(toLaDate("garbage")).toBeNull();
    // January (PST, UTC-8): 07:59 UTC is previous day
    expect(toLaDate("2026-01-10 07:59:00+00")).toBe("2026-01-09");
    expect(toLaDate("2026-01-10 08:01:00+00")).toBe("2026-01-10");
  });

  it("computes Mondays and day arithmetic across boundaries", () => {
    expect(mondayOf("2026-07-15")).toBe("2026-07-13"); // Wednesday → Monday
    expect(mondayOf("2026-07-13")).toBe("2026-07-13"); // Monday → itself
    expect(mondayOf("2026-07-19")).toBe("2026-07-13"); // Sunday → previous Monday
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("anchors rolling windows to dataThrough, inclusive", () => {
    expect(ds.dataThrough).toBe("2026-07-15");
    const [all, w2, w3] = windows(ds.dataThrough);
    expect(all.start).toBeNull();
    expect(w2.start).toBe("2026-07-02");
    expect(w3.start).toBe("2026-07-13");
  });
});

describe("ERROR_CATEGORY parsing", () => {
  it("parses well-formed arrays", () => {
    const r = parseErrorCategory('["Objectivity - major","Source - minor"]');
    expect(r.failed).toBe(false);
    expect(r.errors).toEqual([
      { type: "Objectivity", severity: "major" },
      { type: "Source", severity: "minor" },
    ]);
  });
  it("treats blank/empty as no errors, not failures", () => {
    expect(parseErrorCategory("")).toEqual({ errors: [], failed: false });
    expect(parseErrorCategory("[]")).toEqual({ errors: [], failed: false });
    expect(parseErrorCategory(null)).toEqual({ errors: [], failed: false });
  });
  it("flags unparseable values but salvages valid items", () => {
    expect(parseErrorCategory("notjson").failed).toBe(true);
    expect(parseErrorCategory('{"a":1}').failed).toBe(true);
    const mixed = parseErrorCategory('["Accuracy - major","broken"]');
    expect(mixed.failed).toBe(true);
    expect(mixed.errors).toEqual([{ type: "Accuracy", severity: "major" }]);
  });
  it("handles multi-word types", () => {
    const r = parseErrorCategory('["Question Type - minor"]');
    expect(r.errors).toEqual([{ type: "Question Type", severity: "minor" }]);
  });
});

describe("role resolution", () => {
  it("follows the priority order", () => {
    expect(resolveRole(["Reviewer", "Super-Writer"]).role).toBe("Reviewer");
    expect(resolveRole(["Auditor"]).role).toBe("Reviewer");
    expect(resolveRole(["Super-Writer"]).role).toBe("Writer");
    expect(resolveRole(["Writer"]).role).toBe("Writer");
    expect(resolveRole(["EPM"]).role).toBe("Staff");
  });
  it("marks Onboarding-only and untagged users as Writer + badge", () => {
    expect(resolveRole(["Onboarding"])).toEqual({ role: "Writer", isOnboarding: true });
    expect(resolveRole([])).toEqual({ role: "Writer", isOnboarding: true });
    expect(resolveRole(["Onboarding", "Writer"]).isOnboarding).toBe(false);
  });
});

describe("hours reconstruction", () => {
  it("uses hours_last_1d for a user's first snapshot", () => {
    const first = ds.dailyHours.find((d) => d.email === ALICE && d.date === "2026-07-13")!;
    expect(first.isFirstSnapshot).toBe(true);
    expect(first.hours).toBe(2);
  });
  it("diffs consecutive cumulative totals", () => {
    const d = ds.dailyHours.find((x) => x.email === ALICE && x.date === "2026-07-14")!;
    expect(d.hours).toBe(2);
  });
  it("clamps negative diffs to 0 and reports them", () => {
    const d = ds.dailyHours.find((x) => x.email === ALICE && x.date === "2026-07-15")!;
    expect(d.hours).toBe(0);
    expect(d.rawDiff).toBe(-1);
    expect(ds.health.negativeDailyDiffs).toEqual([
      { email: ALICE, date: "2026-07-15", diff: -1 },
    ]);
  });
  it("validates against hours_last_3d only when the window is fully covered", () => {
    // alice 7/15 last_3d=4 matches 0+2+2 → no discrepancy; gaps elsewhere skip validation
    expect(ds.health.hoursValidationDiscrepancies).toEqual([]);
  });
  it("detects a genuine 3d discrepancy", () => {
    const bad = HOURS_CSV.replace("11,0,0,4,4,7/15/2026", "11,0,0,9,4,7/15/2026");
    const ds2 = buildDataset(TASKS_CSV, bad, ROLES_CSV);
    expect(ds2.health.hoursValidationDiscrepancies).toEqual([
      { email: ALICE, date: "2026-07-15", field: "hours_last_3d", reported: 9, reconstructed: 4 },
    ]);
  });
});

describe("writer metrics (alice)", () => {
  const m = computeUserMetrics(ds, ALICE);

  it("counts approvals via the OR/dedup rule, dated correctly", () => {
    // t1 (7/10), t2 (7/14, approved+qa but ONE task), t5 (fallback to written 7/12),
    // t6 (QA-only → 7/05)
    expect(byKey(m.writer, "allTime").approvedCount).toBe(4);
    expect(byKey(m.writer, "last2w").approvedCount).toBe(4); // t6 at 7/05 ≥ 7/02
    expect(byKey(m.writer, "last3d").approvedCount).toBe(1); // only t2
  });

  it("dates tasks written by LA date (timezone boundary lands 7/14)", () => {
    // all: t1,t2,t3,t5,t6,t7,t9 = 7; last3d by date_written: t2 7/13, t3 7/15, t7 7/14 (tz!), t9 7/14
    expect(byKey(m.writer, "allTime").tasksWritten).toBe(7);
    expect(byKey(m.writer, "last3d").tasksWritten).toBe(4);
  });

  it("sums per-touch attempts over tasks written in window", () => {
    expect(byKey(m.writer, "allTime").totalAttempts).toBe(12); // 2+1+1+1+2+4+1
    expect(byKey(m.writer, "last3d").totalAttempts).toBe(7); // 1+1+4+1
    expect(byKey(m.writer, "last2w").totalAttempts).toBe(10); // all but t6 (7/01)
  });

  it("computes AHT and deviance; all-time hours from the daily reconstruction", () => {
    const all = byKey(m.writer, "allTime");
    // Sum of reconstructed dailies (2+2+0), NOT the latest cumulative (11):
    // all-time must stay consistent with the loaded data's coverage.
    expect(all.hours).toBe(4);
    expect(all.aht.value).toBeCloseTo(4 / 4);
    expect(all.aht.devianceFromTarget).toBeCloseTo((4 / 4 - 2.5) / 2.5);
    const w3 = byKey(m.writer, "last3d");
    expect(w3.hours).toBe(4); // 2+2+0 reconstructed dailies
    expect(w3.aht.value).toBeCloseTo(4 / 1);
    expect(w3.perTouchAht.value).toBeCloseTo(4 / 7);
  });
});

describe("super-writer self rows (carol)", () => {
  const m = computeUserMetrics(ds, CAROL);

  it("count as writes with full writer metrics", () => {
    expect(byKey(m.writer, "allTime").tasksWritten).toBe(1);
    expect(byKey(m.writer, "allTime").approvedCount).toBe(1);
  });

  it("do NOT count as review touches or reviewer metrics", () => {
    const all = byKey(m.reviewer, "allTime");
    // carol's only real review is t8 (bob's task); her self row t4 is excluded
    expect(all.tasksReviewed).toBe(1);
    expect(all.reviewTouches).toBe(2); // t8 attempts
    // her own write t4 (3 attempts) still counts toward touches
    expect(all.ownWriteAttempts).toBe(3);
    expect(all.totalTouches).toBe(5);
  });

  it("errors on self rows DO count toward quality", () => {
    const q = byKey(m.quality, "allTime");
    expect(q.denominator).toBe(1);
    expect(q.byType.find((t) => t.type === "Objectivity")).toMatchObject({ minor: 1, major: 0 });
  });
});

describe("reviewer metrics (bob)", () => {
  const m = computeUserMetrics(ds, BOB);

  it("counts only real reviews with a review date", () => {
    // t1 7/10, t2 7/14, t6 7/02, t9 7/15 — t5 has no date_reviewed
    expect(byKey(m.reviewer, "allTime").tasksReviewed).toBe(4);
    expect(byKey(m.reviewer, "last3d").tasksReviewed).toBe(2); // t2, t9
    expect(byKey(m.reviewer, "allTime").tasksApprovedByThem).toBe(2); // t1, t2 (t6 approved=n)
  });

  it("computes touches = review touches + own write attempts", () => {
    const all = byKey(m.reviewer, "allTime");
    expect(all.reviewTouches).toBe(6); // 2+1+2+1
    expect(all.ownWriteAttempts).toBe(2); // t8
    expect(all.totalTouches).toBe(8);
  });

  it("AHT divides hours by ALL tasks reviewed (confirmed choice)", () => {
    const all = byKey(m.reviewer, "allTime");
    // bob's single snapshot reconstructs to 1.5 daily hours (hours_last_1d)
    expect(all.aht.value).toBeCloseTo(1.5 / 4);
    expect(all.aht.devianceFromTarget).toBeCloseTo((1.5 / 4 - 1.5) / 1.5);
    expect(all.perTouchAht.value).toBeCloseTo(1.5 / 8);
  });
});

describe("quality metrics (alice)", () => {
  const m = computeUserMetrics(ds, ALICE);

  it("denominator = written tasks with date_reviewed in window", () => {
    // t1 7/10, t2 7/14, t6 7/02, t9 7/15 (unparseable errors → still in denom)
    expect(byKey(m.quality, "allTime").denominator).toBe(4);
    expect(byKey(m.quality, "last3d").denominator).toBe(2); // t2, t9
  });

  it("major error rate counts tasks with ≥1 major", () => {
    const all = byKey(m.quality, "allTime");
    expect(all.tasksWithMajor).toBe(1); // t1
    expect(all.majorErrorRate).toBeCloseTo(0.25);
  });

  it("splits type frequencies by severity", () => {
    const all = byKey(m.quality, "allTime");
    expect(all.byType.find((t) => t.type === "Accuracy")).toMatchObject({ major: 1, minor: 0 });
    expect(all.byType.find((t) => t.type === "Source")).toMatchObject({ major: 0, minor: 1 });
  });
});

describe("zero-denominator and empty-user handling", () => {
  it("returns null (never NaN/∞) when denominators are 0", () => {
    const m = computeUserMetrics(ds, ALICE);
    const rev = byKey(m.reviewer, "allTime"); // alice reviews nothing
    expect(rev.aht.value).toBeNull();
    expect(rev.aht.devianceFromTarget).toBeNull();
  });

  it("a roles-only user gets an empty dashboard, not an error", () => {
    const m = computeUserMetrics(ds, DAVE);
    expect(byKey(m.writer, "allTime").hours).toBe(0);
    expect(byKey(m.writer, "allTime").aht.value).toBeNull();
    expect(byKey(m.quality, "allTime").majorErrorRate).toBeNull();
    expect(m.weeklyTrend).toEqual([]);
  });
});

describe("current week progress (Mon–Sun PT)", () => {
  it("computes writer approvals and reviewer touches for the week of dataThrough", () => {
    const alice = computeUserMetrics(ds, ALICE);
    expect(alice.currentWeek.weekStart).toBe("2026-07-13");
    expect(alice.currentWeek.weekEnd).toBe("2026-07-19");
    expect(alice.currentWeek.approvedThisWeek).toBe(1); // t2
    const bob = computeUserMetrics(ds, BOB);
    expect(bob.currentWeek.touchesThisWeek).toBe(4); // t2(1)+t9(1) reviews + t8 own 2
  });
});

describe("data health", () => {
  it("captures unparseable error categories, dedup edge artifacts, and joins", () => {
    expect(ds.health.unparseableErrorCategories).toEqual([{ taskId: "t9", raw: "notjson" }]);
    expect(ds.health.approvedWithoutReviewDate).toEqual(["t5"]);
    expect(ds.health.emailsInTasksNotInRoles).toEqual([]);
    expect(ds.health.emailsInRolesNotInData).toEqual([DAVE]);
  });
});

describe("QA activity detection", () => {
  it("fixture has QA activity (t6 has a QA review date)", () => {
    expect(hasQaActivity(ds.tasks)).toBe(true);
  });
  it("dataset with no QA anywhere reports none", () => {
    const noQa = buildDataset(
      TASKS_CSV.split("\n")
        .filter((l) => !l.startsWith("t6") && !l.startsWith("t2"))
        .join("\n"),
      HOURS_CSV,
      ROLES_CSV
    );
    expect(hasQaActivity(noQa.tasks)).toBe(false);
  });
});

describe("July 2026 export format (renamed lowercase headers)", () => {
  const NEW_FORMAT_CSV = [
    "TASK_ID,writer_email,writer_name,reviewer_email,reviewer_name,qa_email,qa_name,date_written,date_reviewed,date_qa_reviewed,num_writer_attempts,approved,qa_approved,error_category,field_domain,num_sources,list_length",
    'task_new1,alice@mercor.expert,Alice,bob@mercor.expert,Bob,,,2026-07-10 18:00:00+00,2026-07-10 19:00:00+00,,2,y,n,"[""Objectivity - major""]",Travel,3,LL2',
    "task_pool1,,,,,,,,,,,,,,,,", // unclaimed task: id only
  ].join("\n");

  it("parses errors from lowercase error_category and counts unclaimed rows", () => {
    const r = parseTasks(NEW_FORMAT_CSV);
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0].errors).toEqual([{ type: "Objectivity", severity: "major" }]);
    expect(r.tasks[0].dateWritten).toBe("2026-07-10");
    expect(r.unclaimed).toBe(1);
    expect(r.skipped).toHaveLength(0);
  });
});

describe("combined (super-writer + reviewer) metrics", () => {
  it("sums approved writes and approved reviews against a blended target", () => {
    const m = computeUserMetrics(ds, BOB);
    const all = m.combined.find((w) => w.window === "allTime")!;
    // bob wrote t8 (approved) and reviewed t1, t2 (approved), t5 (approved,
    // no review date → dated by written date), t6 (QA-approved); t9 is not
    // approved → W=1, R=4, contributions=5
    expect(all.approvedWrites).toBe(1);
    expect(all.approvedReviews).toBe(4);
    expect(all.contributions).toBe(5);
    // expected hours = 2.5·1 + 1.5·4 = 8.5 → blended target 1.7/contribution
    expect(all.expectedHours).toBeCloseTo(8.5);
    expect(all.blendedTarget).toBeCloseTo(1.7);
    expect(all.aht.value).toBeCloseTo(1.5 / 5);
    expect(all.aht.devianceFromTarget).toBeCloseTo((1.5 / 5 - 1.7) / 1.7);
  });

  it("never double-counts: self rows are writes, not reviews", () => {
    const m = computeUserMetrics(ds, CAROL);
    const all = m.combined.find((w) => w.window === "allTime")!;
    // carol's self row t4 is an approved write; her real review t8 is approved
    expect(all.approvedWrites).toBe(1);
    expect(all.approvedReviews).toBe(1);
    expect(all.contributions).toBe(2);
  });

  it("zero contributions → null AHT and null blended target", () => {
    const m = computeUserMetrics(ds, DAVE);
    const all = m.combined.find((w) => w.window === "allTime")!;
    expect(all.contributions).toBe(0);
    expect(all.blendedTarget).toBeNull();
    expect(all.aht.value).toBeNull();
  });
});
