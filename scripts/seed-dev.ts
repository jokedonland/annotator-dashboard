/**
 * Local-dev seeder: loads the three real CSV dumps into .data/ storage and
 * creates a small set of fake login users (never the real users CSV).
 *
 * Usage: npx tsx scripts/seed-dev.ts <tasks.csv> <hours.csv> <roles.csv>
 *
 * Logins created (password for all: test1234):
 *   admin@example.com (add to ADMIN_EMAILS in .env.local) + the 5 most active
 *   contractor emails from the roles file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { saveStaging, commitStaging } from "../src/lib/storage";
import { parseRoles, parseTasks, parseHours } from "../src/lib/parse";
import { ingestUsers } from "../src/lib/data";

const [tasksPath, hoursPath, rolesPath] = process.argv.slice(2);
if (!tasksPath || !hoursPath || !rolesPath) {
  console.error("usage: tsx scripts/seed-dev.ts <tasks.csv> <hours.csv> <roles.csv>");
  process.exit(1);
}
if (process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Refusing to seed: BLOB_READ_WRITE_TOKEN is set — this would write to production blob storage.");
  process.exit(1);
}

const tasksCsv = readFileSync(tasksPath, "utf8");
const hoursCsv = readFileSync(hoursPath, "utf8");
const rolesCsv = readFileSync(rolesPath, "utf8");

const t = parseTasks(tasksCsv);
const h = parseHours(hoursCsv);
const r = parseRoles(rolesCsv);

// Most active contractors get dev logins so there's something to look at.
const activity = new Map<string, number>();
for (const task of t.tasks) {
  activity.set(task.writerEmail, (activity.get(task.writerEmail) ?? 0) + 1);
  if (task.reviewerEmail) activity.set(task.reviewerEmail, (activity.get(task.reviewerEmail) ?? 0) + 1);
}
const topContractors = r.roles
  .map((x) => x.contractorEmail)
  .sort((a, b) => (activity.get(b) ?? 0) - (activity.get(a) ?? 0))
  .slice(0, 5);

const PASSWORD = "test1234";
const rows = [
  { email: "admin@example.com", password: PASSWORD },
  ...topContractors.map((email) => ({ email, password: PASSWORD })),
];
const { users } = ingestUsers(rows, undefined);

async function main() {
  await saveStaging({
    tasksCsv,
    hoursCsv,
    rolesCsv,
    users,
    meta: {
      uploadedAt: new Date().toISOString(),
      uploadedBy: "seed-dev",
      counts: {
        tasks: t.tasks.length,
        hours: h.snapshots.length,
        roles: r.roles.length,
        users: rows.length,
      },
      replaced: ["tasks", "hours", "roles", "users"],
    },
  });
  await commitStaging();

  const summary = rows.map((u) => `${u.email},${PASSWORD}`).join("\n");
  writeFileSync(".data/dev-logins.csv", `email,password\n${summary}\n`);
  console.log("Seeded .data/ with the dataset. Dev logins (password test1234):");
  for (const u of rows) console.log(" ", u.email);
  console.log("Also written to .data/dev-logins.csv");
}

main();
