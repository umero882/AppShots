import { describe, it, expect, vi, beforeEach } from "vitest";

const logEvent = vi.fn();
let supported = true;
let consented = true;

vi.mock("../consent", () => ({
  hasAnalyticsConsent: () => consented,
}));

vi.mock("../firebase", () => ({
  hasFirebase: true,
  firebaseConfig: { measurementId: "G-TEST" },
  getFirebase: () => ({ app: { name: "test" }, auth: {} }),
}));

vi.mock("firebase/analytics", () => ({
  getAnalytics: vi.fn(() => ({ id: "analytics" })),
  isSupported: vi.fn(async () => supported),
  logEvent,
}));

const {
  track, trackSignUp, trackBeginCheckout, trackPurchase, trackProjectCreated, trackExport,
  initAnalytics, _resetAnalytics,
} = await import("../analytics");

beforeEach(() => {
  vi.clearAllMocks(); // getAnalytics too — one test asserts it is never called
  supported = true;
  consented = true;
  _resetAnalytics();
});

const paramsOf = (call) => call[2];

describe("track", () => {
  it("sends the event to the GA4 instance the app already initialises", async () => {
    await track("custom_thing", { a: 1 });
    expect(logEvent).toHaveBeenCalledWith({ id: "analytics" }, "custom_thing", { a: 1 });
  });

  it("resolves false instead of throwing when analytics is blocked", async () => {
    const { isSupported } = await import("firebase/analytics");
    isSupported.mockRejectedValueOnce(new Error("blocked by client"));
    await expect(track("x")).resolves.toBe(false);
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe("consent gates everything", () => {
  it("sends nothing at all before the visitor has agreed", async () => {
    consented = false;
    await track("custom_thing", { a: 1 });
    await trackSignUp("password");
    await trackPurchase({ plan: "pro", transactionId: "cs_1" });
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("does not even load the SDK without consent — it sets cookies on load", async () => {
    consented = false;
    await expect(initAnalytics()).resolves.toBeNull();
    const { getAnalytics } = await import("firebase/analytics");
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it("starts working the moment consent is given, with no reload", async () => {
    consented = false;
    await track("too_early");
    expect(logEvent).not.toHaveBeenCalled();

    consented = true;
    await track("now_allowed");
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent.mock.calls[0][1]).toBe("now_allowed");
  });

  it("reports false rather than throwing when it is not allowed to send", async () => {
    consented = false;
    await expect(track("x")).resolves.toBe(false);
  });
});

describe("the funnel uses GA4's recommended names", () => {
  it("sign_up carries the method", async () => {
    await trackSignUp("google");
    expect(logEvent.mock.calls[0][1]).toBe("sign_up");
    expect(paramsOf(logEvent.mock.calls[0])).toEqual({ method: "google" });
  });

  it("begin_checkout carries plan, interval and the price shown", async () => {
    await trackBeginCheckout({ plan: "pro", interval: "month", value: 9 });
    const [, name, params] = logEvent.mock.calls[0];
    expect(name).toBe("begin_checkout");
    expect(params).toMatchObject({ plan: "pro", interval: "month", value: 9, currency: "USD" });
    expect(params.items[0]).toEqual({ item_id: "pro_month", item_name: "pro" });
  });

  it("purchase carries a transaction id so GA4 can dedupe it", async () => {
    await trackPurchase({ plan: "pro", transactionId: "cs_live_123" });
    const [, name, params] = logEvent.mock.calls[0];
    expect(name).toBe("purchase");
    expect(params.transaction_id).toBe("cs_live_123");
    expect(params.currency).toBe("USD");
  });

  it("records what kind of export finished", async () => {
    await trackExport({ format: "all-sizes", screens: 5, sizes: 12 });
    expect(logEvent.mock.calls[0][1]).toBe("export_completed");
    expect(paramsOf(logEvent.mock.calls[0])).toEqual({ format: "all-sizes", screens: 5, sizes: 12 });
  });

  it("distinguishes a template from a blank project", async () => {
    await trackProjectCreated({ source: "template" });
    expect(paramsOf(logEvent.mock.calls[0])).toEqual({ source: "template" });
  });
});

describe("what is NOT sent", () => {
  it("never puts an email, name or uid in an event", async () => {
    await trackSignUp("password");
    await trackBeginCheckout({ plan: "pro", interval: "year", value: 84 });
    await trackPurchase({ plan: "pro", transactionId: "cs_1" });
    const payload = JSON.stringify(logEvent.mock.calls);
    expect(payload).not.toMatch(/@/);
    expect(payload).not.toMatch(/uid|email|user_id/i);
  });
});
