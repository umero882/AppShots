/**
 * The deletion cascade is safety-critical: the order is what stops a half-run
 * from leaving an unreachable account that is still being charged, or a working
 * sign-in for an account whose data is gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let currentUser = null;
const calls = [];

vi.mock("../firebase", () => ({
  hasFirebase: true,
  firebaseConfig: { projectId: "test-project", apiKey: "k" },
  getFirebase: () => ({ app: {}, auth: { currentUser } }),
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  verifyPasswordResetCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
  applyActionCode: vi.fn(),
  onAuthStateChanged: vi.fn(),
  updateProfile: vi.fn(),
  deleteUser: vi.fn(async () => calls.push("deleteUser")),
  reauthenticateWithCredential: vi.fn(async () => calls.push("reauth")),
  reauthenticateWithPopup: vi.fn(async () => calls.push("reauth-popup")),
  EmailAuthProvider: { credential: vi.fn((email, password) => ({ email, password })) },
  GoogleAuthProvider: class {},
}));

const { makeFirebaseBackend } = await import("../backend.js");
const fbAuth = await import("firebase/auth");

const backend = makeFirebaseBackend();
const passwordUser = () => ({
  uid: "uid-1",
  email: "a@b.com",
  providerData: [{ providerId: "password" }],
  getIdToken: vi.fn(async () => "id-token"),
});

/** fetch stub: /api/account plus the Firestore REST calls the cascade makes. */
function stubFetch({ accountStatus = 200, accountBody = { ok: true, blobsDeleted: 2 } } = {}) {
  return vi.fn(async (url, opts = {}) => {
    const u = String(url);
    if (u === "/api/account") {
      calls.push(`api:${opts.method}`);
      return { ok: accountStatus === 200, status: accountStatus, json: async () => accountBody };
    }
    if (u.includes(":runQuery")) {
      calls.push("query-projects");
      return { ok: true, status: 200, json: async () => [{ document: { name: "p/projects/proj-1" } }] };
    }
    calls.push(`fs:${opts.method}:${u.split("/documents")[1]}`);
    return { ok: true, status: 200, json: async () => ({}) };
  });
}

beforeEach(() => {
  calls.length = 0;
  currentUser = passwordUser();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", stubFetch());
});

describe("order of operations", () => {
  it("confirms identity, stops billing, then erases — auth record last", async () => {
    await backend.deleteAccount({ password: "hunter2" });
    expect(calls).toEqual([
      "reauth",
      "api:DELETE",
      "query-projects",
      "fs:DELETE:/projects/proj-1",
      "fs:DELETE:/users/uid-1",
      "deleteUser",
    ]);
  });

  it("re-authenticates before anything is deleted", async () => {
    fbAuth.reauthenticateWithCredential.mockRejectedValueOnce({ code: "auth/wrong-password" });
    await expect(backend.deleteAccount({ password: "wrong" })).rejects.toThrow(/Invalid email or password/);
    expect(calls).toEqual([]);
    expect(fbAuth.deleteUser).not.toHaveBeenCalled();
  });

  it("uses the entered password, not a stored one", async () => {
    await backend.deleteAccount({ password: "hunter2" });
    expect(fbAuth.EmailAuthProvider.credential).toHaveBeenCalledWith("a@b.com", "hunter2");
  });

  it("asks a Google account to confirm with Google instead", async () => {
    currentUser = { ...passwordUser(), providerData: [{ providerId: "google.com" }] };
    await backend.deleteAccount();
    expect(calls[0]).toBe("reauth-popup");
  });
});

describe("failure handling", () => {
  it("refuses without a password on a password account", async () => {
    const err = await backend.deleteAccount({}).catch((e) => e);
    expect(err.code).toBe("password-required");
    expect(calls).toEqual([]);
  });

  it("deletes nothing else when billing cleanup fails", async () => {
    vi.stubGlobal("fetch", stubFetch({ accountStatus: 502, accountBody: { error: "billing-cleanup-failed" } }));
    await expect(backend.deleteAccount({ password: "hunter2" })).rejects.toThrow(/subscription, so nothing was deleted/);
    expect(calls).toEqual(["reauth", "api:DELETE"]);
    expect(fbAuth.deleteUser).not.toHaveBeenCalled();
  });

  it("keeps the account when the server refuses", async () => {
    vi.stubGlobal("fetch", stubFetch({ accountStatus: 500, accountBody: { error: "server-error" } }));
    await expect(backend.deleteAccount({ password: "hunter2" })).rejects.toThrow(/Couldn't delete your account/);
    expect(fbAuth.deleteUser).not.toHaveBeenCalled();
  });

  it("explains a stale session rather than leaking the Firebase code", async () => {
    fbAuth.deleteUser.mockRejectedValueOnce({ code: "auth/requires-recent-login" });
    await expect(backend.deleteAccount({ password: "hunter2" })).rejects.toThrow(/sign out and back in/);
  });

  it("refuses when nobody is signed in", async () => {
    currentUser = null;
    await expect(backend.deleteAccount({ password: "x" })).rejects.toThrow(/Not signed in/);
  });

  it("still finishes when a project document is already gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, opts = {}) => {
        const u = String(url);
        if (u === "/api/account") return { ok: true, status: 200, json: async () => ({ ok: true }) };
        if (u.includes(":runQuery")) return { ok: true, status: 200, json: async () => [{ document: { name: "p/projects/gone" } }] };
        if (opts.method === "DELETE") throw new Error("404");
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );
    await expect(backend.deleteAccount({ password: "hunter2" })).resolves.toMatchObject({ ok: true });
    expect(fbAuth.deleteUser).toHaveBeenCalled();
  });
});
