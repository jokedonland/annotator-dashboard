import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rollback } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ok = await rollback();
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "No previous dataset to roll back to." }, { status: 400 });
}
