/**
 * The browser's view of a workspace. None of this decides access — the server
 * does — so these rules only have to agree with it, which is what keeps a
 * rendered button from promising something the API will refuse.
 */
import { describe, it, expect } from "vitest";
import {
  canEditBrand,
  canInvite,
  canRemoveMember,
  canSetRole,
  canDisband,
  daysLeft,
  describeTeamError,
  isManager,
  roleLabel,
  seatSummary,
  timeAgo,
} from "../team";

const owner = { uid: "o", role: "owner" };
const admin = { uid: "a", role: "admin" };
const member = { uid: "m", role: "member" };

describe("who sees which controls", () => {
  it("treats owner and admin as managers", () => {
    expect(isManager("owner")).toBe(true);
    expect(isManager("admin")).toBe(true);
    expect(isManager("member")).toBe(false);
    expect(isManager(null)).toBe(false);
  });

  it("keeps roles and disbanding to the owner", () => {
    expect(canSetRole("owner")).toBe(true);
    expect(canSetRole("admin")).toBe(false);
    expect(canDisband("admin")).toBe(false);
    // Inviting and the brand kit are shared with admins — that is the point of
    // the role.
    expect(canInvite("admin")).toBe(true);
    expect(canEditBrand("admin")).toBe(true);
  });
});

describe("canRemoveMember", () => {
  it("never offers to remove the owner", () => {
    // They hold the subscription; removing them would orphan it.
    expect(canRemoveMember("owner", owner, "o")).toBe(false);
    expect(canRemoveMember("admin", owner, "a")).toBe(false);
  });

  it("always lets someone leave", () => {
    expect(canRemoveMember("member", member, "m")).toBe(true);
    expect(canRemoveMember("admin", admin, "a")).toBe(true);
  });

  it("stops an admin removing a peer", () => {
    expect(canRemoveMember("admin", member, "a")).toBe(true);
    expect(canRemoveMember("admin", admin, "someone-else")).toBe(false);
  });

  it("gives a member no remove button but their own", () => {
    expect(canRemoveMember("member", admin, "m")).toBe(false);
    expect(canRemoveMember("member", { uid: "other", role: "member" }, "m")).toBe(false);
  });
});

describe("seatSummary", () => {
  it("counts what is left", () => {
    expect(seatSummary({ seatsUsed: 3, seatsTotal: 5 })).toEqual({ used: 3, total: 5, free: 2, full: false });
  });

  it("says full when it is", () => {
    expect(seatSummary({ seatsUsed: 5, seatsTotal: 5 }).full).toBe(true);
  });

  it("never reports negative room", () => {
    expect(seatSummary({ seatsUsed: 7, seatsTotal: 5 }).free).toBe(0);
  });

  it("survives having no team at all", () => {
    expect(seatSummary(null)).toEqual({ used: 0, total: 0, free: 0, full: true });
  });
});

describe("timeAgo", () => {
  const now = Date.UTC(2026, 8, 8, 12, 0, 0);
  it("reads like a person wrote it", () => {
    expect(timeAgo(now, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(timeAgo(now - 4 * 86_400_000, now)).toBe("4d ago");
    expect(timeAgo(now - 70 * 86_400_000, now)).toBe("2mo ago");
  });

  it("does not say '-3m ago' for a clock that is slightly ahead", () => {
    expect(timeAgo(now + 60_000, now)).toBe("just now");
  });
});

describe("daysLeft", () => {
  const now = Date.UTC(2026, 8, 8, 12, 0, 0);
  it("rounds up so 'expires in 0d' only means today", () => {
    expect(daysLeft(now + 86_400_000 * 3.2, now)).toBe(4);
    expect(daysLeft(now - 1000, now)).toBe(0);
  });
});

describe("describeTeamError", () => {
  it("explains the ones a person can act on", () => {
    expect(describeTeamError({ code: "no-seats-left" })).toMatch(/seat/i);
    expect(describeTeamError({ code: "invite-wrong-email" })).toMatch(/different email/i);
    expect(describeTeamError({ code: "owner-must-transfer-or-disband" })).toMatch(/transfer/i);
  });

  it("falls through to the shared API copy", () => {
    expect(describeTeamError({ code: "unauthorized" })).toMatch(/sign in again/i);
    expect(describeTeamError({ code: "who-knows" }, "Custom fallback.")).toBe("Custom fallback.");
  });
});

describe("roleLabel", () => {
  it("is capitalised for display and defaults safely", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel(undefined)).toBe("Member");
  });
});
