import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// The module reads its config once, at import — set it up first.
process.env.USAGE_DIR = mkdtempSync(path.join(tmpdir(), "appshots-usage-"));
const DIR = process.env.USAGE_DIR;

const { consume, refund, usageSummary, limitFor, utcDay, resetAt, QUOTAS, GLOBAL_DAILY, _resetUsage } =
  await import("./usage.js");

const T0 = Date.UTC(2026, 8, 6, 12, 0, 0); // 2026-09-06T12:00Z
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const grab = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
};

beforeEach(() => _resetUsage());

describe("limitFor", () => {
  it("scales with the plan", () => {
    expect(limitFor("free", "image")).toBeLessThan(limitFor("pro", "image"));
    expect(limitFor("pro", "image")).toBeLessThan(limitFor("team", "image"));
  });

  it("treats an unknown or missing plan as free — never as unlimited", () => {
    expect(limitFor("enterprise", "image")).toBe(QUOTAS.free.image);
    expect(limitFor(undefined, "suggest")).toBe(QUOTAS.free.suggest);
  });

  it("has no quota for an unknown kind", () => {
    expect(limitFor("pro", "mine-bitcoin")).toBe(0);
  });
});

describe("consume", () => {
  it("counts down the daily allowance", () => {
    const first = consume({ uid: "u1", plan: "free", kind: "image", now: T0 });
    expect(first).toMatchObject({ kind: "image", plan: "free", limit: QUOTAS.free.image, used: 1 });
    expect(first.remaining).toBe(QUOTAS.free.image - 1);

    const second = consume({ uid: "u1", plan: "free", kind: "image", now: T0 + MINUTE });
    expect(second.used).toBe(2);
  });

  it("persists to disk so a redeploy cannot reset someone's allowance", () => {
    consume({ uid: "u2", plan: "free", kind: "image", now: T0 });
    const onDisk = JSON.parse(readFileSync(path.join(DIR, "u2.json"), "utf8"));
    expect(onDisk).toEqual({ day: "2026-09-06", counts: { image: 1 } });
  });

  it("blocks at the limit and says when it comes back", () => {
    for (let i = 0; i < QUOTAS.free.image; i++) {
      consume({ uid: "u3", plan: "free", kind: "image", now: T0 + i * MINUTE });
    }
    const err = grab(() => consume({ uid: "u3", plan: "free", kind: "image", now: T0 + 6 * MINUTE }));
    expect(err.message).toBe("quota-exceeded");
    expect(err.info).toMatchObject({ kind: "image", plan: "free", limit: QUOTAS.free.image, remaining: 0 });
    expect(err.info.resetAt).toBe("2026-09-07T00:00:00.000Z");
  });

  it("gives a paid plan headroom the free plan does not have", () => {
    for (let i = 0; i <= QUOTAS.free.image; i++) {
      // Same call count that exhausts free, spread out to dodge the burst window.
      consume({ uid: "u4", plan: "pro", kind: "image", now: T0 + i * 2 * MINUTE });
    }
    expect(usageSummary("u4", "pro", T0).kinds.image.remaining).toBeGreaterThan(0);
  });

  it("starts a fresh bucket the next UTC day", () => {
    for (let i = 0; i < QUOTAS.free.image; i++) {
      consume({ uid: "u5", plan: "free", kind: "image", now: T0 + i * MINUTE });
    }
    expect(grab(() => consume({ uid: "u5", plan: "free", kind: "image", now: T0 })).message).toBe(
      "quota-exceeded",
    );
    expect(consume({ uid: "u5", plan: "free", kind: "image", now: T0 + DAY }).used).toBe(1);
  });

  it("meters each kind separately", () => {
    consume({ uid: "u6", plan: "free", kind: "image", now: T0 });
    expect(usageSummary("u6", "free", T0).kinds.suggest.used).toBe(0);
  });

  it("rejects a caller with no valid uid", () => {
    expect(grab(() => consume({ uid: "", plan: "free", kind: "image", now: T0 })).message).toBe("unauthorized");
    expect(grab(() => consume({ uid: "../../etc/passwd", plan: "free", kind: "image", now: T0 })).message).toBe(
      "unauthorized",
    );
    expect(existsSync(path.join(DIR, "..", "..", "etc"))).toBe(false);
  });

  it("rejects an unknown kind rather than letting it through unmetered", () => {
    expect(grab(() => consume({ uid: "u7", plan: "pro", kind: "wat", now: T0 })).message).toBe(
      "unknown-usage-kind",
    );
  });
});

describe("paid-only features", () => {
  it("refuses translation on the free plan — it is sold as Pro", () => {
    const err = grab(() => consume({ uid: "p1", plan: "free", kind: "translate", now: T0 }));
    expect(err.message).toBe("plan-required");
    expect(err.info).toMatchObject({ kind: "translate", feature: "Localization sets", requiredPlan: "pro" });
  });

  it("says plan-required, not quota-exceeded — waiting will never fix it", () => {
    const err = grab(() => consume({ uid: "p2", plan: "free", kind: "translate", now: T0 }));
    expect(err.message).not.toBe("quota-exceeded");
    expect(err.info.resetAt).toBeUndefined();
  });

  it("allows it on the plans that pay for it", () => {
    expect(consume({ uid: "p3", plan: "pro", kind: "translate", now: T0 }).remaining).toBe(QUOTAS.pro.translate - 1);
    expect(() => consume({ uid: "p4", plan: "team", kind: "translate", now: T0 })).not.toThrow();
  });

  it("charges nothing when the plan is refused", () => {
    grab(() => consume({ uid: "p5", plan: "free", kind: "translate", now: T0 }));
    expect(usageSummary("p5", "free", T0).kinds.translate.used).toBe(0);
  });

  it("leaves the free features free", () => {
    for (const kind of ["suggest", "image", "search", "appStore"]) {
      expect(() => consume({ uid: `f-${kind}`, plan: "free", kind, now: T0 })).not.toThrow();
    }
  });
});

describe("email verification", () => {
  const unverified = { emailVerified: false };

  it("blocks free AI calls from an unverified address", () => {
    for (const kind of ["suggest", "image"]) {
      const err = grab(() => consume({ uid: `v-${kind}`, plan: "free", kind, ...unverified, now: T0 }));
      expect(err.message, kind).toBe("email-verification-required");
    }
  });

  it("still allows the cheap proxies — a new account should feel alive at once", () => {
    for (const kind of ["search", "appStore"]) {
      expect(() => consume({ uid: `v2-${kind}`, plan: "free", kind, ...unverified, now: T0 })).not.toThrow();
    }
  });

  it("never blocks a paying customer over an unclicked link", () => {
    expect(() => consume({ uid: "v3", plan: "pro", kind: "image", ...unverified, now: T0 })).not.toThrow();
    expect(() => consume({ uid: "v4", plan: "team", kind: "translate", ...unverified, now: T0 })).not.toThrow();
  });

  it("allows a verified free account", () => {
    expect(() => consume({ uid: "v5", plan: "free", kind: "image", emailVerified: true, now: T0 })).not.toThrow();
  });

  it("does not block when the claim is absent — a missing field must not lock anyone out", () => {
    expect(() => consume({ uid: "v6", plan: "free", kind: "image", now: T0 })).not.toThrow();
  });

  it("charges nothing for a blocked call", () => {
    grab(() => consume({ uid: "v7", plan: "free", kind: "image", ...unverified, now: T0 }));
    expect(usageSummary("v7", "free", T0).kinds.image.used).toBe(0);
  });
});

describe("burst limiting", () => {
  it("stops a flood inside one minute, then lets it resume", () => {
    // 'search' has a large daily allowance, so only the burst window can bite.
    for (let i = 0; i < 20; i++) consume({ uid: "b1", plan: "free", kind: "search", now: T0 });
    const err = grab(() => consume({ uid: "b1", plan: "free", kind: "search", now: T0 }));
    expect(err.message).toBe("rate-limited");
    expect(err.info.retryAfterSec).toBe(60);

    expect(consume({ uid: "b1", plan: "free", kind: "search", now: T0 + 61_000 }).used).toBe(21);
  });

  it("is per user — one hammering account cannot lock everyone out", () => {
    for (let i = 0; i < 20; i++) consume({ uid: "b2", plan: "free", kind: "search", now: T0 });
    expect(grab(() => consume({ uid: "b2", plan: "free", kind: "search", now: T0 })).message).toBe("rate-limited");
    expect(() => consume({ uid: "b3", plan: "free", kind: "search", now: T0 })).not.toThrow();
  });

  it("does not spend quota on a throttled request", () => {
    for (let i = 0; i < 20; i++) consume({ uid: "b4", plan: "free", kind: "search", now: T0 });
    const before = usageSummary("b4", "free", T0).kinds.search.used;
    grab(() => consume({ uid: "b4", plan: "free", kind: "search", now: T0 }));
    expect(usageSummary("b4", "free", T0).kinds.search.used).toBe(before);
  });
});

describe("instance-wide ceiling", () => {
  // Env-tunable in production (USAGE_GLOBAL_IMAGE_CAP); pinned low here.
  const realCap = GLOBAL_DAILY.image;
  beforeEach(() => (GLOBAL_DAILY.image = 2));
  afterEach(() => (GLOBAL_DAILY.image = realCap));

  it("caps total spend across users, not just per account", () => {
    consume({ uid: "g1", plan: "pro", kind: "image", now: T0 });
    consume({ uid: "g2", plan: "pro", kind: "image", now: T0 });
    const err = grab(() => consume({ uid: "g3", plan: "pro", kind: "image", now: T0 }));
    expect(err.message).toBe("capacity-reached");
    expect(err.info.resetAt).toBe("2026-09-07T00:00:00.000Z");
  });

  it("does not charge the user who hit the ceiling", () => {
    consume({ uid: "g4", plan: "pro", kind: "image", now: T0 });
    consume({ uid: "g5", plan: "pro", kind: "image", now: T0 });
    grab(() => consume({ uid: "g6", plan: "pro", kind: "image", now: T0 }));
    expect(usageSummary("g6", "pro", T0).kinds.image.used).toBe(0);
  });

  it("leaves uncapped kinds alone", () => {
    for (let i = 0; i < 5; i++) consume({ uid: `s${i}`, plan: "pro", kind: "search", now: T0 });
    expect(() => consume({ uid: "s99", plan: "pro", kind: "search", now: T0 })).not.toThrow();
  });
});

describe("refund", () => {
  it("returns a unit when the upstream call failed", () => {
    consume({ uid: "r1", plan: "free", kind: "image", now: T0 });
    refund({ uid: "r1", kind: "image", now: T0 });
    expect(usageSummary("r1", "free", T0).kinds.image.used).toBe(0);
  });

  it("frees a slot under the instance ceiling too", () => {
    const realCap = GLOBAL_DAILY.image;
    GLOBAL_DAILY.image = 2;
    try {
      consume({ uid: "r2", plan: "pro", kind: "image", now: T0 });
      consume({ uid: "r3", plan: "pro", kind: "image", now: T0 });
      refund({ uid: "r3", kind: "image", now: T0 });
      expect(() => consume({ uid: "r4", plan: "pro", kind: "image", now: T0 })).not.toThrow();
    } finally {
      GLOBAL_DAILY.image = realCap;
    }
  });

  it("cannot mint allowance by refunding twice", () => {
    consume({ uid: "r5", plan: "free", kind: "image", now: T0 });
    refund({ uid: "r5", kind: "image", now: T0 });
    refund({ uid: "r5", kind: "image", now: T0 });
    expect(usageSummary("r5", "free", T0).kinds.image.used).toBe(0);
  });

  it("ignores a bad uid or kind", () => {
    expect(() => refund({ uid: "../x", kind: "image", now: T0 })).not.toThrow();
    expect(() => refund({ uid: "r6", kind: "nope", now: T0 })).not.toThrow();
  });
});

describe("usageSummary", () => {
  it("reports every metered kind with its limit", () => {
    const s = usageSummary("sum1", "pro", T0);
    expect(s.plan).toBe("pro");
    expect(s.resetAt).toBe(resetAt(T0));
    expect(Object.keys(s.kinds).sort()).toEqual(["appStore", "image", "search", "suggest", "translate"]);
    expect(s.kinds.image).toEqual({ limit: QUOTAS.pro.image, used: 0, remaining: QUOTAS.pro.image });
  });

  it("never reports negative headroom", () => {
    const s = usageSummary("sum2", "free", T0);
    expect(s.kinds.image.remaining).toBeGreaterThanOrEqual(0);
  });
});

describe("day boundaries", () => {
  it("uses UTC, so the reset matches what the message promises", () => {
    expect(utcDay(Date.UTC(2026, 8, 6, 23, 59, 59))).toBe("2026-09-06");
    expect(utcDay(Date.UTC(2026, 8, 7, 0, 0, 1))).toBe("2026-09-07");
    expect(resetAt(Date.UTC(2026, 8, 6, 23, 59, 59))).toBe("2026-09-07T00:00:00.000Z");
  });
});
