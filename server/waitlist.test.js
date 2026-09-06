import { describe, it, expect, vi, beforeEach } from "vitest";
import { joinWaitlist, _resetWaitlistBudget } from "./waitlist.js";

let stored;
let deps;

beforeEach(() => {
  _resetWaitlistBudget();
  stored = [];
  deps = {
    readWaitlist: vi.fn(() => stored),
    append: vi.fn((plan, entry) => stored.push(entry)),
    notify: vi.fn(async () => {}),
    verifyIdTokenClaims: vi.fn(async (h) => {
      if (h !== "Bearer good") throw new Error("bad");
      return { sub: "uid-7" };
    }),
  };
});

describe("joining", () => {
  it("records the entry and reports the position", async () => {
    const res = await joinWaitlist({ plan: "team", email: "a@b.com" }, {}, deps);
    expect(res).toEqual({ ok: true, plan: "team", already: false, position: 1 });
    expect(stored[0]).toMatchObject({ email: "a@b.com", plan: "team", uid: null });
    expect(stored[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("normalises the address so duplicates actually collide", async () => {
    await joinWaitlist({ plan: "team", email: "  Person@Example.COM " }, {}, deps);
    expect(stored[0].email).toBe("person@example.com");
  });

  it("treats a second signup as success, not an error", async () => {
    await joinWaitlist({ plan: "team", email: "a@b.com" }, {}, deps);
    const again = await joinWaitlist({ plan: "team", email: "A@B.com" }, {}, deps);
    expect(again).toMatchObject({ ok: true, already: true });
    expect(stored).toHaveLength(1);
    expect(deps.notify).toHaveBeenCalledTimes(1); // no duplicate notification
  });

  it("attaches the account when signed in, without requiring it", async () => {
    await joinWaitlist({ plan: "team", email: "a@b.com" }, { authorization: "Bearer good" }, deps);
    expect(stored[0].uid).toBe("uid-7");
  });

  it("never takes a uid from the body", async () => {
    await joinWaitlist({ plan: "team", email: "a@b.com", uid: "admin" }, {}, deps);
    expect(stored[0].uid).toBeNull();
  });

  it("still records the entry when the token is bad", async () => {
    await joinWaitlist({ plan: "team", email: "a@b.com" }, { authorization: "Bearer forged" }, deps);
    expect(stored).toHaveLength(1);
    expect(stored[0].uid).toBeNull();
  });

  it("keeps optional seats and note, bounded", async () => {
    await joinWaitlist({ plan: "team", email: "a@b.com", seats: 9999, note: "x".repeat(900) }, {}, deps);
    expect(stored[0].seats).toBe(999);
    expect(stored[0].note.length).toBe(500);
  });

  it("does not fail the signup when the notification email fails", async () => {
    deps.notify = vi.fn(async () => {
      throw new Error("smtp down");
    });
    await expect(joinWaitlist({ plan: "team", email: "a@b.com" }, {}, deps)).resolves.toMatchObject({ ok: true });
  });
});

describe("rejecting", () => {
  it("only accepts a plan that is actually advertised", async () => {
    for (const plan of ["pro", "enterprise", "", "../../etc"]) {
      await expect(joinWaitlist({ plan, email: "a@b.com" }, {}, deps)).rejects.toThrow("unknown-waitlist");
    }
    expect(deps.append).not.toHaveBeenCalled();
  });

  it("rejects an address that is not one", async () => {
    for (const email of ["", "nope", "a@b", "a b@c.com", undefined]) {
      await expect(joinWaitlist({ plan: "team", email }, {}, deps)).rejects.toThrow("invalid-email");
    }
  });

  it("caps the flood a public endpoint invites", async () => {
    const now = Date.UTC(2026, 8, 6, 12);
    for (let i = 0; i < 20; i++) {
      await joinWaitlist({ plan: "team", email: `p${i}@b.com` }, {}, { ...deps, now });
    }
    await expect(joinWaitlist({ plan: "team", email: "late@b.com" }, {}, { ...deps, now })).rejects.toThrow(
      "rate-limited",
    );
  });
});
