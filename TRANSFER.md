# Taking over the Project Agnus dashboard

You've just received (or are about to receive) the GitHub repo for the
Project Agnus annotator dashboard. This guide takes you from that point to a
fully working instance under **your** Vercel account. Budget ~15 minutes.

Nothing from the previous owner's hosting carries over — no shared secrets, no
shared storage. You create your own, and the app rebuilds itself from the repo
plus the CSVs you upload.

## What you need before starting

- A GitHub account that now owns (or has access to) this repo.
- A Vercel account (free Hobby tier is fine) — sign up at vercel.com with
  your GitHub login.
- The four CSVs:
  - **tasks dump**, **hours dump**, **roles dump** — the usual exports.
  - **users CSV** — the master login list, format `email,password`, one row
    per person, using their @mercor.expert email. Get this from the previous
    admin through a secure channel, or build a fresh one (fresh is cleaner:
    everyone gets a new password and the old file stops mattering).

## Step 1 — Accept the repo transfer

GitHub emails you an invitation when the previous owner initiates the
transfer. Accept it. The repo (with full history) now lives under your
account. Keep it **private**.

## Step 2 — Import the project into Vercel

1. Go to vercel.com → **Add New… → Project**.
2. Pick the `annotator-dashboard` repo from the list (install the Vercel
   GitHub app for your account if prompted).
3. Framework preset shows **Next.js** — leave every setting at its default.
4. Click **Deploy**. This first build will succeed but the app will have no
   data and no way to log in yet — that's expected. Continue below.

## Step 3 — Create the Blob store (where uploaded data lives)

1. In the new Vercel project: **Storage** tab → **Create Database → Blob**.
2. Name it anything (e.g. `agnus-data`), choose **Private** access if asked,
   and connect it to the project.
3. This automatically adds the `BLOB_READ_WRITE_TOKEN` environment variable —
   you never handle it manually.

## Step 4 — Set the three environment variables

Project → **Settings → Environment Variables**. Add each for the
**Production** environment:

| Name | Value |
|---|---|
| `SESSION_SECRET` | A long random string — run `openssl rand -base64 32` in a terminal, or mash out 40+ random characters. Never reuse the previous owner's. |
| `ADMIN_EMAILS` | Comma-separated admin emails, e.g. `you@example.com,colleague@example.com`. These addresses get the admin view; everyone else sees only their own data. |
| `ADMIN_BOOTSTRAP_PASSWORD` | A strong password (12+ chars) you invent. It lets any `ADMIN_EMAILS` address log in even before a users CSV exists — it's also your recovery login if a bad users CSV ever locks you out. |

**Important:** env vars only take effect on the *next* deployment. After
adding all three, go to **Deployments**, open the ⋯ menu on the latest one,
and click **Redeploy**.

## Step 5 — Log in and upload the data

1. Open your production URL (shown on the project Overview, something like
   `annotator-dashboard-<yourteam>.vercel.app`).
2. Log in with an email from `ADMIN_EMAILS` + your bootstrap password.
3. You'll land on a "No data yet" page — follow the link to the upload page.
4. Drag in **all four CSVs** at once. Files are recognized by their headers,
   so names don't matter.
5. The first users upload bcrypt-hashes every password — with a few hundred
   users this takes about a minute. Wait for the summary.
6. Review the row counts, then **Confirm swap**.

## Step 6 — Verify

- Use the **View as…** search in the header to open a busy contractor's
  dashboard; check the AHT, Tasks, and Quality tabs look sane.
- Glance at **Data health** for surprises (unknown emails, malformed rows).
- Log in as one contractor from the users CSV to confirm normal (non-admin)
  login works and only shows their own data.
- Tell contractors the new URL — it changed when hosting moved.

## Ongoing upkeep (every day or two)

1. Log in as admin → **Upload data**.
2. Drop the fresh CSVs — any subset; whatever you don't upload carries over
   unchanged. (You only re-upload the users CSV when access or passwords
   change; unchanged passwords aren't re-hashed.)
3. Review the diff summary → **Confirm swap**.
4. If something looks wrong afterward, the upload page has a one-click
   **Roll back to previous dataset**.

The README covers architecture, metric definitions, and local development if
you ever need to change code — pushes to `main` auto-deploy.

## Notes for the previous owner

- After the new instance is verified: delete the old Vercel project
  (Settings → Advanced → Delete Project) and its Blob store (Storage tab) so
  contractor data and password hashes don't linger in the old account.
- The commit history keeps the old author identity; nothing sensitive is in
  it (no CSVs, secrets, or hashes were ever committed).

## Troubleshooting

- **"Invalid email or password" with the bootstrap password** — the email
  you're using isn't in `ADMIN_EMAILS`, or you edited env vars and haven't
  redeployed since.
- **Deployment "Blocked"** — Vercel rejects commits whose git author email
  doesn't look valid. Set `git config user.email` to your GitHub email (or
  your GitHub noreply address), amend, and push again.
- **Everyone shows 0 errors after an upload** — the export format probably
  changed again. Check **Data health → Unparseable ERROR_CATEGORY** and the
  malformed-row counts first, then compare the new file's header row against
  the old one.
- **Upload page rejects a file** — it identifies files by header row; open
  the CSV and make sure the first line contains the expected columns
  (`TASK_ID…`, `MERCOR_EXPERT_EMAIL…`, `Contractor Email…`, or
  `email,password`).
