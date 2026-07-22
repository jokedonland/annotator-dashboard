import { requireAdmin } from "@/lib/auth";
import { getCurrent, getPrevious } from "@/lib/storage";
import { UploadClient } from "./UploadClient";
import { fmtDayYear } from "@/components/format";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  await requireAdmin();
  const current = await getCurrent();
  const previous = await getPrevious();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <h1 className="text-xl font-semibold tracking-tight">Data upload</h1>
        <nav className="flex gap-3 text-xs">
          <a className="text-series-1 hover:underline" href="/">
            Dashboard
          </a>
          <a className="text-series-1 hover:underline" href="/admin/health">
            Data health
          </a>
        </nav>
      </header>

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-borderc bg-surface p-4 text-sm">
          <div className="text-xs font-medium text-ink-2">Current dataset</div>
          {current ? (
            <>
              <div className="mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                {current.data.meta.counts.tasks.toLocaleString()} tasks ·{" "}
                {current.data.meta.counts.hours.toLocaleString()} hours rows ·{" "}
                {current.data.meta.counts.roles} roles · {current.data.meta.counts.users} users
              </div>
              <div className="mt-1 text-xs text-muted">
                Uploaded {fmtDayYear(current.data.meta.uploadedAt.slice(0, 10))} by{" "}
                {current.data.meta.uploadedBy}
              </div>
            </>
          ) : (
            <div className="mt-1 text-muted">None — first upload needs all four CSVs.</div>
          )}
        </div>
        <div className="rounded-xl border border-borderc bg-surface p-4 text-sm">
          <div className="text-xs font-medium text-ink-2">Rollback</div>
          {previous ? (
            <div className="mt-1 text-xs text-muted">
              Previous dataset from{" "}
              {fmtDayYear(previous.data.meta.uploadedAt.slice(0, 10))} is kept — one-step
              rollback available below.
            </div>
          ) : (
            <div className="mt-1 text-muted">No previous dataset yet.</div>
          )}
        </div>
      </section>

      <UploadClient hasPrevious={!!previous} />
    </main>
  );
}
