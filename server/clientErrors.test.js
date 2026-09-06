import { describe, it, expect, vi, beforeEach } from "vitest";
import { reportClientError, _resetClientErrorBudget } from "./clientErrors.js";

let deps;

beforeEach(() => {
  _resetClientErrorBudget();
  deps = {
    captureException: vi.fn(),
    verifyIdToken: vi.fn(async (h) => {
      if (h !== "Bearer good") throw new Error("bad token");
      return "uid-9";
    }),
  };
});

const captured = () => deps.captureException.mock.calls[0];

describe("accepting a report", () => {
  it("forwards the crash with its context", async () => {
    await reportClientError(
      { message: "x is not a function", name: "TypeError", stack: "at a (/x.js:1:1)", url: "https://a/b", kind: "react" },
      { "user-agent": "Chrome" },
      deps,
    );
    const [error, context] = captured();
    expect(error.message).toBe("x is not a function");
    expect(error.name).toBe("TypeError");
    expect(context.tags).toEqual({ scope: "browser", kind: "react" });
    expect(context.extra.userAgent).toBe("Chrome");
  });

  it("ignores an empty report", async () => {
    await expect(reportClientError({}, {}, deps)).resolves.toEqual({ ok: false, reason: "empty" });
    expect(deps.captureException).not.toHaveBeenCalled();
  });
});

describe("identity", () => {
  it("attaches the user only when the token is real", async () => {
    await reportClientError({ message: "a" }, { authorization: "Bearer good" }, deps);
    expect(captured()[1].user).toEqual({ id: "uid-9" });
  });

  it("never trusts a uid claimed in the body", async () => {
    await reportClientError({ message: "a", user: { id: "admin" }, uid: "admin" }, {}, deps);
    expect(captured()[1].user).toBeUndefined();
  });

  it("still records the crash when the token is bad — a report is worth more than its author", async () => {
    await reportClientError({ message: "a" }, { authorization: "Bearer forged" }, deps);
    expect(deps.captureException).toHaveBeenCalled();
    expect(captured()[1].user).toBeUndefined();
  });
});

describe("hostile input", () => {
  it("clips every field to a sane size", async () => {
    await reportClientError(
      { message: "m".repeat(5000), stack: "s".repeat(20000), url: "u".repeat(2000), kind: "k".repeat(100) },
      {},
      deps,
    );
    const [error, context] = captured();
    expect(error.message.length).toBe(500);
    expect(error.stack.length).toBe(8000);
    expect(context.request.url.length).toBe(500);
    expect(context.tags.kind.length).toBe(40);
  });

  it("only honours a known level", async () => {
    await reportClientError({ message: "a", level: "fatal" }, {}, deps);
    expect(captured()[1].level).toBe("error");
    _resetClientErrorBudget();
    deps.captureException.mockClear();
    await reportClientError({ message: "b", level: "warning" }, {}, deps);
    expect(captured()[1].level).toBe("warning");
  });

  it("ignores non-string fields instead of forwarding objects", async () => {
    await reportClientError({ message: "a", stack: { toString: () => "nope" }, kind: 42 }, {}, deps);
    const [error, context] = captured();
    expect(error.stack).toBe("");
    expect(context.tags.kind).toBe("error");
  });
});

describe("rate limiting", () => {
  it("stops one broken page from flooding the project", async () => {
    const now = Date.UTC(2026, 8, 6, 12);
    for (let i = 0; i < 70; i++) await reportClientError({ message: `e${i}` }, {}, { ...deps, now });
    expect(deps.captureException.mock.calls.length).toBe(60); // CLIENT_ERROR_MAX_PER_MINUTE
  });

  it("answers without an error when throttled", async () => {
    const now = Date.UTC(2026, 8, 6, 12);
    for (let i = 0; i < 60; i++) await reportClientError({ message: "x" }, {}, { ...deps, now });
    await expect(reportClientError({ message: "x" }, {}, { ...deps, now })).resolves.toEqual({
      ok: false,
      reason: "rate-limited",
    });
  });
});
