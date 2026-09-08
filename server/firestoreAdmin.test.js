/**
 * The only writer of `teams/**` in Firestore. The security rules make those
 * documents read-only to every client precisely so that this module's output is
 * the roster they can trust — which makes its failure modes worth pinning down.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  adminFs,
  adminSet,
  adminDelete,
  adminDeleteCollection,
  firestoreAdminConfigured,
} from "./firestoreAdmin.js";

const SA = JSON.stringify({ client_email: "svc@appshots.iam.gserviceaccount.com", private_key: "-----BEGIN-----" });

const ok = (body = {}) => ({ ok: true, status: 200, json: async () => body });
const notFound = () => ({ ok: false, status: 404, json: async () => ({}) });
const boom = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });

let fetchImpl;
let tokenFn;
const opts = () => ({ fetchImpl, tokenFn });

beforeEach(() => {
  process.env.FIREBASE_SERVICE_ACCOUNT = SA;
  process.env.FIREBASE_PROJECT_ID = "appshots-test";
  tokenFn = vi.fn(async () => "ya29.token");
  fetchImpl = vi.fn(async () => ok({ name: "projects/p/databases/(default)/documents/teams/tm_1" }));
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.FIREBASE_PROJECT_ID;
});

describe("configuration", () => {
  it("reports whether the mirror is usable at all", () => {
    expect(firestoreAdminConfigured()).toBe(true);
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    expect(firestoreAdminConfigured()).toBe(false);
  });

  it("refuses to pretend without a service account", async () => {
    // Silently doing nothing here would leave a member with a seat they cannot
    // use and no sign of why. Callers check `configured()` and say so instead.
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    await expect(adminSet("/teams/tm_1", { name: "Acme" }, opts())).rejects.toThrow("firestore-admin-not-configured");
  });

  it("reports a token exchange failure as its own thing", async () => {
    tokenFn = vi.fn(async () => {
      throw new Error("invalid_grant");
    });
    await expect(adminFs("/teams/tm_1", opts())).rejects.toThrow("firestore-admin-token-failed");
  });
});

describe("adminFs", () => {
  it("signs the call as the service account", async () => {
    await adminFs("/teams/tm_1", opts());
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/projects/appshots-test/databases/(default)/documents/teams/tm_1");
    expect(init.headers.Authorization).toBe("Bearer ya29.token");
  });

  it("answers null for a missing document rather than throwing", async () => {
    fetchImpl = vi.fn(async () => notFound());
    expect(await adminFs("/teams/nope", opts())).toBeNull();
  });

  it("carries the upstream message on a real failure", async () => {
    fetchImpl = vi.fn(async () => boom(403, "Missing or insufficient permissions."));
    await expect(adminFs("/teams/tm_1", opts())).rejects.toThrow("firestore-admin-failed");
  });
});

describe("adminSet", () => {
  it("writes only the fields it was given", async () => {
    await adminSet("/teams/tm_1/members/u1", { role: "admin", at: 5 }, opts());
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe("PATCH");
    expect(url).toContain("updateMask.fieldPaths=role");
    expect(url).toContain("updateMask.fieldPaths=at");
    expect(JSON.parse(init.body).fields).toEqual({
      role: { stringValue: "admin" },
      at: { integerValue: "5" },
    });
  });

  it("creates the document when the masked write finds nothing to update", async () => {
    // A masked PATCH cannot create a document — Firestore answers 404 — so the
    // first member of a brand-new team would otherwise never be written.
    fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(ok({ name: "projects/p/databases/(default)/documents/teams/tm_1/members/u1" }));
    const res = await adminSet("/teams/tm_1/members/u1", { role: "member" }, opts());
    expect(res).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).not.toContain("updateMask");
  });
});

describe("adminDeleteCollection", () => {
  it("removes every document it finds", async () => {
    const docs = ["u1", "u2"].map((id) => ({
      name: `projects/p/databases/(default)/documents/teams/tm_1/members/${id}`,
    }));
    fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ documents: docs })) // list
      .mockResolvedValue(ok({})); // the deletes
    expect(await adminDeleteCollection("/teams/tm_1/members", opts())).toBe(2);
    const deleted = fetchImpl.mock.calls.filter(([, init]) => init?.method === "DELETE").map(([url]) => url);
    expect(deleted.some((u) => u.endsWith("/members/u1"))).toBe(true);
    expect(deleted.some((u) => u.endsWith("/members/u2"))).toBe(true);
  });

  it("stops cleanly on an empty collection", async () => {
    fetchImpl = vi.fn(async () => ok({}));
    expect(await adminDeleteCollection("/teams/tm_1/templates", opts())).toBe(0);
  });
});

describe("adminDelete", () => {
  it("treats an already-gone document as done", async () => {
    fetchImpl = vi.fn(async () => notFound());
    await expect(adminDelete("/teams/tm_1/members/ghost", opts())).resolves.toBe(true);
  });
});
