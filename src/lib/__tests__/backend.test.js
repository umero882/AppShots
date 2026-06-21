import { describe, it, expect } from "vitest";
import { userFromAuthUser, rowToProject, BACKEND_MODE } from "../backend.js";

describe("userFromAuthUser", () => {
  it("maps a supabase auth user to the app user shape", () => {
    const u = userFromAuthUser({
      id: "uid-1",
      email: "a@b.com",
      user_metadata: { name: "Alice", plan: "pro" },
    });
    expect(u).toEqual({ id: "uid-1", email: "a@b.com", name: "Alice", plan: "pro" });
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
