import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { backup, prune, restore, snapshotKey } from "./backup-cli.js";
import { listArchive, packDirectory } from "./tarball.js";

const ENV = {
  BACKUP_S3_ENDPOINT: "https://objects.example.test",
  BACKUP_S3_BUCKET: "appshots-backups",
  BACKUP_S3_ACCESS_KEY: "AK",
  BACKUP_S3_SECRET_KEY: "SK",
  BACKUP_PREFIX: "appshots",
  BACKUP_RETENTION_DAYS: "30",
};
const saved = {};
let dataDir;

const listXml = (items) =>
  `<ListBucketResult><IsTruncated>false</IsTruncated>${items
    .map((i) => `<Contents><Key>${i.key}</Key><LastModified>${i.lastModified}</LastModified><Size>${i.size || 1}</Size></Contents>`)
    .join("")}</ListBucketResult>`;

beforeEach(() => {
  for (const k of Object.keys(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = ENV[k];
  }
  dataDir = mkdtempSync(path.join(tmpdir(), "appshots-data-"));
  mkdirSync(path.join(dataDir, "subscriptions"), { recursive: true });
  mkdirSync(path.join(dataDir, "blobs"), { recursive: true });
  writeFileSync(path.join(dataDir, "subscriptions", "u1.json"), '{"plan":"pro"}');
  writeFileSync(path.join(dataDir, "blobs", "a.bin"), Buffer.from([1, 2, 3]));
  process.env.BACKUP_DIR = dataDir;
});
afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  delete process.env.BACKUP_DIR;
  vi.unstubAllGlobals();
});

describe("backup-cli", () => {
  it("names snapshots by UTC time under the prefix", () => {
    expect(snapshotKey(new Date("2026-09-06T03:00:15.123Z"))).toBe("appshots/appshots-2026-09-06T03-00-15Z.tar.gz");
  });

  it("packs the data dir, uploads it, and prunes snapshots older than the retention window (never the newest)", async () => {
    const now = new Date("2026-09-06T03:00:00Z");
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body });
      if (init?.method === "GET" && String(url).includes("list-type=2")) {
        return {
          ok: true,
          text: async () =>
            listXml([
              { key: "appshots/appshots-2026-07-01T03-00-00Z.tar.gz", lastModified: "2026-07-01T03:00:00.000Z" }, // 67 days old → prune
              { key: "appshots/appshots-2026-08-20T03-00-00Z.tar.gz", lastModified: "2026-08-20T03:00:00.000Z" }, // 17 days → keep
              { key: "appshots/appshots-2026-09-06T03-00-00Z.tar.gz", lastModified: "2026-09-06T03:00:00.000Z" }, // just uploaded
            ]),
        };
      }
      return { ok: true, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    });
    const log = [];
    const out = await backup({ now, log: (l) => log.push(l) });
    expect(out.key).toBe("appshots/appshots-2026-09-06T03-00-00Z.tar.gz");
    expect(out.files).toBe(2);
    expect(out.pruned).toEqual(["appshots/appshots-2026-07-01T03-00-00Z.tar.gz"]);

    const put = calls.find((c) => c.method === "PUT");
    expect(put.url).toBe("https://objects.example.test/appshots-backups/appshots/appshots-2026-09-06T03-00-00Z.tar.gz");
    const names = listArchive(put.body).map((e) => e.name).sort();
    expect(names).toEqual(["blobs/", "blobs/a.bin", "subscriptions/", "subscriptions/u1.json"]);
    const del = calls.filter((c) => c.method === "DELETE").map((c) => c.url);
    expect(del).toEqual(["https://objects.example.test/appshots-backups/appshots/appshots-2026-07-01T03-00-00Z.tar.gz"]);
    expect(log.some((l) => l.startsWith("backup ok:"))).toBe(true);
  });

  it("keeps the newest snapshot even when everything is past retention", async () => {
    vi.stubGlobal("fetch", async (url, init) => {
      if (init?.method === "GET") return { ok: true, text: async () => listXml([{ key: "appshots/appshots-2025-01-01T00-00-00Z.tar.gz", lastModified: "2025-01-01T00:00:00.000Z" }]) };
      return { ok: true, text: async () => "" };
    });
    expect(await prune({ now: new Date("2026-09-06T00:00:00Z"), log: () => {} })).toEqual([]);
  });

  it("restores an archive from the bucket into a directory", async () => {
    const archive = packDirectory(dataDir);
    vi.stubGlobal("fetch", async () => ({ ok: true, text: async () => "", arrayBuffer: async () => archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) }));
    const into = mkdtempSync(path.join(tmpdir(), "appshots-restore-"));
    const out = await restore("appshots/appshots-2026-09-06T03-00-00Z.tar.gz", { into, log: () => {} });
    expect(out.files).toBe(2);
    expect(readFileSync(path.join(into, "subscriptions", "u1.json"), "utf8")).toBe('{"plan":"pro"}');
  });

  it("refuses to run without configuration", async () => {
    delete process.env.BACKUP_S3_SECRET_KEY;
    await expect(backup({ log: () => {} })).rejects.toThrow(/backup-not-configured/);
  });
});
