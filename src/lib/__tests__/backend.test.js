import { describe, it, expect, beforeAll } from "vitest";
import { userFromAuthUser, rowToProject, BACKEND_MODE, backend } from "../backend.js";

describe("userFromAuthUser", () => {
  it("maps a supabase auth user to the app user shape", () => {
    const u = userFromAuthUser({
      id: "uid-1",
      email: "a@b.com",
      user_metadata: { name: "Alice", plan: "pro" },
    });
    expect(u).toEqual({ id: "uid-1", email: "a@b.com", name: "Alice", plan: "pro", avatar: null });
  });
  it("defaults name from the email and plan to free", () => {
    const u = userFromAuthUser({ id: "x", email: "bob@x.com", user_metadata: {} });
    expect(u.name).toBe("bob");
    expect(u.plan).toBe("free");
  });
  it("returns null for no user", () => {
    expect(userFromAuthUser(null)).toBeNull();
  });
});

describe("rowToProject", () => {
  it("maps snake_case + ISO dates to the app project shape", () => {
    const p = rowToProject({
      id: "p1",
      user_id: "u1",
      name: "My app",
      state: { screens: [] },
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-02T00:00:00.000Z",
    });
    expect(p.id).toBe("p1");
    expect(p.userId).toBe("u1");
    expect(p.name).toBe("My app");
    expect(p.state).toEqual({ screens: [] });
    expect(typeof p.createdAt).toBe("number");
    expect(p.updatedAt).toBeGreaterThan(p.createdAt);
  });
  it("returns null for no row", () => {
    expect(rowToProject(null)).toBeNull();
  });
});

describe("BACKEND_MODE", () => {
  it("falls back to local without Supabase env vars (test env)", () => {
    expect(BACKEND_MODE).toBe("local");
  });
});

describe("localBackend.updateProfile", () => {
  // vitest runs in the node env (no DOM), so give localBackend an in-memory store.
  beforeAll(() => {
    if (typeof globalThis.localStorage === "undefined") {
      const store = new Map();
      globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      };
    }
  });

  it("renames the signed-in user and never leaks the password", async () => {
    const email = `u${Math.floor(Math.random() * 1e9)}@example.com`;
    const created = await backend.signUp({ name: "Old Name", email, password: "pw123456" });
    const updated = await backend.updateProfile({ name: "New Name" });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("New Name");
    expect(updated.password).toBeUndefined();
  });

  it("sets and removes the profile logo without touching the name", async () => {
    const email = `u${Math.floor(Math.random() * 1e9)}@example.com`;
    await backend.signUp({ name: "Logo User", email, password: "pw123456" });
    const withLogo = await backend.updateProfile({ avatar: "data:image/png;base64,AAAA" });
    expect(withLogo.avatar).toBe("data:image/png;base64,AAAA");
    expect(withLogo.name).toBe("Logo User");
    const removed = await backend.updateProfile({ avatar: null });
    expect(removed.avatar).toBeNull();
    expect(removed.name).toBe("Logo User");
  });
});
