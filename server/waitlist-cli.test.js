/**
 * Announcing a launch to a waitlist is a one-shot, irreversible act performed on
 * real inboxes. The rules that matter are therefore about NOT sending: not
 * twice, not to someone already told, and not at all on a dry run.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";

process.env.WAITLIST_DIR = mkdtempSync(path.join(tmpdir(), "appshots-waitlist-"));
process.env.PUBLIC_URL = "https://appshots.nextechlabs.tech";
const DIR = process.env.WAITLIST_DIR;

const { announce, announcementFor, exportCsv, pendingRecipients, readAnnounced } = await import("./waitlist-cli.js");

const seed = (rows) =>
  writeFileSync(path.join(DIR, "team.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

const ROWS = [
  { email: "ada@acme.com", plan: "team", at: "2026-07-01T00:00:00.000Z" },
  { email: "bob@acme.com", plan: "team", at: "2026-07-02T00:00:00.000Z" },
  { email: "ADA@acme.com", plan: "team", at: "2026-07-03T00:00:00.000Z" },
];

const quiet = () => {};

beforeEach(() => {
  for (const f of readdirSync(DIR)) rmSync(path.join(DIR, f), { force: true });
  seed(ROWS);
});

describe("pendingRecipients", () => {
  it("deduplicates addresses that differ only in case", () => {
    expect(pendingRecipients("team").map((r) => r.email)).toEqual(["ada@acme.com", "bob@acme.com"]);
  });

  it("skips anyone already told", () => {
    writeFileSync(path.join(DIR, "team.announced.json"), JSON.stringify({ sent: ["ada@acme.com"] }));
    expect(pendingRecipients("team").map((r) => r.email)).toEqual(["bob@acme.com"]);
  });
});

describe("the announcement itself", () => {
  it("says what shipped and where to go", () => {
    const { subject, text } = announcementFor("team");
    expect(subject).toMatch(/Team is ready/i);
    expect(text).toContain("https://appshots.nextechlabs.tech/pricing");
  });

  it("explains why they are getting it", () => {
    // An unexpected email from a list someone joined months ago reads as spam
    // unless it says which list, and that it is the last one.
    expect(announcementFor("team").text).toMatch(/joined the Team waitlist/i);
    expect(announcementFor("team").text).toMatch(/won't hear from it again/i);
  });
});

describe("announce", () => {
  it("sends nothing on a dry run", async () => {
    const send = vi.fn();
    const res = await announce("team", { dryRun: true, log: quiet, send });
    expect(send).not.toHaveBeenCalled();
    expect(res).toMatchObject({ sent: 0, pending: 2, dryRun: true });
    expect(existsSync(path.join(DIR, "team.announced.json"))).toBe(false);
  });

  it("mails everyone once and records it", async () => {
    const send = vi.fn(async () => {});
    const res = await announce("team", { log: quiet, send });
    expect(send).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ sent: 2, failed: 0 });
    expect([...readAnnounced("team")].sort()).toEqual(["ada@acme.com", "bob@acme.com"]);
  });

  it("is safe to run twice", async () => {
    const send = vi.fn(async () => {});
    await announce("team", { log: quiet, send });
    send.mockClear();
    const again = await announce("team", { log: quiet, send });
    expect(send).not.toHaveBeenCalled();
    expect(again.sent).toBe(0);
  });

  it("resumes where a crash left off", async () => {
    // The record is written per address, not at the end — so a failure halfway
    // through must not re-mail the people who already received it.
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("mailbox full"));
    const first = await announce("team", { log: quiet, send });
    expect(first).toMatchObject({ sent: 1, failed: 1 });

    const retry = vi.fn(async () => {});
    const second = await announce("team", { log: quiet, send: retry });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][0]).toBe("bob@acme.com");
    expect(second.sent).toBe(1);
  });

  it("honours --limit so a first batch can be watched", async () => {
    const send = vi.fn(async () => {});
    const res = await announce("team", { limit: 1, log: quiet, send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(res.sent).toBe(1);
    expect(pendingRecipients("team")).toHaveLength(1);
  });

  it("refuses to run without SMTP rather than reporting a silent success", async () => {
    const host = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    await expect(announce("team", { log: quiet })).rejects.toThrow("smtp-not-configured");
    if (host) process.env.SMTP_HOST = host;
  });
});

describe("exportCsv", () => {
  it("quotes every field so a comma in a note cannot shift a column", () => {
    seed([{ email: "ada@acme.com", plan: "team", at: "2026-07-01", note: "we need 5 seats, maybe 6" }]);
    const out = exportCsv("team", path.join(DIR, "out.csv"), { log: quiet });
    const csv = readFileSync(out, "utf8");
    expect(csv.split("\n")[0]).toBe("email,joined_at,uid,seats,note");
    expect(csv).toContain('"we need 5 seats, maybe 6"');
  });
});
