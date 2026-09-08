import { describe, it, expect, vi, beforeEach } from "vitest";

// Real handlers would call Anthropic/OpenAI/Pexels with whatever keys happen to
// be in the environment. Stub them; statusForError stays real because the router
// depends on its mapping.
vi.mock("./handlers.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    capabilities: vi.fn(() => ({ ai: true })),
    suggest: vi.fn(async () => ({ concepts: [{ name: "dusk" }] })),
    image: vi.fn(async () => ({ image: "data:image/png;base64,AAA" })),
    translate: vi.fn(async () => ({ translations: {} })),
    search: vi.fn(async () => ({ provider: "pexels", results: [] })),
    appStore: vi.fn(async () => ({ results: [], country: "us" })),
  };
});
vi.mock("./authEmail.js", () => ({
  requestPasswordReset: vi.fn(async () => ({ ok: true })),
  sendVerificationEmail: vi.fn(async () => ({ ok: true })),
}));

const { route, methodHasBody } = await import("./router.js");
const handlers = await import("./handlers.js");

const TOKEN = { authorization: "Bearer good-token" };
let deps;

beforeEach(() => {
  vi.clearAllMocks();
  deps = {
    verifyIdTokenClaims: vi.fn(async (header) => {
      if (header !== "Bearer good-token") throw new Error("invalid-token");
      return { sub: "uid-123", email_verified: true };
    }),
    planFor: vi.fn(async () => "free"),
    consume: vi.fn(({ kind, plan }) => ({ kind, plan, limit: 5, used: 1, remaining: 4, resetAt: "2026-09-07T00:00:00.000Z" })),
    refund: vi.fn(),
  };
});

const METERED = [
  ["POST", "/api/ai/suggest", "suggest"],
  ["POST", "/api/ai/image", "image"],
  ["POST", "/api/ai/translate", "translate"],
  ["GET", "/api/search", "search"],
  ["GET", "/api/app-store", "appStore"],
];

describe("metered endpoints require authentication", () => {
  it.each(METERED)("%s %s rejects an anonymous caller", async (method, path) => {
    const res = await route({ method, path, headers: {} }, deps);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it.each(METERED)("%s %s rejects a bad token", async (method, path) => {
    const res = await route({ method, path, headers: { authorization: "Bearer forged" } }, deps);
    expect(res.status).toBe(401);
  });

  it("never runs the upstream handler for an anonymous caller", async () => {
    await route({ method: "POST", path: "/api/ai/image", headers: {} }, deps);
    expect(handlers.image).not.toHaveBeenCalled();
    expect(deps.consume).not.toHaveBeenCalled();
  });

  it("does not say why the token failed", async () => {
    const res = await route(
      { method: "POST", path: "/api/ai/suggest", headers: { authorization: "Bearer expired" } },
      deps,
    );
    expect(JSON.stringify(res.body)).not.toMatch(/expired|invalid-token|malformed/i);
  });

  it("accepts the header under either casing", async () => {
    const res = await route({ method: "GET", path: "/api/search", headers: { Authorization: "Bearer good-token" } }, deps);
    expect(res.status).toBe(200);
  });
});

describe("metered endpoints charge the caller", () => {
  it.each(METERED)("%s %s charges its own kind", async (method, path, kind) => {
    const res = await route({ method, path, headers: TOKEN, query: { q: "x" } }, deps);
    expect(res.status).toBe(200);
    expect(deps.consume).toHaveBeenCalledWith({ uid: "uid-123", plan: "free", kind, emailVerified: true });
  });

  it("passes the email_verified claim through to the quota check", async () => {
    deps.verifyIdTokenClaims = vi.fn(async () => ({ sub: "uid-123", email_verified: false }));
    await route({ method: "POST", path: "/api/ai/image", headers: TOKEN }, deps);
    expect(deps.consume).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: false }));
  });

  it("answers 403 when a free account has not verified its email", async () => {
    const err = new Error("email-verification-required");
    err.info = { kind: "image" };
    deps.consume = vi.fn(() => {
      throw err;
    });
    const res = await route({ method: "POST", path: "/api/ai/image", headers: TOKEN }, deps);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("email-verification-required");
    expect(handlers.image).not.toHaveBeenCalled();
  });

  it("takes the plan from the server-side entitlement, not the request", async () => {
    deps.planFor = vi.fn(async () => "pro");
    await route({ method: "POST", path: "/api/ai/image", headers: TOKEN, body: { plan: "team" } }, deps);
    expect(deps.planFor).toHaveBeenCalledWith("uid-123");
    expect(deps.consume).toHaveBeenCalledWith(expect.objectContaining({ plan: "pro" }));
  });

  it("charges before the upstream call, not after", async () => {
    const order = [];
    deps.consume = vi.fn(() => (order.push("consume"), { kind: "image" }));
    handlers.image.mockImplementationOnce(async () => (order.push("upstream"), { image: "x" }));
    await route({ method: "POST", path: "/api/ai/image", headers: TOKEN }, deps);
    expect(order).toEqual(["consume", "upstream"]);
  });

  it("passes the quota block straight through with its details", async () => {
    const err = new Error("quota-exceeded");
    err.info = { kind: "image", plan: "free", limit: 5, remaining: 0, resetAt: "2026-09-07T00:00:00.000Z" };
    deps.consume = vi.fn(() => {
      throw err;
    });
    const res = await route({ method: "POST", path: "/api/ai/image", headers: TOKEN }, deps);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "quota-exceeded", ...err.info });
    expect(handlers.image).not.toHaveBeenCalled();
  });

  it("answers 403 when the plan does not include the feature", async () => {
    const err = new Error("plan-required");
    err.info = { kind: "translate", feature: "Localization sets", requiredPlan: "pro" };
    deps.consume = vi.fn(() => {
      throw err;
    });
    const res = await route({ method: "POST", path: "/api/ai/translate", headers: TOKEN, body: {} }, deps);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "plan-required", ...err.info });
    expect(handlers.translate).not.toHaveBeenCalled();
  });

  it("maps a burst block to 429 and an instance ceiling to 503", async () => {
    deps.consume = vi.fn(() => {
      const e = new Error("rate-limited");
      e.info = { retryAfterSec: 60 };
      throw e;
    });
    expect((await route({ method: "GET", path: "/api/search", headers: TOKEN }, deps)).status).toBe(429);

    deps.consume = vi.fn(() => {
      throw new Error("capacity-reached");
    });
    expect((await route({ method: "GET", path: "/api/search", headers: TOKEN }, deps)).status).toBe(503);
  });
});

describe("refunds", () => {
  it("gives the unit back when the upstream fails", async () => {
    handlers.suggest.mockRejectedValueOnce(new Error("no-llm-key"));
    const res = await route({ method: "POST", path: "/api/ai/suggest", headers: TOKEN }, deps);
    expect(res.status).toBe(503);
    expect(deps.refund).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-123", kind: "suggest" }));
  });

  it("does not refund a successful call", async () => {
    await route({ method: "POST", path: "/api/ai/suggest", headers: TOKEN }, deps);
    expect(deps.refund).not.toHaveBeenCalled();
  });

  it("does not refund when the charge itself was refused", async () => {
    deps.consume = vi.fn(() => {
      throw new Error("quota-exceeded");
    });
    await route({ method: "POST", path: "/api/ai/image", headers: TOKEN }, deps);
    expect(deps.refund).not.toHaveBeenCalled();
  });
});

describe("unmetered routes", () => {
  it("serves capabilities without a token", async () => {
    const res = await route({ method: "GET", path: "/api/capabilities", headers: {} }, deps);
    expect(res.status).toBe(200);
    expect(deps.verifyIdTokenClaims).not.toHaveBeenCalled();
  });

  it("leaves the auth-email routes open — they authenticate themselves", async () => {
    const reset = await route({ method: "POST", path: "/api/auth/password-reset", body: { email: "a@b.c" } }, deps);
    expect(reset.status).toBe(200);
    expect(deps.consume).not.toHaveBeenCalled();
  });

  it("routes account deletion without metering it", async () => {
    deps.deleteAccount = vi.fn(async () => ({ ok: true, blobsDeleted: 3 }));
    const res = await route({ method: "DELETE", path: "/api/account", headers: TOKEN }, deps);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, blobsDeleted: 3 });
    // Nobody should be rate-limited or quota-blocked out of leaving.
    expect(deps.consume).not.toHaveBeenCalled();
  });

  it("passes an unauthorized deletion through as 401", async () => {
    deps.deleteAccount = vi.fn(async () => {
      throw new Error("unauthorized");
    });
    expect((await route({ method: "DELETE", path: "/api/account", headers: {} }, deps)).status).toBe(401);
  });

  it("answers 502 when deletion aborted at the billing step", async () => {
    const err = new Error("billing-cleanup-failed");
    err.info = { detail: "stripe timeout" };
    deps.deleteAccount = vi.fn(async () => {
      throw err;
    });
    const res = await route({ method: "DELETE", path: "/api/account", headers: TOKEN }, deps);
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "billing-cleanup-failed", detail: "stripe timeout" });
  });

  it("routes every /api/team sub-path to the team handler, unmetered", async () => {
    // Ids and tokens live in the path, so this one dispatches on the path itself
    // rather than an exact "METHOD /path" key like the others.
    deps.handleTeam = vi.fn(async () => ({ team: null }));
    for (const [method, path] of [
      ["GET", "/api/team"],
      ["POST", "/api/team/invites"],
      ["DELETE", "/api/team/invites/abc123"],
      ["PATCH", "/api/team/members/uid-9"],
      ["GET", "/api/team/invite/abc123"],
    ]) {
      const res = await route({ method, path, headers: TOKEN }, deps);
      expect(res.status, path).toBe(200);
    }
    expect(deps.handleTeam).toHaveBeenCalledTimes(5);
    expect(deps.consume).not.toHaveBeenCalled(); // nobody is rate-limited out of their own workspace
  });

  it("maps a rank problem to 403, not to 401", async () => {
    // A 401 tells the client to sign in again, which cannot fix "you are not an
    // admin" — it just loops them through the login screen.
    deps.handleTeam = vi.fn(async () => {
      throw new Error("forbidden");
    });
    expect((await route({ method: "POST", path: "/api/team/invites", headers: TOKEN }, deps)).status).toBe(403);
  });

  it("maps a used-up invite to 404 and a full workspace to 409", async () => {
    for (const [code, status] of [
      ["invite-invalid", 404],
      ["no-team", 404],
      ["no-seats-left", 409],
      ["already-a-member", 409],
      ["invite-wrong-email", 409],
    ]) {
      deps.handleTeam = vi.fn(async () => {
        throw new Error(code);
      });
      const res = await route({ method: "POST", path: "/api/team/join", headers: TOKEN }, deps);
      expect(res.status, code).toBe(status);
      expect(res.body.error).toBe(code);
    }
  });

  it("agrees with both transports about which methods carry a body", () => {
    // server/index.js and server/devProxy.js both read this. When they disagreed,
    // PATCH handlers were handed {} and a rename renamed nothing, silently.
    expect(methodHasBody("POST")).toBe(true);
    expect(methodHasBody("PATCH")).toBe(true);
    for (const m of ["GET", "DELETE", "HEAD", "OPTIONS"]) expect(methodHasBody(m), m).toBe(false);
  });

  it("hands a PATCH body through to the handler", async () => {
    deps.handleTeam = vi.fn(async ({ body }) => ({ team: { name: body.name } }));
    const res = await route(
      { method: "PATCH", path: "/api/team", body: { name: "Acme" }, headers: TOKEN },
      deps,
    );
    expect(res.body.team.name).toBe("Acme");
  });

  it("404s an unknown team sub-path instead of blaming itself with a 502", async () => {
    deps.handleTeam = vi.fn(async () => {
      throw new Error("not-found");
    });
    const res = await route({ method: "GET", path: "/api/team/nonsense", headers: TOKEN }, deps);
    expect(res.status).toBe(404);
  });

  it("404s an unknown path", async () => {
    const res = await route({ method: "GET", path: "/api/nope", headers: TOKEN }, deps);
    expect(res.status).toBe(404);
  });

  it("does not charge for a wrong-method request to a metered path", async () => {
    const res = await route({ method: "GET", path: "/api/ai/image", headers: TOKEN }, deps);
    expect(res.status).toBe(404);
    expect(deps.consume).not.toHaveBeenCalled();
  });

  it("cannot be bypassed by a path with a query string or trailing slash", async () => {
    for (const path of ["/api/ai/image/", "/api/ai/image?x=1", "//api/ai/image"]) {
      const res = await route({ method: "POST", path, headers: {} }, deps);
      expect(res.status, path).toBe(404); // unrecognized → no handler runs at all
      expect(handlers.image).not.toHaveBeenCalled();
    }
  });
});
