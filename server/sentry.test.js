import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseDsn, parseStack, safeHeaders, safeUrl, captureException, captureMessage,
  sentryConfigured, installProcessHandlers, _resetSentryBudget,
} from "./sentry.js";

const DSN = "https://publickey123@o55.ingest.sentry.io/4507";
const envelope = (call) => call[1].body.split("\n").map((l) => JSON.parse(l));

beforeEach(() => _resetSentryBudget());

describe("parseDsn", () => {
  it("pulls the ingest URL and key out of a DSN", () => {
    expect(parseDsn(DSN)).toEqual({
      publicKey: "publickey123",
      projectId: "4507",
      envelopeUrl: "https://o55.ingest.sentry.io/api/4507/envelope/",
    });
  });

  it("returns null for anything unusable rather than throwing", () => {
    for (const bad of ["", "not-a-url", "https://o55.ingest.sentry.io/4507", "https://key@host/", undefined]) {
      expect(parseDsn(bad)).toBeNull();
    }
  });
});

describe("parseStack", () => {
  it("turns V8 frames into Sentry frames, throwing frame last", () => {
    const stack = [
      "Error: boom",
      "    at inner (/app/server/a.js:10:5)",
      "    at outer (/app/server/b.js:20:7)",
    ].join("\n");
    const frames = parseStack(stack);
    expect(frames.map((f) => f.function)).toEqual(["outer", "inner"]);
    expect(frames[1]).toMatchObject({ filename: "/app/server/a.js", lineno: 10, colno: 5, in_app: true });
  });

  it("marks runtime and dependency frames as not in_app", () => {
    const frames = parseStack("Error\n    at x (node:internal/process:1:1)\n    at y (/app/node_modules/z/i.js:2:2)");
    expect(frames.every((f) => f.in_app === false)).toBe(true);
  });

  it("survives a missing or odd stack", () => {
    expect(parseStack()).toEqual([]);
    expect(parseStack("no frames here")).toEqual([]);
  });
});

describe("redaction", () => {
  it("never forwards credentials", () => {
    const out = safeHeaders({
      Authorization: "Bearer secret-token",
      Cookie: "session=abc",
      "stripe-signature": "t=1,v1=deadbeef",
      "user-agent": "Chrome",
    });
    expect(out.authorization).toBe("[redacted]");
    expect(out.cookie).toBe("[redacted]");
    expect(out["stripe-signature"]).toBe("[redacted]");
    expect(out["user-agent"]).toBe("Chrome");
    expect(JSON.stringify(out)).not.toContain("secret-token");
  });

  it("drops the query string, where tokens and emails hide", () => {
    expect(safeUrl("https://appshots.nextechlabs.tech/auth/action?oobCode=SECRET&email=a@b.c")).toBe(
      "https://appshots.nextechlabs.tech/auth/action",
    );
  });
});

describe("captureException", () => {
  it("sends a well-formed envelope", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await captureException(new TypeError("bad thing"), { tags: { scope: "api" } }, { dsn: DSN, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://o55.ingest.sentry.io/api/4507/envelope/");
    expect(init.headers["x-sentry-auth"]).toContain("sentry_key=publickey123");

    const [header, itemHeader, event] = envelope(fetchImpl.mock.calls[0]);
    expect(header.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(itemHeader).toEqual({ type: "event" });
    expect(event.exception.values[0]).toMatchObject({ type: "TypeError", value: "bad thing" });
    expect(event.tags).toEqual({ scope: "api" });
    expect(event.event_id).toBe(header.event_id);
  });

  it("accepts a non-Error without losing the message", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await captureException("just a string", {}, { dsn: DSN, fetchImpl });
    expect(envelope(fetchImpl.mock.calls[0])[2].exception.values[0].value).toBe("just a string");
  });

  it("attaches a redacted request when given one", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await captureException(new Error("x"), {
      request: { url: "/api/blob?token=abc", method: "POST", headers: { authorization: "Bearer t" } },
    }, { dsn: DSN, fetchImpl });
    const event = envelope(fetchImpl.mock.calls[0])[2];
    expect(event.request).toEqual({ url: "/api/blob", method: "POST", headers: { authorization: "[redacted]" } });
  });

  it("does nothing at all without a DSN — dev and tests stay silent", async () => {
    const fetchImpl = vi.fn();
    await captureException(new Error("x"), {}, { dsn: "", fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("swallows a transport failure instead of raising a second error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(captureException(new Error("x"), {}, { dsn: DSN, fetchImpl })).resolves.toBeNull();
  });
});

describe("rate limiting", () => {
  it("caps a crash loop instead of flooding the project", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const now = Date.UTC(2026, 8, 6, 12);
    for (let i = 0; i < 40; i++) {
      await captureException(new Error(`e${i}`), {}, { dsn: DSN, fetchImpl, now });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(30); // SENTRY_MAX_PER_MINUTE default
  });

  it("opens a fresh budget the next minute", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const now = Date.UTC(2026, 8, 6, 12);
    for (let i = 0; i < 35; i++) await captureException(new Error("x"), {}, { dsn: DSN, fetchImpl, now });
    await captureException(new Error("later"), {}, { dsn: DSN, fetchImpl, now: now + 61_000 });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(30);
  });
});

describe("captureMessage", () => {
  it("sends a message event with the given level", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await captureMessage("volume is filling up", "warning", {}, { dsn: DSN, fetchImpl });
    const event = envelope(fetchImpl.mock.calls[0])[2];
    expect(event.message).toEqual({ formatted: "volume is filling up" });
    expect(event.level).toBe("warning");
  });
});

describe("sentryConfigured", () => {
  it("reports whether reporting is actually wired", () => {
    expect(sentryConfigured(DSN)).toBe(true);
    expect(sentryConfigured("")).toBe(false);
  });
});

describe("installProcessHandlers", () => {
  it("subscribes to the two events that kill a Node process", () => {
    const on = vi.fn();
    installProcessHandlers({ on, exit: vi.fn() });
    expect(on.mock.calls.map((c) => c[0]).sort()).toEqual(["uncaughtException", "unhandledRejection"]);
  });
});
