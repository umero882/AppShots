/**
 * The pricing card has to distinguish the billing period, not just the plan.
 * Telling a monthly subscriber that the yearly card is their "Current plan"
 * both lies and disables the button that would have sold them the upgrade —
 * and sending them to Checkout instead of the portal would have started a
 * SECOND subscription.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));

const { planCardState } = await import("../Pricing");

const PRO = { id: "pro", name: "Pro", cta: "Upgrade to Pro" };
const TEAM = { id: "team", name: "Team", cta: "Start with Team" };
const FREE = { id: "free", name: "Free", cta: "Start free" };

const monthlySubscriber = { plan: "pro", subscription: { interval: "month" } };
const yearlySubscriber = { plan: "pro", subscription: { interval: "year" } };
const freeUser = { plan: "free" };
// Someone seated on a colleague's Team: the plan is real, the subscription is
// not theirs. The server marks this with planVia: "seat".
const seatHolder = { plan: "team", planVia: "seat", teamId: "tm_abc", subscription: { status: "seat", interval: null } };

const MONTHLY = false;
const YEARLY = true;

describe("the bug: a monthly subscriber toggling to yearly", () => {
  it("is not told the yearly plan is already theirs", () => {
    const card = planCardState(PRO, monthlySubscriber, YEARLY);
    expect(card.isCurrent).toBe(false);
    expect(card.cta).toBe("Switch to yearly");
  });

  it("still sees Current plan on the period they actually bought", () => {
    expect(planCardState(PRO, monthlySubscriber, MONTHLY)).toMatchObject({
      isCurrent: true,
      cta: "Current plan",
    });
  });

  it("is sent to the portal, never to a second Checkout", () => {
    // Checkout always creates a new subscription: this is the difference
    // between an upgrade and being billed twice.
    expect(planCardState(PRO, monthlySubscriber, YEARLY).action).toBe("portal");
  });
});

describe("a yearly subscriber", () => {
  it("sees the mirror of the same behaviour", () => {
    expect(planCardState(PRO, yearlySubscriber, YEARLY)).toMatchObject({ isCurrent: true, cta: "Current plan" });
    expect(planCardState(PRO, yearlySubscriber, MONTHLY)).toMatchObject({
      isCurrent: false,
      cta: "Switch to monthly",
      action: "portal",
    });
  });
});

describe("exactly one card is ever current", () => {
  for (const [label, user] of [
    ["monthly subscriber", monthlySubscriber],
    ["yearly subscriber", yearlySubscriber],
    ["free user", freeUser],
    ["signed out", null],
  ]) {
    for (const [periodLabel, yearly] of [["monthly view", MONTHLY], ["yearly view", YEARLY]]) {
      it(`${label}, ${periodLabel}`, () => {
        const current = [FREE, PRO, TEAM].filter((p) => planCardState(p, user, yearly).isCurrent);
        expect(current.length, `${label} / ${periodLabel}`).toBeLessThanOrEqual(1);
        if (user === null) expect(current).toHaveLength(0);
      });
    }
  }
});

describe("a free user", () => {
  it("owns the Free card and is offered Pro at either period", () => {
    expect(planCardState(FREE, freeUser, MONTHLY)).toMatchObject({ isCurrent: true, cta: "Current plan" });
    for (const yearly of [MONTHLY, YEARLY]) {
      expect(planCardState(PRO, freeUser, yearly)).toMatchObject({
        isCurrent: false,
        cta: "Upgrade to Pro",
        action: "checkout",
      });
    }
  });
});

describe("a signed-out visitor", () => {
  it("is never told anything is theirs and is sent to sign up", () => {
    for (const yearly of [MONTHLY, YEARLY]) {
      expect(planCardState(PRO, null, yearly)).toMatchObject({ isCurrent: false, action: "signup" });
      expect(planCardState(FREE, null, yearly).isCurrent).toBe(false);
    }
  });
});

describe("an entitlement record written before the interval was stored", () => {
  it("falls back to plan-only rather than inventing a period", () => {
    const legacy = { plan: "pro", subscription: { interval: null } };
    for (const yearly of [MONTHLY, YEARLY]) {
      expect(planCardState(PRO, legacy, yearly)).toMatchObject({ isCurrent: true, cta: "Current plan" });
    }
  });
});

describe("the Team card", () => {
  it("is a plan you can buy", () => {
    expect(planCardState(TEAM, null, MONTHLY)).toMatchObject({ isCurrent: false, action: "signup" });
    expect(planCardState(TEAM, freeUser, MONTHLY)).toMatchObject({ isCurrent: false, action: "checkout" });
  });

  it("routes an existing subscriber through the portal, never a second Checkout", () => {
    expect(planCardState(TEAM, monthlySubscriber, MONTHLY)).toMatchObject({
      isCurrent: false,
      cta: "Switch to Team",
      action: "portal",
    });
  });

  it("is the current plan for the person paying for it", () => {
    const owner = { plan: "team", planVia: "billing", subscription: { interval: "month" } };
    expect(planCardState(TEAM, owner, MONTHLY)).toMatchObject({ isCurrent: true, cta: "Current plan", action: "none" });
  });
});

describe("someone holding a seat on a colleague's Team", () => {
  // Their plan came from a seat, so they have no Stripe customer. Sending them
  // to the billing portal answers "no-customer" — a dead end wearing a button.
  it("sees Team as theirs but not as something to manage", () => {
    expect(planCardState(TEAM, seatHolder, MONTHLY)).toMatchObject({
      isCurrent: true,
      cta: "Your team's plan",
      action: "none",
    });
  });

  it("can still buy a plan of their own", () => {
    for (const plan of [PRO, FREE]) {
      const card = planCardState(plan, seatHolder, MONTHLY);
      expect(card.isCurrent).toBe(false);
      expect(card.action).toBe("checkout");
    }
  });
});
