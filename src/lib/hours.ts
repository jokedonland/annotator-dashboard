import { HoursSnapshot, DailyHours, DataHealth } from "./types";
import { addDays } from "./dates";

/**
 * Reconstruct per-user daily hours from the cumulative snapshot log:
 *   daily(user, d) = total_hours_all_time(d) − total_hours_all_time(prev snapshot)
 * First-ever row for a user uses hours_last_1d.
 * Negative diffs clamp to 0 (and are reported).
 * Reconstruction is validated against hours_last_3d / hours_last_7d.
 */
export function reconstructDailyHours(snapshots: HoursSnapshot[]): {
  daily: DailyHours[];
  negatives: DataHealth["negativeDailyDiffs"];
  discrepancies: DataHealth["hoursValidationDiscrepancies"];
} {
  const byUser = new Map<string, HoursSnapshot[]>();
  for (const s of snapshots) {
    const list = byUser.get(s.email);
    if (list) list.push(s);
    else byUser.set(s.email, [s]);
  }

  const daily: DailyHours[] = [];
  const negatives: DataHealth["negativeDailyDiffs"] = [];
  const discrepancies: DataHealth["hoursValidationDiscrepancies"] = [];
  const VALIDATION_TOLERANCE = 0.05; // hours; float noise in the dump

  for (const [email, list] of byUser) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    // Duplicate dates for a user: keep the last row for that date.
    const deduped: HoursSnapshot[] = [];
    for (const s of list) {
      if (deduped.length && deduped[deduped.length - 1].date === s.date) {
        deduped[deduped.length - 1] = s;
      } else {
        deduped.push(s);
      }
    }

    const userDaily: DailyHours[] = [];
    for (let i = 0; i < deduped.length; i++) {
      const s = deduped[i];
      let rawDiff: number;
      let isFirstSnapshot = false;
      if (i === 0) {
        rawDiff = s.hoursLast1d;
        isFirstSnapshot = true;
      } else {
        rawDiff = s.totalHoursAllTime - deduped[i - 1].totalHoursAllTime;
      }
      if (rawDiff < 0) negatives.push({ email, date: s.date, diff: rawDiff });
      userDaily.push({ email, date: s.date, hours: Math.max(0, rawDiff), rawDiff, isFirstSnapshot });
    }

    // Validate against the dump's own rolling sums where the trailing window
    // is fully covered by consecutive snapshots (gaps make comparison invalid).
    const byDate = new Map(userDaily.map((d) => [d.date, d]));
    for (const s of deduped) {
      for (const [field, span] of [
        ["hours_last_3d", 3],
        ["hours_last_7d", 7],
      ] as const) {
        let sum = 0;
        let covered = true;
        for (let k = 0; k < span; k++) {
          const d = byDate.get(addDays(s.date, -k));
          if (!d) {
            covered = false;
            break;
          }
          if (d.isFirstSnapshot && k < span - 1) covered = false; // window predates history
          sum += d.hours;
          if (!covered) break;
        }
        if (!covered) continue;
        const reported = field === "hours_last_3d" ? s.hoursLast3d : s.hoursLast7d;
        if (Math.abs(sum - reported) > VALIDATION_TOLERANCE) {
          discrepancies.push({ email, date: s.date, field, reported, reconstructed: sum });
        }
      }
    }

    daily.push(...userDaily);
  }

  return { daily, negatives, discrepancies };
}

/** Sum of reconstructed daily hours for a user in [start, end] (start null = all-time). */
export function hoursInWindow(
  daily: DailyHours[],
  email: string,
  start: string | null,
  end: string
): number {
  let sum = 0;
  for (const d of daily) {
    if (d.email !== email) continue;
    if (start && d.date < start) continue;
    if (d.date > end) continue;
    sum += d.hours;
  }
  return sum;
}

