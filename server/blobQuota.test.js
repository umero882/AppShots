import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// blob.js reads BLOB_DIR once, at import.
process.env.BLOB_DIR = mkdtempSync(path.join(tmpdir(), "appshots-blobs-"));
const DIR = process.env.BLOB_DIR;

const { usedBytes, addUsage, rebuildUsage, storageQuotaFor, STORAGE_QUOTAS, deleteBlobsForUid } =
  await import("./blob.js");

const id = (n) => String(n).padStart(32, "0").replace(/[^0-9a-f]/g, "0");

function putBlob(uid, size, n) {
  const blobId = id(n);
  writeFileSync(path.join(DIR, blobId), Buffer.alloc(size));
  writeFileSync(path.join(DIR, blobId + ".meta"), JSON.stringify({ uid, size, contentType: "image/png" }));
  return blobId;
}

beforeEach(() => {
  for (const f of readdirSync(DIR)) rmSync(path.join(DIR, f), { recursive: true, force: true });
});

describe("storageQuotaFor", () => {
  it("gives paid plans more room", () => {
    expect(storageQuotaFor("free")).toBeLessThan(storageQuotaFor("pro"));
    expect(storageQuotaFor("pro")).toBeLessThan(storageQuotaFor("team"));
  });

  it("treats an unknown or missing plan as free — never as unlimited", () => {
    expect(storageQuotaFor("enterprise")).toBe(STORAGE_QUOTAS.free);
    expect(storageQuotaFor(undefined)).toBe(STORAGE_QUOTAS.free);
  });
});

describe("counting stored bytes", () => {
  it("rebuilds from the metadata when no counter exists", () => {
    putBlob("u1", 1000, 1);
    putBlob("u1", 2500, 2);
    expect(usedBytes("u1")).toBe(3500);
  });

  it("counts only the owner's blobs", () => {
    putBlob("u1", 1000, 1);
    putBlob("u2", 9999, 2);
    expect(usedBytes("u1")).toBe(1000);
    expect(usedBytes("u2")).toBe(9999);
  });

  it("caches the total, then follows deltas", () => {
    putBlob("u1", 1000, 1);
    expect(usedBytes("u1")).toBe(1000);
    addUsage("u1", 500, 1);
    expect(usedBytes("u1")).toBe(1500);
    addUsage("u1", -500, -1);
    expect(usedBytes("u1")).toBe(1000);
  });

  it("does not double-count an upload that triggered the first rebuild", () => {
    // The rebuild scans metadata that already includes the new blob, so the
    // delta must be skipped — otherwise the first upload after deploy counts twice.
    putBlob("u1", 4000, 1);
    addUsage("u1", 4000, 1);
    expect(usedBytes("u1")).toBe(4000);
  });

  it("never reports a negative total", () => {
    putBlob("u1", 100, 1);
    usedBytes("u1");
    addUsage("u1", -99999, -1);
    expect(usedBytes("u1")).toBeGreaterThanOrEqual(0);
  });

  it("recovers the true number from disk on rebuild", () => {
    putBlob("u1", 100, 1);
    addUsage("u1", 999999, 1); // pretend the counter drifted
    expect(rebuildUsage("u1").bytes).toBe(100);
    expect(usedBytes("u1")).toBe(100);
  });

  it("ignores unreadable metadata rather than throwing", () => {
    putBlob("u1", 100, 1);
    writeFileSync(path.join(DIR, id(2) + ".meta"), "not json");
    expect(rebuildUsage("u1").bytes).toBe(100);
  });

  it("rejects a uid that could escape the directory", () => {
    expect(usedBytes("../../etc")).toBe(0);
    expect(() => addUsage("../../etc", 100)).not.toThrow();
    expect(existsSync(path.join(DIR, "..", "..", "etc.json"))).toBe(false);
  });
});

describe("deleting an account", () => {
  it("removes the blobs and the counter with them", () => {
    putBlob("u1", 1000, 1);
    putBlob("u1", 2000, 2);
    putBlob("u2", 3000, 3);
    expect(usedBytes("u1")).toBe(3000);

    expect(deleteBlobsForUid("u1")).toBe(2);
    expect(usedBytes("u1")).toBe(0);
    expect(usedBytes("u2")).toBe(3000); // untouched
  });

  it("leaves the quota directory alone when scanning for blobs", () => {
    putBlob("u1", 1000, 1);
    usedBytes("u1"); // creates .quota/
    mkdirSync(path.join(DIR, ".quota"), { recursive: true });
    expect(() => deleteBlobsForUid("u2")).not.toThrow();
    expect(usedBytes("u1")).toBe(1000);
  });
});
