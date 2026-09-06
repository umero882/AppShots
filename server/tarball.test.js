import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { gunzipSync, gzipSync } from "zlib";
import { packDirectory, listArchive, extractArchive } from "./tarball.js";

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "appshots-tar-"));
  mkdirSync(path.join(dir, "blobs", "deep", "er"), { recursive: true });
  mkdirSync(path.join(dir, "subscriptions", "customers"), { recursive: true });
  writeFileSync(path.join(dir, "subscriptions", "uid1.json"), JSON.stringify({ plan: "pro", mode: "live" }));
  writeFileSync(path.join(dir, "subscriptions", "customers", "cus_1.json"), JSON.stringify({ uid: "uid1" }));
  const bin = Buffer.alloc(1500);
  for (let i = 0; i < bin.length; i++) bin[i] = (i * 31) & 0xff;
  writeFileSync(path.join(dir, "blobs", "img.bin"), bin);
  writeFileSync(path.join(dir, "blobs", "deep", "er", "empty.txt"), "");
  writeFileSync(path.join(dir, "blobs", "ünïcode name.txt"), "héllo");
  return { dir, bin };
}

describe("tarball", () => {
  it("round-trips nested directories, binary, empty and unicode files", () => {
    const { dir, bin } = fixture();
    const gz = packDirectory(dir);
    const entries = listArchive(gz);
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(
      [
        "blobs/",
        "blobs/deep/",
        "blobs/deep/er/",
        "blobs/deep/er/empty.txt",
        "blobs/img.bin",
        "blobs/ünïcode name.txt",
        "subscriptions/",
        "subscriptions/customers/",
        "subscriptions/customers/cus_1.json",
        "subscriptions/uid1.json",
      ].sort()
    );
    expect(entries.find((e) => e.name === "blobs/img.bin").data.equals(bin)).toBe(true);
    expect(entries.find((e) => e.name === "blobs/ünïcode name.txt").data.toString()).toBe("héllo");

    const out = mkdtempSync(path.join(tmpdir(), "appshots-untar-"));
    const { files } = extractArchive(gz, out);
    expect(files).toBe(5);
    expect(readFileSync(path.join(out, "blobs", "img.bin")).equals(bin)).toBe(true);
    expect(JSON.parse(readFileSync(path.join(out, "subscriptions", "uid1.json"), "utf8"))).toEqual({ plan: "pro", mode: "live" });
    expect(existsSync(path.join(out, "blobs", "deep", "er", "empty.txt"))).toBe(true);
  });

  it("produces a valid ustar stream (512-byte blocks, correct checksums, end-of-archive)", () => {
    const { dir } = fixture();
    const raw = gunzipSync(packDirectory(dir));
    expect(raw.length % 512).toBe(0);
    // First header: checksum field verifies.
    const h = raw.subarray(0, 512);
    const stored = parseInt(h.toString("ascii", 148, 156).replace(/\0| /g, ""), 8);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    expect(sum).toBe(stored);
    expect(h.toString("ascii", 257, 262)).toBe("ustar");
    // Archive ends with two zero blocks.
    expect(raw.subarray(raw.length - 1024).every((b) => b === 0)).toBe(true);
  });

  it("supports the filter hook and refuses path-traversal entries on extract", () => {
    const { dir } = fixture();
    const gz = packDirectory(dir, { filter: (rel) => !rel.startsWith("blobs") });
    expect(listArchive(gz).map((e) => e.name).every((n) => n.startsWith("subscriptions"))).toBe(true);

    // Hand-craft an archive with an escaping name.
    const evil = Buffer.alloc(512 * 3, 0);
    evil.write("../escape.txt", 0, "utf8");
    evil.write("0000644\0", 100, "ascii");
    evil.write("00000000001\0", 124, "ascii");
    evil.write("0", 156, "ascii");
    evil.write("ustar\0", 257, "ascii");
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : evil[i];
    evil.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
    evil.write("x", 512, "utf8");
    const out = mkdtempSync(path.join(tmpdir(), "appshots-evil-"));
    expect(() => extractArchive(gzipSync(evil), out)).toThrow(/tar-unsafe-path/);
  });
});
