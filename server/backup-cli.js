/**
 * Backs up the persistent data volume (/app/data: blob store + Stripe entitlement
 * records) to S3-compatible object storage, and restores from it. Zero deps —
 * pure-Node tar+gzip (server/tarball.js) and a SigV4 client (server/s3.js).
 *
 *   node server/backup-cli.js backup            # snapshot → s3://bucket/<prefix>/appshots-<UTC>.tar.gz, then prune
 *   node server/backup-cli.js list              # show snapshots in the bucket
 *   node server/backup-cli.js restore <key> [--into <dir>]   # download + extract (default: the data dir)
 *   node server/backup-cli.js check             # verify config + bucket access without writing
 *
 * Env (runtime, on Coolify):
 *   BACKUP_S3_ENDPOINT   e.g. https://<region>.hostinger-object-storage-host   (as shown in hPanel)
 *   BACKUP_S3_BUCKET     bucket name
 *   BACKUP_S3_REGION     region id (default us-east-1; many providers ignore it)
 *   BACKUP_S3_ACCESS_KEY / BACKUP_S3_SECRET_KEY
 *   BACKUP_S3_VIRTUAL_HOST=true   only if the provider requires bucket.endpoint URLs
 *   BACKUP_PREFIX        key prefix (default "appshots")
 *   BACKUP_RETENTION_DAYS  delete snapshots older than this (default 30; 0 = keep all)
 *   BACKUP_DIR           directory to snapshot (default: parent of BLOB_DIR, i.e. /app/data)
 *
 * Run nightly as a Coolify "Scheduled Task" inside the app container.
 */
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { s3ConfigFromEnv, s3Configured, putObject, getObject, listObjects, deleteObject } from "./s3.js";
import { packDirectory, extractArchive, listArchive } from "./tarball.js";

const env = process.env;
const dataDir = () => env.BACKUP_DIR || path.dirname(env.BLOB_DIR || path.join(process.cwd(), "data", "blobs"));
const prefix = () => (env.BACKUP_PREFIX || "appshots").replace(/^\/+|\/+$/g, "");
const retentionDays = () => (env.BACKUP_RETENTION_DAYS === undefined ? 30 : Number(env.BACKUP_RETENTION_DAYS) || 0);
const stamp = (d = new Date()) => d.toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";

export function snapshotKey(now = new Date()) {
  return `${prefix()}/appshots-${stamp(now)}.tar.gz`;
}

export async function backup({ now = new Date(), log = console.log } = {}) {
  const cfg = s3ConfigFromEnv();
  if (!s3Configured(cfg)) throw new Error("backup-not-configured: set BACKUP_S3_* env vars");
  const dir = dataDir();
  if (!existsSync(dir)) throw new Error(`backup-dir-missing: ${dir}`);

  const archive = packDirectory(dir);
  const files = listArchive(archive).filter((e) => e.type === "file").length;
  const key = snapshotKey(now);
  await putObject(cfg, key, archive, { contentType: "application/gzip" });
  log(`backup ok: ${key} (${files} files, ${mb(archive.length)}) from ${dir}`);

  const pruned = await prune({ now, log, cfg });
  return { key, files, bytes: archive.length, pruned };
}

export async function prune({ now = new Date(), log = console.log, cfg = s3ConfigFromEnv() } = {}) {
  const days = retentionDays();
  if (!days) return [];
  const cutoff = now.getTime() - days * 86400_000;
  const objects = await listObjects(cfg, prefix() + "/");
  const old = objects.filter((o) => o.key?.endsWith(".tar.gz") && o.lastModified && new Date(o.lastModified).getTime() < cutoff);
  // Never delete the newest snapshot, even if it's older than the retention window.
  const newest = objects.reduce((a, b) => (!a || new Date(b.lastModified) > new Date(a.lastModified) ? b : a), null);
  const victims = old.filter((o) => o.key !== newest?.key);
  for (const o of victims) {
    await deleteObject(cfg, o.key);
    log(`pruned: ${o.key} (${o.lastModified})`);
  }
  return victims.map((o) => o.key);
}

export async function list({ log = console.log } = {}) {
  const cfg = s3ConfigFromEnv();
  if (!s3Configured(cfg)) throw new Error("backup-not-configured");
  const objects = (await listObjects(cfg, prefix() + "/")).sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1));
  if (!objects.length) log("(no snapshots yet)");
  for (const o of objects) log(`${o.lastModified}  ${mb(o.size).padStart(10)}  ${o.key}`);
  return objects;
}

export async function restore(key, { into = dataDir(), log = console.log } = {}) {
  const cfg = s3ConfigFromEnv();
  if (!s3Configured(cfg)) throw new Error("backup-not-configured");
  if (!key) throw new Error("restore-key-required");
  const archive = await getObject(cfg, key);
  const { files } = extractArchive(archive, into);
  log(`restore ok: ${key} → ${into} (${files} files)`);
  return { files, into };
}

export async function check({ log = console.log } = {}) {
  const cfg = s3ConfigFromEnv();
  log(`data dir: ${dataDir()} (${existsSync(dataDir()) ? "exists" : "MISSING"})`);
  log(`s3: ${cfg.endpoint || "(no endpoint)"} bucket=${cfg.bucket || "(none)"} region=${cfg.region} prefix=${prefix()} retention=${retentionDays()}d`);
  if (!s3Configured(cfg)) throw new Error("backup-not-configured");
  const objects = await listObjects(cfg, prefix() + "/");
  log(`bucket reachable — ${objects.length} snapshot(s) under ${prefix()}/`);
  return objects.length;
}

/* --------------------------------- CLI ---------------------------------- */
const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const into = rest.includes("--into") ? rest[rest.indexOf("--into") + 1] : undefined;
  const run = { backup, list, check, restore: () => restore(rest[0], into ? { into } : {}) }[cmd];
  if (!run) {
    console.error("usage: node server/backup-cli.js <backup|list|check|restore <key> [--into dir]>");
    process.exit(2);
  }
  run().catch((e) => {
    console.error("FAILED:", e.message, e.body ? `\n${e.body}` : "");
    process.exit(1);
  });
}
