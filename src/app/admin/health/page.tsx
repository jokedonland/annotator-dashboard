import { requireAdmin } from "@/lib/auth";
import { loadCurrent } from "@/lib/data";
import { fmtDayYear } from "@/components/format";

export const dynamic = "force-dynamic";

function Section({
  title,
  count,
  note,
  children,
}: {
  title: string;
  count: number;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <details className="rounded-xl border border-borderc bg-surface p-4" open={count > 0 && count <= 20}>
      <summary className="cursor-pointer text-sm font-semibold">
        {title} <span className="ml-1 rounded-full bg-page px-2 py-0.5 text-xs font-normal text-ink-2">{count.toLocaleString()}</span>
      </summary>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      {count > 0 && <div className="mt-2 text-xs">{children}</div>}
    </details>
  );
}

function EmailList({ emails }: { emails: string[] }) {
  return (
    <ul className="max-h-48 space-y-0.5 overflow-auto font-mono">
      {emails.slice(0, 100).map((e) => (
        <li key={e}>{e}</li>
      ))}
      {emails.length > 100 && <li className="text-muted">…and {emails.length - 100} more</li>}
    </ul>
  );
}

export default async function HealthPage() {
  await requireAdmin();
  const cur = await loadCurrent();

  if (!cur) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-ink-2">
          No dataset yet — <a className="text-series-1 underline" href="/admin/upload">upload one</a> first.
        </p>
      </main>
    );
  }

  const ds = cur.dataset;
  const h = ds.health;
  const selfRows = ds.tasks.filter((t) => t.isSelfReview).length;
  const blankRev = ds.tasks.filter((t) => t.reviewerEmail === null).length;

  const devs = h.hoursValidationDiscrepancies.map((d) => Math.abs(d.reported - d.reconstructed)).sort((a, b) => a - b);
  const q = (p: number) => (devs.length ? devs[Math.min(devs.length - 1, Math.floor(p * devs.length))].toFixed(1) : "0");
  const bigDevs = h.hoursValidationDiscrepancies
    .filter((d) => Math.abs(d.reported - d.reconstructed) > 8)
    .sort((a, b) => Math.abs(b.reported - b.reconstructed) - Math.abs(a.reported - a.reconstructed));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <h1 className="text-xl font-semibold tracking-tight">Data health</h1>
        <nav className="flex gap-3 text-xs">
          <a className="text-series-1 hover:underline" href="/">Dashboard</a>
          <a className="text-series-1 hover:underline" href="/admin/upload">Upload</a>
        </nav>
      </header>

      <p className="mb-4 text-sm text-ink-2">
        {ds.tasks.length.toLocaleString()} tasks · {ds.hoursSnapshots.length.toLocaleString()} hours rows ·{" "}
        {ds.roles.length} roles · data through <strong>{fmtDayYear(ds.dataThrough)}</strong>.{" "}
        Self-review rows: {selfRows.toLocaleString()} ({((selfRows / Math.max(1, ds.tasks.length)) * 100).toFixed(1)}%) ·
        awaiting review: {blankRev} ({((blankRev / Math.max(1, ds.tasks.length)) * 100).toFixed(1)}%).
      </p>

      <div className="space-y-3">
        <Section
          title="Unknown emails — in tasks, missing from roles"
          count={h.emailsInTasksNotInRoles.length}
          note="Their dashboards still render with whatever data exists."
        >
          <EmailList emails={h.emailsInTasksNotInRoles} />
        </Section>

        <Section title="Unknown emails — in hours, missing from roles" count={h.emailsInHoursNotInRoles.length}>
          <EmailList emails={h.emailsInHoursNotInRoles} />
        </Section>

        <Section
          title="In roles but nowhere in tasks or hours"
          count={h.emailsInRolesNotInData.length}
          note="Usually fine — new or inactive contractors."
        >
          <EmailList emails={h.emailsInRolesNotInData} />
        </Section>

        <Section
          title="Unparseable ERROR_CATEGORY values"
          count={h.unparseableErrorCategories.length}
          note="Treated as no-errors in metrics."
        >
          <ul className="max-h-48 space-y-0.5 overflow-auto font-mono">
            {h.unparseableErrorCategories.slice(0, 50).map((u) => (
              <li key={u.taskId}>
                {u.taskId.slice(0, 18)}… → {u.raw.slice(0, 60)}
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Negative daily-hour reconstructions (clamped to 0)"
          count={h.negativeDailyDiffs.length}
          note="The cumulative total decreased between snapshots; the day was clamped to 0 hours."
        >
          <ul className="max-h-48 space-y-0.5 overflow-auto font-mono">
            {h.negativeDailyDiffs.slice(0, 50).map((n, i) => (
              <li key={i}>
                {n.date} {n.email} ({n.diff.toFixed(2)}h)
              </li>
            ))}
            {h.negativeDailyDiffs.length > 50 && <li className="text-muted">…and {h.negativeDailyDiffs.length - 50} more</li>}
          </ul>
        </Section>

        <Section
          title="Hours 3d/7d cross-check deviations"
          count={h.hoursValidationDiscrepancies.length}
          note={`Expected in bulk: the dump's last_3d/last_7d are rolling 72h/168h clock windows, while reconstruction uses LA calendar days. Median gap ${q(0.5)}h, p90 ${q(0.9)}h. Listed below: only gaps over 8 hours (${bigDevs.length}).`}
        >
          <ul className="max-h-48 space-y-0.5 overflow-auto font-mono">
            {bigDevs.slice(0, 50).map((d, i) => (
              <li key={i}>
                {d.date} {d.email} {d.field}: reported {d.reported.toFixed(1)}h vs reconstructed {d.reconstructed.toFixed(1)}h
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="num_writer_attempts outliers (> 50)"
          count={h.attemptOutliers.length}
          note="These inflate touch counts; worth checking at the source."
        >
          <ul className="max-h-48 space-y-0.5 overflow-auto font-mono">
            {h.attemptOutliers
              .sort((a, b) => b.attempts - a.attempts)
              .slice(0, 50)
              .map((o) => (
                <li key={o.taskId}>
                  {o.attempts} — {o.taskId.slice(0, 18)}… ({o.writerEmail})
                </li>
              ))}
          </ul>
        </Section>

        <Section
          title="Approved with no review date"
          count={h.approvedWithoutReviewDate.length}
          note="Approval falls back to the written date for windowing."
        >
          <EmailList emails={h.approvedWithoutReviewDate} />
        </Section>

        <Section
          title="Malformed rows skipped at parse"
          count={h.taskRowsSkipped.length + h.hoursRowsSkipped.length + h.rolesRowsSkipped.length}
          note="Rows missing their key column (task id / email)."
        >
          <ul className="max-h-48 space-y-0.5 overflow-auto font-mono">
            {[
              ...h.taskRowsSkipped.map((s) => ({ ...s, file: "tasks" })),
              ...h.hoursRowsSkipped.map((s) => ({ ...s, file: "hours" })),
              ...h.rolesRowsSkipped.map((s) => ({ ...s, file: "roles" })),
            ]
              .slice(0, 50)
              .map((s, i) => (
                <li key={i}>
                  {s.file} line {s.line}: {s.reason}
                </li>
              ))}
          </ul>
        </Section>
      </div>
    </main>
  );
}
