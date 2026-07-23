# Project Agnus — Annotator Dashboard

Password-gated performance dashboard for Project Agnus contractors. Each
contractor logs in with their email + assigned password and sees their own AHT,
task output, and quality metrics. Admins can view anyone's dashboard, upload
fresh CSV dumps, and inspect data health.

## Architecture

- **Next.js 16 (App Router)** on Vercel. All auth and data access is
  server-side; no user data or password material reaches the client bundle.
- **Storage: Vercel Blob** (local dev: `.data/` on disk). Each dataset version
  is one JSON blob holding the three raw CSVs plus the bcrypt-hashed users map.
  The newest version is live; the second-newest is the one-step rollback.
  Uploading new data never requires a redeploy.
- **Auth**: email + password → bcrypt check server-side → HS256 JWT in an
  httpOnly cookie (7 days). Login is rate-limited (10 attempts / 15 min per
  email and per IP, in-memory per serverless instance). Login errors never
  reveal whether an email exists. Admin status comes from the `ADMIN_EMAILS`
  env var, re-checked on every request. Non-admins are hard-limited
  server-side to their own data.
- **Metric engine**: pure TypeScript in `src/lib/` (`parse.ts`, `hours.ts`,
  `metrics.ts`), unit-tested with fixture CSVs (`npm test`, 33 tests). All
  date bucketing is America/Los_Angeles; windows anchor to the latest date in
  the data (`data_through`), not the server clock.

Key semantics implemented (see `Dashboard Creation Instructions.md` for the full spec):
approved = `approved OR qa_approved` counted once; super-writer self-rows count
as writes and quality but never as reviews; review touches = `num_writer_attempts`;
reviewer AHT = hours ÷ all tasks reviewed; hours reconstructed from cumulative
snapshots (first row = `hours_last_1d`, negative diffs clamped and reported).
All windows — including all-time — sum the reconstructed dailies, so "all-time"
means "over the data currently loaded": dumps have shipped with partial history,
and dividing lifetime cumulative hours by a partial task window is meaningless.

## Local development

```bash
npm install
# seed .data/ from CSV dumps + create dev logins (password: test1234)
SESSION_SECRET=dev-only-secret-change-me-1234567890 \
  npx tsx scripts/seed-dev.ts <tasks.csv> <hours.csv> <roles.csv>
npm run dev
```

`.env.local` (already present for dev) needs `SESSION_SECRET`, `ADMIN_EMAILS`,
and optionally `ADMIN_BOOTSTRAP_PASSWORD`. Dev logins are listed in
`.data/dev-logins.csv` after seeding.

Other commands:

- `npm test` — unit tests for the metric engine.
- `npx tsx scripts/verify.ts <tasks> <hours> <roles> [email …]` — print a
  metrics table for named users (or an auto-picked trio) to eyeball against
  spreadsheet math.

## Deploying to Vercel (one-time setup)

1. Push this folder to a GitHub repo (private).
2. In [vercel.com](https://vercel.com): **Add New → Project**, import the repo.
   Framework preset: Next.js — defaults are fine.
3. In the project: **Storage → Create Database → Blob**, connect it to the
   project. This sets `BLOB_READ_WRITE_TOKEN` automatically.
4. **Settings → Environment Variables**, add (Production):
   - `SESSION_SECRET` — long random string (`openssl rand -base64 32`)
   - `ADMIN_EMAILS` — comma-separated admin emails
   - `ADMIN_BOOTSTRAP_PASSWORD` — a strong password (≥12 chars); lets admins
     log in before any users CSV exists and is the recovery path if a bad
     users CSV is uploaded
5. Deploy. Visit the URL, log in with an admin email + the bootstrap password.
6. First upload (all four CSVs at once): tasks, hours, roles, and users
   (`email,password`, one row per user). The first users ingest bcrypt-hashes
   every password and can take ~1 minute — the upload route allows up to 5.
7. Smoke test: log in as a contractor from the users CSV, check the three tabs.

## Weekly upkeep runbook

1. Log in as admin → **Upload data**.
2. Drag in the fresh CSVs (any subset — files are recognized by their
   headers; anything you don't upload carries over).
3. Review the diff summary (row counts, new/removed users). **Confirm swap.**
4. Glance at **Data health** for new anomalies (unknown emails, attempt
   outliers, negative hour diffs).
5. Mistake? **Roll back to previous dataset** on the upload page (one step).

Password changes: edit your offline users CSV and re-upload it — only changed
rows are re-hashed. Plaintext passwords exist only in your offline copy.

## Notes & caveats

- The dump's `hours_last_3d`/`hours_last_7d` are rolling 72h/168h clock
  windows, so the calendar-day reconstruction legitimately deviates from them;
  the data-health page reports the deviation distribution and lists only gaps
  over 8 hours.
- QA columns render as "—" until a dataset contains QA activity; QA metric
  plumbing (dates, approval dating) is already in place. Reviewer-side quality
  (errors missed, caught by QA) has schema support but deliberately no UI yet.
- Login rate-limit counters are per warm serverless instance; enough to stop
  online guessing, not a hard global limit.
- Blob URLs are unguessable and only ever fetched server-side, but treat the
  users CSV as sensitive: it is uploaded over HTTPS, hashed on ingest, and
  never stored in plaintext.
