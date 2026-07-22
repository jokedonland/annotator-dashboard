import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { commitStaging, clearStaging } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "discard") {
    await clearStaging();
    return NextResponse.json({ ok: true, discarded: true });
  }
  try {
    await commitStaging();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
