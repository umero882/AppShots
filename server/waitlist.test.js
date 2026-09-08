/**
 * The waitlist is an archive now — `POST /api/waitlist` was retired when Team
 * shipped. What still matters is that the collected list stays READABLE, because
 * the pricing page promised those people an email and waitlist-cli.js is what
 * sends it. A list that cannot be read is a promise that cannot be kept.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";

process.env.WAITLIST_DIR = mkdtempSync(path.join(tmpdir(), "appshots-wl-"));
const DIR = process.env.WAITLIST_DIR;

const { readWaitlist } = await import("./waitlist.js");

const write = (plan, lines) => writeFileSync(path.join(DIR, `${plan}.jsonl`), lines.join("\n"));

beforeEach(() => {
  for (const f of readdirSync(DIR)) rmSync(path.join(DIR, f), { force: true });
});

describe("readWaitlist", () => {
  it("returns the entries in the order they joined", () => {
    write("team", [
      JSON.stringify({ email: "ada@acme.com", at: "2026-07-01T00:00:00.000Z" }),
      JSON.stringify({ email: "bob@acme.com", at: "2026-07-02T00:00:00.000Z" }),
      "",
    ]);
    expect(readWaitlist("team").map((e) => e.email)).toEqual(["ada@acme.com", "bob@acme.com"]);
  });

  it("skips a corrupt line instead of losing the whole list", () => {
    // A half-written record from a crash is exactly when someone needs to read
    // the rest of it.
    write("team", [
      JSON.stringify({ email: "ada@acme.com" }),
      '{"email":"truncated',
      JSON.stringify({ email: "bob@acme.com" }),
    ]);
    expect(readWaitlist("team").map((e) => e.email)).toEqual(["ada@acme.com", "bob@acme.com"]);
  });

  it("is empty, not an error, when nobody ever joined", () => {
    expect(readWaitlist("team")).toEqual([]);
    expect(readWaitlist("nonexistent-plan")).toEqual([]);
  });
});
