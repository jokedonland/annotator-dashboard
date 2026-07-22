"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface DiffSummary {
  replaced: string[];
  counts: { tasks: number; hours: number; roles: number; users: number };
  oldCounts: { tasks: number; hours: number; roles: number; users: number } | null;
  users: { added: string[]; removed: string[]; hashed: number; reused: number };
  skippedRows: { tasks: number; hours: number; roles: number };
}

export function UploadClient({ hasPrevious }: { hasPrevious: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)].slice(0, 8));
    setSummary(null);
    setDone(null);
    setError(null);
  }

  async function upload() {
    setBusy("Validating… (a new users CSV can take ~1 min to hash)");
    setError(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setSummary(body as DiffSummary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function confirm(action: "confirm" | "discard") {
    setBusy(action === "confirm" ? "Swapping datasets…" : "Discarding…");
    setError(null);
    try {
      const res = await fetch("/api/admin/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action === "discard" ? "discard" : "commit" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setSummary(null);
      setFiles([]);
      setDone(action === "confirm" ? "Dataset swapped in. Dashboards now use the new data." : "Staged upload discarded.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rollback() {
    if (!window.confirm("Roll back to the previous dataset? The current one is deleted.")) return;
    setBusy("Rolling back…");
    setError(null);
    try {
      const res = await fetch("/api/admin/rollback", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Rollback failed");
      setDone("Rolled back to the previous dataset.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const delta = (a: number, b: number | undefined) =>
    b === undefined ? "" : ` (${a - b >= 0 ? "+" : ""}${(a - b).toLocaleString()})`;

  return (
    <div className="space-y-5">
      {/* drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center text-sm transition-colors ${
          dragOver ? "border-series-1 bg-series-1/5" : "border-baseline bg-surface"
        }`}
      >
        <p className="font-medium">Drop CSVs here or click to browse</p>
        <p className="mt-1 text-xs text-muted">
          tasks · hours · roles · users (email,password) — recognized by their headers, any subset
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && !summary && (
        <div className="rounded-xl border border-borderc bg-surface p-4">
          <ul className="space-y-1 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="truncate">{f.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted">{(f.size / 1024).toFixed(0)} KB</span>
                  <button
                    onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                    className="text-xs text-critical hover:underline"
                  >
                    remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={upload}
            disabled={!!busy}
            className="mt-4 rounded-lg bg-series-1 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Validate &amp; preview swap
          </button>
        </div>
      )}

      {/* diff summary + confirm */}
      {summary && (
        <div className="rounded-xl border border-borderc bg-surface p-4 text-sm">
          <h2 className="font-semibold">Review before swap</h2>
          <p className="mt-1 text-xs text-muted">
            Replacing: {summary.replaced.join(", ")} — everything else carries over unchanged.
          </p>
          <ul className="mt-3 space-y-1" style={{ fontVariantNumeric: "tabular-nums" }}>
            <li>Tasks: {summary.counts.tasks.toLocaleString()}{delta(summary.counts.tasks, summary.oldCounts?.tasks)}</li>
            <li>Hours rows: {summary.counts.hours.toLocaleString()}{delta(summary.counts.hours, summary.oldCounts?.hours)}</li>
            <li>Roles: {summary.counts.roles.toLocaleString()}{delta(summary.counts.roles, summary.oldCounts?.roles)}</li>
            <li>
              Login users: {summary.counts.users.toLocaleString()}
              {delta(summary.counts.users, summary.oldCounts?.users)}
              {summary.users.hashed > 0 && (
                <span className="text-muted"> — {summary.users.hashed} password(s) (re)hashed, {summary.users.reused} unchanged</span>
              )}
            </li>
            {(summary.skippedRows.tasks > 0 || summary.skippedRows.hours > 0 || summary.skippedRows.roles > 0) && (
              <li className="text-muted">
                Skipped malformed rows — tasks: {summary.skippedRows.tasks}, hours: {summary.skippedRows.hours}, roles: {summary.skippedRows.roles}
              </li>
            )}
          </ul>
          {summary.users.added.length > 0 && (
            <p className="mt-2 text-xs">
              <strong>{summary.users.added.length} new user(s):</strong>{" "}
              <span className="text-ink-2">{summary.users.added.slice(0, 10).join(", ")}{summary.users.added.length > 10 ? "…" : ""}</span>
            </p>
          )}
          {summary.users.removed.length > 0 && (
            <p className="mt-1 text-xs">
              <strong className="text-critical">{summary.users.removed.length} user(s) losing access:</strong>{" "}
              <span className="text-ink-2">{summary.users.removed.slice(0, 10).join(", ")}{summary.users.removed.length > 10 ? "…" : ""}</span>
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => confirm("confirm")}
              disabled={!!busy}
              className="rounded-lg bg-series-1 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Confirm swap
            </button>
            <button
              onClick={() => confirm("discard")}
              disabled={!!busy}
              className="rounded-lg border border-borderc px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {busy && <p className="text-sm text-ink-2">{busy}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-tint-critical px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}
      {done && <p className="rounded-lg bg-tint-good px-3 py-2 text-sm text-success-text">{done}</p>}

      {hasPrevious && (
        <div className="border-t border-grid pt-4">
          <button onClick={rollback} disabled={!!busy} className="text-xs text-critical hover:underline">
            Roll back to previous dataset
          </button>
        </div>
      )}
    </div>
  );
}
