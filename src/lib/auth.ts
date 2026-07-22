import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "agnus_session";
const SESSION_DAYS = 7;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET env var must be set (≥16 chars)");
  }
  return new TextEncoder().encode(s);
}

export interface Session {
  email: string;
  isAdmin: boolean;
}

export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().has(email.toLowerCase().trim());
}

export async function createSessionCookie(email: string): Promise<void> {
  const token = await new SignJWT({ email, isAdmin: isAdminEmail(email) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!email) return null;
    // Admin status re-derived from env on every request, not trusted from the token.
    return { email, isAdmin: isAdminEmail(email) };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (!s.isAdmin) redirect("/");
  return s;
}

// ---------- login rate limiting ----------
// In-memory sliding window per key (email and IP separately). Serverless
// caveat: each warm instance has its own counters — still enough to make
// online guessing impractical, and documented in the README.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, number[]>();

export function rateLimitCheck(keys: string[]): boolean {
  const now = Date.now();
  for (const key of keys) {
    const arr = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    attempts.set(key, arr);
    if (arr.length >= MAX_ATTEMPTS) return false;
  }
  return true;
}

export function rateLimitRecordFailure(keys: string[]): void {
  const now = Date.now();
  for (const key of keys) {
    const arr = attempts.get(key) ?? [];
    arr.push(now);
    attempts.set(key, arr);
  }
  if (attempts.size > 10_000) attempts.clear(); // memory guard
}
