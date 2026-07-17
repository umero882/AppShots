import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  encodeForm,
  constructWebhookEvent,
  entitlementFromSubscription,
  publicEntitlement,
} from "./stripe.js";

describe("encodeForm", () => {
  it("encodes flat scalars", () => {
    expect(encodeForm({ a: 1, b: "x" })).toEqual(["a=1", "b=x"]);
  });

  it("encodes nested objects and arrays with PHP-style brackets", () => {
    expect(encodeForm({ meta: { firebase_uid: "u1" } })).toEqual(["meta%5Bfirebase_uid%5D=u1"]);
    expect(encodeForm({ items: [{ price: "p1" }] })).toEqual(["items%5B0%5D%5Bprice%5D=p1"]);
  });

  it("skips null/undefined and url-encodes values", () => {
    expect(encodeForm({ a: null, b: undefined, c: "a b" })).toEqual(["c=a%20b"]);
  });
});

describe("constructWebhookEvent", () => {
  const secret = "whsec_test_123";
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const sign = (payload, t, key = secret) =>
    `t=${t},v1=${createHmac("sha256", key).update(`${t}.${payload}`).digest("hex")}`;

  it("accepts a valid signature and returns the parsed event", () => {
    const t = 1_700_000_000;
    const event = constructWebhookEvent(body, sign(body, t), secret, t);
    expect(event.type).toBe("checkout.session.completed");
  });

  it("rejects a tampered payload", () => {
    const t = 1_700_000_000;
    const header = sign(body, t);
    expect(() => constructWebhookEvent(body + "x", header, secret, t)).toThrow(/signature-mismatch/);
  });

  it("rejects the wrong secret", () => {
    const t = 1_700_000_000;
    const header = sign(body, t, "whsec_wrong");
    expect(() => constructWebhookEvent(body, header, secret, t)).toThrow(/signature-mismatch/);
  });

  it("rejects a signature outside the timestamp tolerance (replay)", () => {
    const t = 1_700_000_000;
    const header = sign(body, t);
    expect(() => constructWebhookEvent(body, header, secret, t + 3600)).toThrow(/tolerance/);
  });

  it("rejects a missing secret or malformed header", () => {
    const t = 1_700_000_000;
    expect(() => constructWebhookEvent(body, sign(body, t), "", t)).toThrow(/secret/);
    expect(() => constructWebhookEvent(body, "not-a-sig", secret, t)).toThrow(/malformed-signature/);
  });
});

describe("entitlementFromSubscription", () => {
  const sub = (status, price, extra = {}) => ({
    id: "sub_1",
    status,
    customer: "cus_1",
    current_period_end: 1_800_000_000,
    cancel_at_period_end: false,
    items: { data: [{ price }] },
    ...extra,
  });

  it("grants the plan from price metadata when active", () => {
    const e = entitlementFromSubscription(sub("active", { id: "price_1", metadata: { plan: "pro" } }));
    expect(e).toMatchObject({ plan: "pro", status: "active", stripeCustomerId: "cus_1", priceId: "price_1" });
  });

  it("derives the plan from the lookup_key prefix when metadata is absent", () => {
    const e = entitlementFromSubscription(sub("trialing", { id: "price_2", lookup_key: "team_monthly" }));
    expect(e.plan).toBe("team");
    expect(e.status).toBe("trialing");
  });

  it("keeps the plan during past_due (grace window)", () => {
    const e = entitlementFromSubscription(sub("past_due", { id: "price_1", metadata: { plan: "pro" } }));
    expect(e.plan).toBe("pro");
  });

  it("drops to free when canceled/unpaid", () => {
    expect(entitlementFromSubscription(sub("canceled", { metadata: { plan: "pro" } })).plan).toBe("free");
    expect(entitlementFromSubscription(sub("unpaid", { metadata: { plan: "team" } })).plan).toBe("free");
  });

  it("passes through cancel_at_period_end", () => {
    const e = entitlementFromSubscription(
      sub("active", { metadata: { plan: "pro" } }, { cancel_at_period_end: true })
    );
    expect(e.cancelAtPeriodEnd).toBe(true);
  });

  it("reads current_period_end from the line item when absent on the subscription", () => {
    // API 2025-03-31.basil+ relocates the period fields onto items.
    const e = entitlementFromSubscription({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: 1_900_000_000, price: { metadata: { plan: "pro" } } }] },
    });
    expect(e.currentPeriodEnd).toBe(1_900_000_000);
  });
});

describe("publicEntitlement", () => {
  it("returns free for an empty record", () => {
    expect(publicEntitlement(null)).toEqual({ plan: "free", status: "none" });
  });

  it("projects only the client-facing fields", () => {
    const rec = {
      plan: "pro",
      status: "active",
      currentPeriodEnd: 123,
      cancelAtPeriodEnd: false,
      stripeCustomerId: "cus_secret",
      stripeSubscriptionId: "sub_secret",
    };
    expect(publicEntitlement(rec)).toEqual({
      plan: "pro",
      status: "active",
      currentPeriodEnd: 123,
      cancelAtPeriodEnd: false,
    });
  });
});
