import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createSessionCookie,
  isAdminEmail,
  rateLimitCheck,
  rateLimitRecordFailure,
} from "@/lib/auth";
import { verifyLogin } from "@/lib/data";
import { normEmail } from "@/lib/parse";

/** Bootstrap/recovery: admins may log in with ADMIN_BOOTSTRAP_PASSWORD, so the
 *  first upload is possible before any users.csv exists. */
function bootstrapLogin(email: string, password: string): boolean {
  const boot = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!boot || boot.length < 12 || !isAdminEmail(email)) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(boot);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const runtime = "nodejs";

const GENERIC = { error: "Invalid email or password." };

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(GENERIC, { status: 400 });
  }
  const email = normEmail(body.email);
  const password = body.password ?? "";
  if (!email || !password) return NextResponse.json(GENERIC, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const keys = [`e:${email}`, `ip:${ip}`];
  if (!rateLimitCheck(keys)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const ok = bootstrapLogin(email, password) || (await verifyLogin(email, password));
  if (!ok) {
    rateLimitRecordFailure(keys);
    return NextResponse.json(GENERIC, { status: 401 });
  }

  await createSessionCookie(email);
  return NextResponse.json({ ok: true });
}
