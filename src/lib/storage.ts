/**
 * Versioned dataset storage.
 *
 * Production: Vercel Blob (when BLOB_READ_WRITE_TOKEN is set). Each dataset
 * version is a single JSON blob at `agnus/v-<timestamp>-<random>.json`; blob
 * URLs are unguessable and only ever fetched server-side. The newest version
 * is "current", the second newest is the one-step rollback. A `agnus/staging-*`
 * blob holds a validated-but-unconfirmed upload.
 *
 * Local dev: plain files under .data/ with the same naming scheme.
 */
import { list, put, del, get } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface StoredDataset {
  tasksCsv: string;
  hoursCsv: string;
  rolesCsv: string;
  /** email → { hash (bcrypt), fp (HMAC change-detection fingerprint) } */
  users: Record<string, { hash: string; fp: string }>;
  meta: {
    uploadedAt: string; // ISO
    uploadedBy: string;
    counts: { tasks: number; hours: number; roles: number; users: number };
    /** which of the four files were replaced in this version */
    replaced: string[];
  };
}

interface VersionRef {
  id: string; // pathname
  url?: string; // blob URL (prod only)
  uploadedAt: Date;
}

const PREFIX = "agnus/";
const DATA_DIR = path.join(process.cwd(), ".data");

const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

function newId(kind: "v" | "staging"): string {
  return `${PREFIX}${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`;
}

// ---------- adapters ----------

async function listAll(): Promise<VersionRef[]> {
  if (useBlob()) {
    const res = await list({ prefix: PREFIX });
    return res.blobs.map((b) => ({ id: b.pathname, url: b.url, uploadedAt: new Date(b.uploadedAt) }));
  }
  try {
    const files = await fs.readdir(path.join(DATA_DIR, "agnus"));
    const refs: VersionRef[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const st = await fs.stat(path.join(DATA_DIR, "agnus", f));
      refs.push({ id: `${PREFIX}${f}`, uploadedAt: st.mtime });
    }
    return refs;
  } catch {
    return [];
  }
}

async function readJson(ref: VersionRef): Promise<StoredDataset> {
  if (useBlob()) {
    // Private store: reads go through the SDK with the RW token, never plain fetch.
    // Every blob id is unique (timestamp+random), so CDN caching is safe.
    const res = await get(ref.id, { access: "private" });
    if (!res || res.statusCode !== 200) {
      throw new Error(`blob get failed: ${res?.statusCode ?? "not found"}`);
    }
    const text = await new Response(res.stream).text();
    return JSON.parse(text) as StoredDataset;
  }
  const raw = await fs.readFile(path.join(DATA_DIR, ref.id), "utf8");
  return JSON.parse(raw) as StoredDataset;
}

async function writeJson(id: string, data: StoredDataset): Promise<void> {
  const body = JSON.stringify(data);
  if (useBlob()) {
    await put(id, body, { access: "private", addRandomSuffix: false, contentType: "application/json" });
    return;
  }
  const file = path.join(DATA_DIR, id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, "utf8");
}

async function remove(ref: VersionRef): Promise<void> {
  if (useBlob()) {
    await del(ref.id);
    return;
  }
  await fs.rm(path.join(DATA_DIR, ref.id), { force: true });
}

// ---------- version logic ----------

/** Timestamp embedded in the id is authoritative for ordering (blob mtimes can tie). */
function idTime(ref: VersionRef): number {
  const m = ref.id.match(/-(\d{13})-/);
  return m ? Number(m[1]) : ref.uploadedAt.getTime();
}

async function versions(): Promise<VersionRef[]> {
  const all = await listAll();
  return all
    .filter((r) => r.id.startsWith(`${PREFIX}v-`))
    .sort((a, b) => idTime(b) - idTime(a)); // newest first
}

async function stagingRef(): Promise<VersionRef | null> {
  const all = await listAll();
  const st = all.filter((r) => r.id.startsWith(`${PREFIX}staging-`)).sort((a, b) => idTime(b) - idTime(a));
  // Only the newest staging blob counts; stragglers get cleaned on commit.
  return st[0] ?? null;
}

export async function getCurrent(): Promise<{ data: StoredDataset; versionId: string } | null> {
  const v = await versions();
  if (v.length === 0) return null;
  return { data: await readJson(v[0]), versionId: v[0].id };
}

export async function getPrevious(): Promise<{ data: StoredDataset; versionId: string } | null> {
  const v = await versions();
  if (v.length < 2) return null;
  return { data: await readJson(v[1]), versionId: v[1].id };
}

export async function saveStaging(data: StoredDataset): Promise<void> {
  const old = await stagingRef();
  await writeJson(newId("staging"), data);
  if (old) await remove(old).catch(() => {});
}

export async function getStaging(): Promise<StoredDataset | null> {
  const ref = await stagingRef();
  if (!ref) return null;
  return readJson(ref);
}

export async function clearStaging(): Promise<void> {
  const all = await listAll();
  for (const r of all.filter((x) => x.id.startsWith(`${PREFIX}staging-`))) {
    await remove(r).catch(() => {});
  }
}

/** Promote staging to the new current version; keep exactly one prior version. */
export async function commitStaging(): Promise<void> {
  const staged = await getStaging();
  if (!staged) throw new Error("nothing staged");
  await writeJson(newId("v"), staged);
  await clearStaging();
  const v = await versions();
  for (const old of v.slice(2)) await remove(old).catch(() => {});
}

/** One-step rollback: delete the newest version, exposing the previous one. */
export async function rollback(): Promise<boolean> {
  const v = await versions();
  if (v.length < 2) return false;
  await remove(v[0]);
  return true;
}
