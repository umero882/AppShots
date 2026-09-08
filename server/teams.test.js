import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Both modules read their directories once, at import — set them up first.
process.env.TEAM_DIR = mkdtempSync(path.join(tmpdir(), "appshots-teams-"));
process.env.SUB_DIR = mkdtempSync(path.join(tmpdir(), "appshots-subs-"));
const TEAM_DIR = process.env.TEAM_DIR;

const {
  handleTeam,
  can,
  seatsUsed,
  pendingInvites,
  defaultTeamName,
  sanitizeBrand,
  projectTeam,
  teamForUid,
  teamPlanFor,
  purgeTeamsForUid,
  readTeam,
  DEFAULT_SEATS,
  _resetInviteBudget,
} = await import("./teams.js");

const { writeRecord } = await import("./subscriptionStore.js");

const OWNER = { uid: "owner-1", email: "ada@acme.com", name: "Ada" };
const BOB = { uid: "bob-2", email: "bob@acme.com", name: "Bob" };
const CAZ = { uid: "caz-3", email: "caz@acme.com", name: "Caz" };
const OUTSIDER = { uid: "zed-9", email: "zed@elsewhere.com", name: "Zed" };

/** Auth header the fake verifier below understands. */
const as = (who) => ({ authorization: `Bearer ${who.uid}` });

const PEOPLE = [OWNER, BOB, CAZ, OUTSIDER];

const deps = {
  verifyIdTokenClaims: async (header) => {
    const uid = String(header || "").replace("Bearer ", "");
    const who = PEOPLE.find((p) => p.uid === uid);
    if (!who) throw new Error("invalid-token");
    return { sub: who.uid, email: who.email, name: who.name };
  },
  // No Firestore in tests: the mirror is derived state, and every rule under
  // test is decided by the roster on disk, never by what the mirror holds.
  firestoreAdminConfigured: () => false,
  sendInviteEmail: vi.fn(async () => ({ sent: true })),
};

const call = (method, pathname, who, body = {}) =>
  handleTeam({ method, path: pathname, body, headers: who ? as(who) : {} }, deps);

/** Give a uid a live Team subscription, which is what a seat is worth. */
function payFor(uid, plan = "team") {
  writeRecord(uid, { plan, status: "active", interval: "month", updatedAt: Date.now() });
}

function wipe() {
  for (const entry of readdirSync(TEAM_DIR)) rmSync(path.join(TEAM_DIR, entry), { recursive: true, force: true });
}

beforeEach(() => {
  wipe();
  _resetInviteBudget();
  deps.sendInviteEmail.mockClear();
});

/* --------------------------------- pure bits ------------------------------------ */

describe("can()", () => {
  it("lets the owner do everything", () => {
    for (const action of ["invite", "removeMember", "setRole", "disband", "transferOwner", "editBrand"]) {
      expect(can("owner", action, "admin")).toBe(true);
    }
  });

  it("lets an admin run the roster but not the workspace", () => {
    expect(can("admin", "invite")).toBe(true);
    expect(can("admin", "editBrand")).toBe(true);
    expect(can("admin", "removeMember", "member")).toBe(true);
    // The rule that matters: admins are not peers-with-scissors.
    expect(can("admin", "removeMember", "admin")).toBe(false);
    expect(can("admin", "removeMember", "owner")).toBe(false);
    expect(can("admin", "setRole", "member")).toBe(false);
    expect(can("admin", "disband")).toBe(false);
  });

  it("gives a member nothing", () => {
    for (const action of ["invite", "removeMember", "setRole", "editBrand", "disband"]) {
      expect(can("member", action, "member")).toBe(false);
    }
  });
});

describe("defaultTeamName", () => {
  it("uses the company domain when there is one", () => {
    expect(defaultTeamName("ada@acme.com", "Ada")).toBe("Acme");
  });

  it("does not name a workspace 'Gmail'", () => {
    expect(defaultTeamName("ada@gmail.com", "Ada")).toBe("Ada's team");
    expect(defaultTeamName("ada@icloud.com", "")).toBe("ada's team");
  });
});

describe("sanitizeBrand", () => {
  it("keeps valid hex colours and drops the rest", () => {
    const brand = sanitizeBrand({ colors: ["#fff", "#6366f1", "red", 42, "#12345"] });
    expect(brand.colors).toEqual(["#fff", "#6366f1"]);
  });

  it("refuses a data-URL logo", () => {
    // Firestore rejects any indexed value over 1500 bytes, so a pasted data-URL
    // would fail the mirror write — the client uploads and sends a short URL.
    expect(sanitizeBrand({ logo: "data:image/png;base64,AAAA" }).logo).toBeNull();
    expect(sanitizeBrand({ logo: "/api/blob/abc123" }).logo).toBe("/api/blob/abc123");
  });

  it("caps how much there is", () => {
    const many = Array.from({ length: 40 }, (_, i) => `#${String(i).padStart(6, "0")}`);
    expect(sanitizeBrand({ colors: many }).colors.length).toBe(12);
  });

  it("only takes font ids the editor could have produced", () => {
    const brand = sanitizeBrand({ fonts: ["inter", "system", "'; DROP TABLE", "A".repeat(80)] });
    expect(brand.fonts).toEqual(["inter", "system"]);
  });
});

describe("seat counting", () => {
  const team = {
    members: { a: {}, b: {} },
    invites: {
      live: { email: "x@y.z", expiresAt: 2000 },
      dead: { email: "old@y.z", expiresAt: 500 },
    },
  };

  it("counts a pending invite as a taken seat", () => {
    // Otherwise five invites to a five-seat team all succeed and the last person
    // to accept is turned away by an error they cannot do anything about.
    expect(seatsUsed(team, 1000)).toBe(3);
    expect(pendingInvites(team, 1000).map((i) => i.token)).toEqual(["live"]);
  });

  it("stops counting an expired one", () => {
    expect(seatsUsed(team, 5000)).toBe(2);
  });
});

/* -------------------------------- the lifecycle --------------------------------- */

describe("creating a workspace", () => {
  it("does not exist for someone who has not bought Team", async () => {
    const res = await call("GET", "/api/team", BOB);
    expect(res.team).toBeNull();
    expect(res.role).toBeNull();
  });

  it("appears by itself once the subscription is Team", async () => {
    // The purchase IS the intent. Making them click "create a workspace" after
    // paying for one is a step that can only be got wrong.
    payFor(OWNER.uid);
    const res = await call("GET", "/api/team", OWNER);
    expect(res.team.name).toBe("Acme");
    expect(res.role).toBe("owner");
    expect(res.seatsTotal).toBe(DEFAULT_SEATS);
    expect(res.members).toHaveLength(1);
  });

  it("is not created twice", async () => {
    payFor(OWNER.uid);
    const a = await call("GET", "/api/team", OWNER);
    const b = await call("GET", "/api/team", OWNER);
    expect(b.team.id).toBe(a.team.id);
  });
});

describe("invites", () => {
  beforeEach(async () => {
    payFor(OWNER.uid);
    await call("GET", "/api/team", OWNER);
  });

  it("emails a link and reserves a seat", async () => {
    const res = await call("POST", "/api/team/invites", OWNER, { email: "BOB@acme.com", role: "member" });
    expect(res.invited.email).toBe("bob@acme.com"); // normalised
    expect(res.invited.sent).toBe(true);
    expect(res.seatsUsed).toBe(2);
    expect(deps.sendInviteEmail).toHaveBeenCalledOnce();
  });

  it("hands back the link even when email is down", async () => {
    deps.sendInviteEmail.mockRejectedValueOnce(new Error("smtp exploded"));
    const res = await call("POST", "/api/team/invites", OWNER, { email: "bob@acme.com" });
    // A mail outage must not lose the seat reservation — the inviter can copy it.
    expect(res.invited.link).toContain("/join/");
    expect(res.invited.sent).toBe(false);
    expect(res.seatsUsed).toBe(2);
  });

  it("refuses a duplicate and refuses an existing member", async () => {
    await call("POST", "/api/team/invites", OWNER, { email: "bob@acme.com" });
    await expect(call("POST", "/api/team/invites", OWNER, { email: "bob@acme.com" })).rejects.toThrow("already-invited");
    await expect(call("POST", "/api/team/invites", OWNER, { email: OWNER.email })).rejects.toThrow("already-a-member");
  });

  it("runs out of seats instead of overselling them", async () => {
    for (const e of ["a@acme.com", "b@acme.com", "c@acme.com", "d@acme.com"]) {
      await call("POST", "/api/team/invites", OWNER, { email: e });
    }
    await expect(call("POST", "/api/team/invites", OWNER, { email: "e@acme.com" })).rejects.toThrow("no-seats-left");
  });

  it("is not something a member can send", async () => {
    const inv = await call("POST", "/api/team/invites", OWNER, { email: BOB.email });
    await call("POST", "/api/team/join", BOB, { token: inv.invited.token });
    await expect(call("POST", "/api/team/invites", BOB, { email: CAZ.email })).rejects.toThrow("forbidden");
  });

  it("can be previewed without signing in", async () => {
    const inv = await call("POST", "/api/team/invites", OWNER, { email: BOB.email });
    const res = await handleTeam(
      { method: "GET", path: `/api/team/invite/${inv.invited.token}`, body: {}, headers: {} },
      deps,
    );
    expect(res.invite).toMatchObject({ teamName: "Acme", role: "member", email: "bob@acme.com" });
  });

  it("frees the seat again when revoked", async () => {
    const inv = await call("POST", "/api/team/invites", OWNER, { email: BOB.email });
    const res = await call("DELETE", `/api/team/invites/${inv.invited.token}`, OWNER);
    expect(res.seatsUsed).toBe(1);
    await expect(call("POST", "/api/team/join", BOB, { token: inv.invited.token })).rejects.toThrow("invite-invalid");
  });
});

describe("joining", () => {
  let token;
  beforeEach(async () => {
    payFor(OWNER.uid);
    await call("GET", "/api/team", OWNER);
    token = (await call("POST", "/api/team/invites", OWNER, { email: BOB.email })).invited.token;
  });

  it("seats the invitee", async () => {
    const res = await call("POST", "/api/team/join", BOB, { token });
    expect(res.joined).toBe(true);
    expect(res.role).toBe("member");
    expect(teamForUid(BOB.uid).members[BOB.uid].role).toBe("member");
  });

  it("refuses a forwarded link", async () => {
    // An invite is addressed to an inbox. If anyone who opens the link is seated,
    // a private workspace is one forwarded email away from being a public one.
    await expect(call("POST", "/api/team/join", OUTSIDER, { token })).rejects.toThrow("invite-wrong-email");
  });

  it("burns the token", async () => {
    await call("POST", "/api/team/join", BOB, { token });
    await expect(call("POST", "/api/team/join", CAZ, { token })).rejects.toThrow("invite-invalid");
  });

  it("refuses someone already seated elsewhere", async () => {
    await call("POST", "/api/team/join", BOB, { token });
    payFor(CAZ.uid);
    await call("GET", "/api/team", CAZ); // Caz now owns their own workspace
    const t2 = (await call("POST", "/api/team/invites", OWNER, { email: CAZ.email })).invited.token;
    await expect(call("POST", "/api/team/join", CAZ, { token: t2 })).rejects.toThrow("already-in-a-team");
  });
});

describe("the seat is worth what the owner pays", () => {
  beforeEach(async () => {
    payFor(OWNER.uid);
    await call("GET", "/api/team", OWNER);
    const token = (await call("POST", "/api/team/invites", OWNER, { email: BOB.email })).invited.token;
    await call("POST", "/api/team/join", BOB, { token });
  });

  it("grants Team while the subscription is live", () => {
    expect(teamPlanFor(BOB.uid)).toMatchObject({ plan: "team", role: "member" });
  });

  it("grants nothing once it lapses", () => {
    // A cancelled Team subscription must not keep entitling four other people.
    writeRecord(OWNER.uid, { plan: "free", status: "canceled", updatedAt: Date.now() });
    expect(teamPlanFor(BOB.uid)).toBeNull();
  });
});

describe("roles", () => {
  beforeEach(async () => {
    payFor(OWNER.uid);
    await call("GET", "/api/team", OWNER);
    for (const who of [BOB, CAZ]) {
      const t = (await call("POST", "/api/team/invites", OWNER, { email: who.email })).invited.token;
      await call("POST", "/api/team/join", who, { token: t });
    }
  });

  it("is the owner's to hand out", async () => {
    const res = await call("PATCH", `/api/team/members/${BOB.uid}`, OWNER, { role: "admin" });
    expect(res.members.find((m) => m.uid === BOB.uid).role).toBe("admin");
  });

  it("cannot be self-assigned", async () => {
    await expect(call("PATCH", `/api/team/members/${BOB.uid}`, BOB, { role: "admin" })).rejects.toThrow("forbidden");
  });

  it("cannot demote the owner", async () => {
    // The owner is the payer; demoting them would orphan the subscription.
    await expect(call("PATCH", `/api/team/members/${OWNER.uid}`, OWNER, { role: "admin" })).rejects.toThrow(
      "cannot-change-owner",
    );
  });

  it("lets an admin remove a member but not another admin", async () => {
    await call("PATCH", `/api/team/members/${BOB.uid}`, OWNER, { role: "admin" });
    await call("PATCH", `/api/team/members/${CAZ.uid}`, OWNER, { role: "admin" });
    await expect(call("DELETE", `/api/team/members/${CAZ.uid}`, BOB)).rejects.toThrow("forbidden");

    await call("PATCH", `/api/team/members/${CAZ.uid}`, OWNER, { role: "member" });
    const res = await call("DELETE", `/api/team/members/${CAZ.uid}`, BOB);
    expect(res.members.map((m) => m.uid)).not.toContain(CAZ.uid);
  });
});

describe("leaving and removing", () => {
  beforeEach(async () => {
    payFor(OWNER.uid);
    await call("GET", "/api/team", OWNER);
    const t = (await call("POST", "/api/team/invites", OWNER, { email: BOB.email })).invited.token;
    await call("POST", "/api/team/join", BOB, { token: t });
  });

  it("lets anyone leave under their own steam", async () => {
    const res = await call("DELETE", `/api/team/members/${BOB.uid}`, BOB);
    expect(res.left).toBe(true);
    expect(teamForUid(BOB.uid)).toBeNull();
  });

  it("frees the seat when someone leaves", async () => {
    await call("DELETE", `/api/team/members/${BOB.uid}`, BOB);
    expect((await call("GET", "/api/team", OWNER)).seatsUsed).toBe(1);
  });

  it("leaves no mirror bookkeeping behind in the stored roster", async () => {
    // Transient state written into the durable record survives forever whenever
    // the mirror is switched off, and then reads as roster data that is not.
    const id = (await call("GET", "/api/team", OWNER)).team.id;
    await call("DELETE", `/api/team/members/${BOB.uid}`, OWNER);
    expect(Object.keys(readTeam(id))).not.toContain("mirroredExtra");
  });

  it("will not let the owner walk out on the workspace they pay for", async () => {
    await expect(call("DELETE", `/api/team/members/${OWNER.uid}`, OWNER)).rejects.toThrow(
      "owner-must-transfer-or-disband",
    );
  });
});

describe("transferring ownership", () => {
  beforeEach(async () => {
    payFor(OWNER.uid);
    await call("GET", "/api/team", OWNER);
    const t = (await call("POST", "/api/team/invites", OWNER, { email: BOB.email })).invited.token;
    await call("POST", "/api/team/join", BOB, { token: t });
  });

  it("promotes the new owner and keeps the payer as an admin", async () => {
    // The subscription is still on the old owner's card, so they must keep
    // enough access to manage the workspace they are paying for.
    const res = await call("POST", "/api/team/transfer", OWNER, { uid: BOB.uid });
    expect(res.members.find((m) => m.uid === BOB.uid).role).toBe("owner");
    expect(res.members.find((m) => m.uid === OWNER.uid).role).toBe("admin");
    expect(readTeam(res.team.id).ownerUid).toBe(BOB.uid);
  });

  it("refuses a stranger", async () => {
    await expect(call("POST", "/api/team/transfer", OWNER, { uid: OUTSIDER.uid })).rejects.toThrow("not-a-member");
  });

  it("is not an admin's to do", async () => {
    await call("PATCH", `/api/team/members/${BOB.uid}`, OWNER, { role: "admin" });
    await expect(call("POST", "/api/team/transfer", BOB, { uid: BOB.uid })).rejects.toThrow("forbidden");
  });
});

describe("disbanding", () => {
  let teamId;
  beforeEach(async () => {
    payFor(OWNER.uid);
    teamId = (await call("GET", "/api/team", OWNER)).team.id;
    const t = (await call("POST", "/api/team/invites", OWNER, { email: BOB.email })).invited.token;
    await call("POST", "/api/team/join", BOB, { token: t });
  });

  it("takes everyone's seat with it", async () => {
    await call("DELETE", "/api/team", OWNER);
    expect(readTeam(teamId)).toBeNull();
    expect(teamForUid(BOB.uid)).toBeNull();
    expect(teamPlanFor(BOB.uid)).toBeNull();
  });

  it("is the owner's alone", async () => {
    await expect(call("DELETE", "/api/team", BOB)).rejects.toThrow("forbidden");
  });
});

describe("account deletion cascade", () => {
  beforeEach(async () => {
    payFor(OWNER.uid);
    await call("GET", "/api/team", OWNER);
    const t = (await call("POST", "/api/team/invites", OWNER, { email: BOB.email })).invited.token;
    await call("POST", "/api/team/join", BOB, { token: t });
  });

  it("disbands the workspace when the owner deletes their account", async () => {
    const res = await purgeTeamsForUid(OWNER.uid, deps);
    expect(res.disbanded).toBe(true);
    expect(teamForUid(BOB.uid)).toBeNull();
  });

  it("only removes the seat when a member deletes theirs", async () => {
    const res = await purgeTeamsForUid(BOB.uid, deps);
    expect(res).toMatchObject({ disbanded: false, left: true });
    expect(teamForUid(OWNER.uid)).not.toBeNull();
  });
});

describe("what a caller is allowed to see", () => {
  it("hides invite links from ordinary members", async () => {
    payFor(OWNER.uid);
    await call("GET", "/api/team", OWNER);
    const t = (await call("POST", "/api/team/invites", OWNER, { email: BOB.email })).invited.token;
    await call("POST", "/api/team/join", BOB, { token: t });
    await call("POST", "/api/team/invites", OWNER, { email: CAZ.email });

    const asMember = await call("GET", "/api/team", BOB);
    const asOwner = await call("GET", "/api/team", OWNER);
    // A link is an act, not a fact: anyone holding one can seat themselves.
    expect(asMember.invites[0].token).toBeUndefined();
    expect(asMember.invites[0].email).toBe(CAZ.email);
    expect(asOwner.invites[0].token).toBeTypeOf("string");
  });

  it("sorts the owner first", () => {
    const team = {
      id: "tm_x",
      name: "Acme",
      seats: 5,
      ownerUid: "o",
      createdAt: 0,
      brand: {},
      invites: {},
      members: {
        m: { uid: "m", role: "member", at: 1 },
        o: { uid: "o", role: "owner", at: 3 },
        a: { uid: "a", role: "admin", at: 2 },
      },
    };
    expect(projectTeam(team, "o").members.map((m) => m.role)).toEqual(["owner", "admin", "member"]);
  });
});

describe("authentication", () => {
  it("refuses an anonymous caller", async () => {
    await expect(call("GET", "/api/team", null)).rejects.toThrow("unauthorized");
  });

  it("refuses a forged token", async () => {
    await expect(handleTeam({ method: "GET", path: "/api/team", body: {}, headers: { authorization: "Bearer nope" } }, deps)).rejects.toThrow(
      "unauthorized",
    );
  });

  it("keeps the store directory out of reach of a crafted id", async () => {
    payFor(OWNER.uid);
    await call("GET", "/api/team", OWNER);
    await expect(call("DELETE", "/api/team/members/../../etc/passwd", OWNER)).rejects.toThrow("not-a-member");
    expect(existsSync(path.join(TEAM_DIR, "..", "etc"))).toBe(false);
  });
});
