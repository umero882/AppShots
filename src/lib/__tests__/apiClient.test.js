import { describe, it, expect, vi, beforeEach } from "vitest";

let currentUser = null;
let firebaseAvailable = true;

vi.mock("../firebase", () => ({
  get hasFirebase() {
    return firebaseAvailable;
  },
  getFirebase: () => ({ auth: { currentUser } }),
}));

const { apiFetch, authHeaders, describeApiError, ApiError } = await import("../apiClient");

const signedIn = (token = "id-token-abc") => {
  currentUser = { getIdToken: vi.fn(async () => token) };
};

beforeEach(() => {
  currentUser = null;
  firebaseAvailable = true;
  vi.restoreAllMocks();
});

describe("authHeaders", () => {
  it("carries the signed-in user's ID token", async () => {
    signedIn();
    expect(await authHeaders()).toEqual({ Authorization: "Bearer id-token-abc" });
  });

  it("is empty when signed out or Firebase is absent", async () => {
    expect(await authHeaders()).toEqual({});
    firebaseAvailable = false;
    signedIn();
    expect(await authHeaders()).toEqual({});
  });

  it("does not throw when the token refresh fails — the server decides", async () => {
    currentUser = { getIdToken: vi.fn(async () => { throw new Error("network"); }) };
    expect(await authHeaders()).toEqual({});
  });
});

describe("apiFetch", () => {
  const okResponse = (body = { ok: true }) => ({ ok: true, status: 200, json: async () => body });

  it("sends the token on every metered call", async () => {
    signedIn();
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/search?q=beach");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer id-token-abc");
  });

  it("only sets a JSON content type when there is a body", async () => {
    signedIn();
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/search?q=x");
    expect(fetchMock.mock.calls[0][1].headers["content-type"]).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();

    await apiFetch("/api/ai/image", { method: "POST", body: { concept: "dusk" } });
    expect(fetchMock.mock.calls[1][1].headers["content-type"]).toBe("application/json");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ concept: "dusk" });
  });

  it("throws an ApiError carrying the server's code and quota details", async () => {
    signedIn();
    const info = { error: "quota-exceeded", kind: "image", plan: "free", limit: 5, resetAt: "2026-09-07T00:00:00.000Z" };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => info })));

    const err = await apiFetch("/api/ai/image", { method: "POST", body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("quota-exceeded");
    expect(err.status).toBe(429);
    expect(err.info.limit).toBe(5);
  });

  it("falls back to the status when the body is not JSON", async () => {
    signedIn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error("nope"); } })));
    const err = await apiFetch("/api/search?q=x").catch((e) => e);
    expect(err.code).toBe("http-502");
  });

  it("reports a transport failure as network-error", async () => {
    signedIn();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const err = await apiFetch("/api/search?q=x").catch((e) => e);
    expect(err.code).toBe("network-error");
  });

  it("lets an abort propagate untouched", async () => {
    signedIn();
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw abort; }));
    await expect(apiFetch("/api/search?q=x")).rejects.toBe(abort);
  });
});

describe("describeApiError", () => {
  const quota = (over = {}) =>
    new ApiError("quota-exceeded", {
      kind: "image",
      plan: "free",
      limit: 5,
      resetAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
      ...over,
    });

  it("names what ran out, the limit and when it returns", () => {
    const msg = describeApiError(quota());
    expect(msg).toContain("AI image generations");
    expect(msg).toContain("5");
    expect(msg).toContain("3 hours");
  });

  it("suggests upgrading only to free users", () => {
    expect(describeApiError(quota())).toContain("Upgrade to Pro");
    expect(describeApiError(quota({ plan: "pro" }))).not.toContain("Upgrade");
  });

  it("names the paid feature and points at the upgrade", () => {
    const msg = describeApiError(new ApiError("plan-required", { feature: "Localization sets", requiredPlan: "pro" }));
    expect(msg).toContain("Localization sets");
    expect(msg).toContain("Pro");
  });

  it("tells an unverified user exactly what to do", () => {
    const msg = describeApiError(new ApiError("email-verification-required", { kind: "image" }));
    expect(msg).toMatch(/verify your email/i);
    expect(msg).toMatch(/resend/i);
  });

  it("explains the other blocks in the user's terms", () => {
    expect(describeApiError(new ApiError("unauthorized"))).toMatch(/sign in/i);
    expect(describeApiError(new ApiError("rate-limited"))).toMatch(/fast/i);
    expect(describeApiError(new ApiError("capacity-reached"))).toMatch(/capacity/i);
    expect(describeApiError(new ApiError("network-error"))).toMatch(/connection/i);
  });

  it("uses the caller's wording for anything else", () => {
    expect(describeApiError(new ApiError("no-image-key"), "Image generation failed.")).toBe("Image generation failed.");
    expect(describeApiError(new Error("boom"), "Try again.")).toBe("Try again.");
    expect(describeApiError(undefined, "Try again.")).toBe("Try again.");
  });

  it("never renders a broken reset time", () => {
    expect(describeApiError(quota({ resetAt: "not-a-date" }))).toContain("shortly");
    expect(describeApiError(quota({ resetAt: new Date(Date.now() - 1000).toISOString() }))).toContain("shortly");
  });
});
