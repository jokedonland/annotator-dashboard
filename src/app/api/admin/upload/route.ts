import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrent, saveStaging, StoredDataset } from "@/lib/storage";
import { parseTasks, parseHours, parseRoles } from "@/lib/parse";
import { ingestUsers, parseUsersCsv } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 300; // first users.csv ingest bcrypts every row

type FileKind = "tasks" | "hours" | "roles" | "users";

function sniffKind(text: string): FileKind | null {
  const header = (text.slice(0, 2000).split("\n")[0] ?? "").toLowerCase();
  if (header.includes("task_id")) return "tasks";
  if (header.includes("mercor_expert_email")) return "hours";
  if (header.includes("contractor email")) return "roles";
  if (header.includes("email") && header.includes("password")) return "users";
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files received." }, { status: 400 });
  }

  const provided = new Map<FileKind, { name: string; text: string }>();
  const unrecognized: string[] = [];
  for (const f of files) {
    const text = await f.text();
    const kind = sniffKind(text);
    if (!kind) unrecognized.push(f.name);
    else provided.set(kind, { name: f.name, text });
  }
  if (unrecognized.length) {
    return NextResponse.json(
      { error: `Could not recognize by header: ${unrecognized.join(", ")}. Expected the tasks, hours, roles, or users CSV.` },
      { status: 400 }
    );
  }

  const current = (await getCurrent())?.data ?? null;
  const missing = (["tasks", "hours", "roles"] as const).filter(
    (k) => !provided.has(k) && !current
  );
  if (missing.length || (!provided.has("users") && !current)) {
    return NextResponse.json(
      { error: `First upload must include all four CSVs. Missing: ${[...missing, ...(!provided.has("users") ? ["users"] : [])].join(", ")}.` },
      { status: 400 }
    );
  }

  // Validate each provided file by actually parsing it.
  const problems: string[] = [];
  const tasksCsv = provided.get("tasks")?.text ?? current!.tasksCsv;
  const hoursCsv = provided.get("hours")?.text ?? current!.hoursCsv;
  const rolesCsv = provided.get("roles")?.text ?? current!.rolesCsv;

  const t = parseTasks(tasksCsv);
  const h = parseHours(hoursCsv);
  const r = parseRoles(rolesCsv);
  if (provided.has("tasks") && t.tasks.length === 0) problems.push("tasks CSV parsed to 0 rows");
  if (provided.has("hours") && h.snapshots.length === 0) problems.push("hours CSV parsed to 0 rows");
  if (provided.has("roles") && r.roles.length === 0) problems.push("roles CSV parsed to 0 rows");

  let users = current?.users ?? {};
  let userStats = { hashed: 0, reused: 0 };
  if (provided.has("users")) {
    const rows = parseUsersCsv(provided.get("users")!.text);
    if (rows.length === 0) problems.push("users CSV parsed to 0 rows (need email,password columns)");
    else {
      const res = ingestUsers(rows, current?.users);
      users = res.users;
      userStats = { hashed: res.hashed, reused: res.reused };
    }
  }
  if (problems.length) {
    return NextResponse.json({ error: problems.join("; ") }, { status: 400 });
  }

  const staged: StoredDataset = {
    tasksCsv,
    hoursCsv,
    rolesCsv,
    users,
    meta: {
      uploadedAt: new Date().toISOString(),
      uploadedBy: session.email,
      counts: {
        tasks: t.tasks.length,
        hours: h.snapshots.length,
        roles: r.roles.length,
        users: Object.keys(users).length,
      },
      replaced: [...provided.keys()],
    },
  };
  await saveStaging(staged);

  // Diff summary vs current for the confirm screen.
  const oldEmails = new Set(current ? Object.keys(current.users) : []);
  const newEmails = new Set(Object.keys(users));
  const addedUsers = [...newEmails].filter((e) => !oldEmails.has(e)).sort();
  const removedUsers = [...oldEmails].filter((e) => !newEmails.has(e)).sort();

  let oldCounts = null;
  if (current) oldCounts = current.meta.counts;

  return NextResponse.json({
    ok: true,
    replaced: [...provided.keys()],
    counts: staged.meta.counts,
    oldCounts,
    users: { added: addedUsers, removed: removedUsers, ...userStats },
    skippedRows: {
      tasks: t.skipped.length,
      hours: h.skipped.length,
      roles: r.skipped.length,
    },
  });
}
