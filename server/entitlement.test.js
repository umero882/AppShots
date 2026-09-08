/**
 * The one function that can hand somebody a paid plan. Everything a quota, a
 * storage limit or a feature gate asks goes through here, so the rules below are
 * the whole answer to "how could someone get Team without paying for it?".
 */
import { describe, it, expect } from "vitest";
import { resolveEntitlement, planFor } from "./entitlement.js";

const record = (plan, extra = {}) =>
  plan === null ? null : { plan, status: "active", interval: "month", currentPeriodEnd: 1800000000, ...extra };

/** Inject both sources so nothing touches the disk. */
const withSources = (ownRecord, seat) => ({
  readRecord: () => ownRecord,
  publicEntitlement: (rec) =>
    rec
      ? {
          plan: rec.plan,
          interval: rec.interval || null,
          status: rec.status || "none",
          currentPeriodEnd: rec.currentPeriodEnd || null,
          cancelAtPeriodEnd: !!rec.cancelAtPeriodEnd,
        }
      : { plan: "free", status: "none" },
  teamPlanFor: () => seat,
});

const SEAT = { plan: "team", teamId: "tm_abc", role: "member" };

describe("nobody gets a plan for free", () => {
  it("answers free with no subscription and no seat", () => {
    const ent = resolveEntitlement("u1", {}, withSources(null, null));
    expect(ent).toMatchObject({ plan: "free", via: "none", status: "none" });
  });

  it("does not invent a seat when the roster read explodes", () => {
    const deps = {
      ...withSources(null, null),
      teamPlanFor: () => {
        throw new Error("disk on fire");
      },
    };
    expect(planFor("u1", deps)).toBe("free");
  });
});

describe("a seat is a real plan", () => {
  it("upgrades a free user to Team", () => {
    const ent = resolveEntitlement("u1", {}, withSources(null, SEAT));
    expect(ent).toMatchObject({ plan: "team", via: "seat", teamId: "tm_abc", teamRole: "member" });
  });

  it("beats the user's own cheaper subscription", () => {
    const ent = resolveEntitlement("u1", {}, withSources(record("pro"), SEAT));
    expect(ent.plan).toBe("team");
    expect(ent.via).toBe("seat");
  });

  it("carries no renewal date or cancel button", () => {
    // The card being charged is not theirs. Reporting "active" here would put a
    // renewal date and a cancel control in front of someone who cannot use them.
    const ent = resolveEntitlement("u1", {}, withSources(record("pro"), SEAT));
    expect(ent.status).toBe("seat");
    expect(ent.currentPeriodEnd).toBeNull();
    expect(ent.cancelAtPeriodEnd).toBe(false);
    expect(ent.interval).toBeNull();
  });
});

describe("your own subscription wins when it is at least as good", () => {
  it("keeps the owner on their own billing", () => {
    const ent = resolveEntitlement("u1", {}, withSources(record("team"), { ...SEAT, role: "owner" }));
    expect(ent).toMatchObject({ plan: "team", via: "billing", status: "active", interval: "month" });
    expect(ent.currentPeriodEnd).toBe(1800000000);
  });

  it("still reports the workspace they are in", () => {
    const ent = resolveEntitlement("u1", {}, withSources(record("team"), SEAT));
    expect(ent.teamId).toBe("tm_abc");
  });
});

describe("planFor", () => {
  it("is just the plan string", () => {
    expect(planFor("u1", withSources(record("pro"), null))).toBe("pro");
    expect(planFor("u1", withSources(null, SEAT))).toBe("team");
    expect(planFor("u1", withSources(null, null))).toBe("free");
  });

  it("accepts a record the caller already read", () => {
    // The billing endpoints have just reconciled one; reading it off disk again
    // would race with the write that produced it.
    const deps = withSources(null, null);
    const ent = resolveEntitlement("u1", { record: record("pro") }, deps);
    expect(ent.plan).toBe("pro");
  });
});
