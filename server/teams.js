/**
 * Team workspaces — seats, roles, invites and the shared brand kit.
 *
 * The Team plan was advertised for months as "coming soon" and collected a
 * waitlist (server/waitlist.js). This is the thing it promised: one subscription
 * that seats several people in a shared workspace.
 *
 * WHERE THE TRUTH LIVES
 * The roster is a JSON file per team on the persistent volume, next to the
 * subscription records — because membership grants a paid plan, and anything
 * that grants a plan must be server-owned. A client that could write its own
 * membership could write itself a Team plan.
 *
 * The security rules still need to see the roster to authorize a shared project,
 * so every roster change is MIRRORED into Firestore under `teams/{id}/members`
 * with the service account (server/firestoreAdmin.js). The rules make those
 * documents read-only to clients, so the mirror can only ever say what this file
 * said first. Order matters: the volume is written first, the mirror second — a
 * failed mirror costs a member their shared-project access until the next read
 * repairs it, whereas a failed volume write after a successful mirror would hand
 * out access nobody paid for.
 *
 *   GET    /api/team                     the caller's workspace (creates it if
 *                                        their own subscription is Team)
 *   PATCH  /api/team                     rename / brand kit          (owner, admin)
 *   DELETE /api/team                     disband                     (owner)
 *   POST   /api/team/transfer            hand ownership over         (owner)
 *   POST   /api/team/invites             invite by email             (owner, admin)
 *   DELETE /api/team/invites/{token}     revoke an invite            (owner, admin)
 *   GET    /api/team/invite/{token}      preview an invite         (no auth needed)
 *   POST   /api/team/join                accept an invite         (any signed-in)
 *   PATCH  /api/team/members/{uid}       change a role               (owner)
 *   DELETE /api/team/members/{uid}       remove a member, or leave
 *
 * Env: TEAM_DIR (default DATA_DIR/teams), TEAM_SEATS (default 5),
 *      TEAM_INVITE_TTL_DAYS (default 14), PUBLIC_URL for invite links.
 */
import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { verifyIdTokenClaims } from "./firebaseAuth.js";
import { readRecord, publicEntitlement } from "./subscriptionStore.js";
import { sendMail } from "./smtp.js";
import {
  firestoreAdminConfigured,
  adminSet,
  adminDelete,
  adminDeleteCollection,
} from "./firestoreAdmin.js";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const TEAM_DIR = process.env.TEAM_DIR || path.join(DATA_DIR, "teams");
const INDEX_DIR = path.join(TEAM_DIR, "index"); // uid -> { teamId }
const INVITE_DIR = path.join(TEAM_DIR, "invites"); // token -> { teamId }

/** Seats sold with the Team plan. Matches the pricing page and the Stripe price. */
export const DEFAULT_SEATS = Number(process.env.TEAM_SEATS) || 5;
const INVITE_TTL_MS = (Number(process.env.TEAM_INVITE_TTL_DAYS) || 14) * 86_400_000;
const MAX_INVITES_PER_MINUTE = Number(process.env.TEAM_INVITE_MAX_PER_MINUTE) || 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validUid = (uid) => (/^[A-Za-z0-9_-]{1,128}$/.test(uid || "") ? uid : null);
const validTeamId = (id) => (/^tm_[A-Za-z0-9_-]{8,64}$/.test(id || "") ? id : null);
const validToken = (t) => (/^[A-Za-z0-9_-]{16,128}$/.test(t || "") ? t : null);

export const ROLES = ["owner", "admin", "member"];

/* --------------------------------- permissions --------------------------------- */

/**
 * Can `role` do `action` to a member holding `targetRole`?
 *
 * Pure and exported: every rule below is a sentence someone will eventually
 * argue about, and arguing about it in a test is cheaper than in production.
 */
export function can(role, action, targetRole = null) {
  if (role === "owner") return true;
  if (role !== "admin") return false;
  switch (action) {
    case "invite":
    case "revokeInvite":
    case "editTeam":
    case "editBrand":
      return true;
    // An admin manages members, not peers: letting one remove another admin (or
    // the owner) turns a shared workspace into a race to click first.
    case "removeMember":
      return targetRole === "member";
    default:
      return false; // setRole, transferOwner, disband — owner only
  }
}

/* ---------------------------------- storage ------------------------------------ */

function ensureDirs() {
  for (const d of [TEAM_DIR, INDEX_DIR, INVITE_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });
}
const teamPath = (id) => path.join(TEAM_DIR, `${id}.json`);
const indexPath = (uid) => path.join(INDEX_DIR, `${uid}.json`);
const invitePath = (token) => path.join(INVITE_DIR, `${token}.json`);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function writeJson(file, value) {
  ensureDirs();
  writeFileSync(file, JSON.stringify(value));
}
function removeFile(file) {
  try {
    unlinkSync(file);
  } catch {
    /* already gone */
  }
}

/** The team record by id, or null. */
export function readTeam(teamId) {
  if (!validTeamId(teamId)) return null;
  const t = readJson(teamPath(teamId));
  if (!t || !t.id) return null;
  t.members = t.members || {};
  t.invites = t.invites || {};
  return t;
}

function writeTeam(team) {
  writeJson(teamPath(team.id), team);
  return team;
}

/** The team a user belongs to, or null. One team per user, by design for v1. */
export function teamForUid(uid) {
  if (!validUid(uid)) return null;
  const idx = readJson(indexPath(uid));
  const team = idx?.teamId ? readTeam(idx.teamId) : null;
  // A stale index (team disbanded while the pointer survived) must not look like
  // membership — the pointer is a cache, the roster is the truth.
  if (!team || !team.members[uid]) {
    if (idx) removeFile(indexPath(uid));
    return null;
  }
  return team;
}

/**
 * The plan a user gets from OCCUPYING A SEAT (never from their own billing).
 * Read by server/entitlement.js, which combines it with the Stripe record.
 */
export function teamPlanFor(uid) {
  const team = teamForUid(uid);
  if (!team) return null;
  // The seat is only worth what the owner is actually paying for. A lapsed Team
  // subscription must not keep entitling four other people.
  const ownerPlan = publicEntitlement(readRecord(team.ownerUid)).plan;
  if (ownerPlan !== "team") return null;
  return { plan: "team", teamId: team.id, role: team.members[uid].role };
}

/* ----------------------------------- mirror ------------------------------------ */

const memberDoc = (teamId, uid) => `/teams/${teamId}/members/${uid}`;
const teamDoc = (teamId) => `/teams/${teamId}`;

/** Publish a team's roster + shared settings to Firestore so the rules see them. */
async function mirrorTeam(team, deps = {}, removed = []) {
  const set = deps.adminSet || adminSet;
  const del = deps.adminDelete || adminDelete;
  await set(teamDoc(team.id), {
    name: team.name,
    ownerUid: team.ownerUid,
    seats: team.seats,
    brand: team.brand || {},
    updatedAt: team.updatedAt,
  });
  for (const m of Object.values(team.members)) {
    await set(memberDoc(team.id, m.uid), { role: m.role, name: m.name || null, email: m.email || null, at: m.at });
  }
  // Belt and braces for a removal whose own delete call failed: the roster is
  // authoritative, so anyone not on it must not be left in the mirror.
  for (const uid of removed) await del(memberDoc(team.id, uid)).catch(() => {});
  return true;
}

/**
 * Push the roster to Firestore, recording whether it landed.
 *
 * Never throws: a mirror failure must not undo a roster change that already
 * succeeded on the volume. `mirrorAt < updatedAt` marks the team as needing a
 * retry, which the next read performs — so sharing repairs itself rather than
 * waiting for someone to notice.
 */
async function syncMirror(team, deps = {}, removed = []) {
  const configured = deps.firestoreAdminConfigured || firestoreAdminConfigured;
  if (!configured()) return team;
  try {
    await (deps.mirrorTeam || mirrorTeam)(team, deps, removed);
    team.mirrorAt = team.updatedAt;
    writeTeam(team);
  } catch {
    /* left stale on purpose — the next read retries */
  }
  return team;
}

async function dropFromMirror(teamId, uid, deps = {}) {
  const configured = deps.firestoreAdminConfigured || firestoreAdminConfigured;
  if (!configured()) return;
  try {
    await (deps.adminDelete || adminDelete)(memberDoc(teamId, uid));
  } catch {
    /* the roster is authoritative; a stale mirror row is repaired on next sync */
  }
}

async function dropTeamMirror(teamId, deps = {}) {
  const configured = deps.firestoreAdminConfigured || firestoreAdminConfigured;
  if (!configured()) return;
  try {
    await (deps.adminDeleteCollection || adminDeleteCollection)(`/teams/${teamId}/members`);
    await (deps.adminDeleteCollection || adminDeleteCollection)(`/teams/${teamId}/templates`);
    await (deps.adminDelete || adminDelete)(teamDoc(teamId));
  } catch {
    /* best effort — the team file is gone, so no seat is granted either way */
  }
}

/* ------------------------------------ seats ------------------------------------ */

/** Pending (unexpired) invites, oldest first. Expired ones are ignored, not kept. */
export function pendingInvites(team, now = Date.now()) {
  return Object.entries(team.invites || {})
    .map(([token, inv]) => ({ token, ...inv }))
    .filter((inv) => inv.expiresAt > now)
    .sort((a, b) => a.at - b.at);
}

/**
 * Seats in use. A pending invite holds a seat: without that, five invites to a
 * five-seat team all succeed and the fourth person to accept is turned away by
 * an error they cannot do anything about.
 */
export function seatsUsed(team, now = Date.now()) {
  return Object.keys(team.members || {}).length + pendingInvites(team, now).length;
}

/* ---------------------------------- lifecycle ---------------------------------- */

const newId = () => "tm_" + randomBytes(9).toString("base64url");
const newToken = () => randomBytes(24).toString("base64url");

/** A workspace name that isn't "Untitled": the email domain is what people type anyway. */
export function defaultTeamName(email = "", name = "") {
  const domain = String(email).split("@")[1] || "";
  const label = domain.split(".")[0];
  if (label && !["gmail", "outlook", "hotmail", "yahoo", "icloud", "proton", "protonmail", "me", "live", "aol", "gmx", "mail", "yandex", "zoho"].includes(label.toLowerCase())) {
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const who = (name || String(email).split("@")[0] || "My").trim();
  return `${who}'s team`;
}

function createTeam({ uid, email, name }, now = Date.now()) {
  const team = {
    id: newId(),
    name: defaultTeamName(email, name),
    ownerUid: uid,
    seats: DEFAULT_SEATS,
    brand: { logo: null, colors: [], fonts: [], updatedAt: now },
    members: { [uid]: { uid, email: email || null, name: name || null, role: "owner", at: now } },
    invites: {},
    createdAt: now,
    updatedAt: now,
    mirrorAt: 0,
  };
  writeTeam(team);
  writeJson(indexPath(uid), { teamId: team.id });
  return team;
}

/* ------------------------------- public projection ----------------------------- */

/** What a caller is allowed to see. Invite tokens are links — managers only. */
export function projectTeam(team, uid, { sharing = true, now = Date.now() } = {}) {
  const me = team.members[uid] || null;
  const role = me?.role || null;
  const manager = role === "owner" || role === "admin";
  return {
    team: {
      id: team.id,
      name: team.name,
      seats: team.seats,
      brand: team.brand || {},
      ownerUid: team.ownerUid,
      createdAt: team.createdAt,
    },
    role,
    members: Object.values(team.members)
      .map((m) => ({ uid: m.uid, email: m.email, name: m.name, role: m.role, at: m.at }))
      .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.at - b.at),
    invites: manager
      ? pendingInvites(team, now).map((i) => ({ token: i.token, email: i.email, role: i.role, at: i.at, expiresAt: i.expiresAt }))
      : pendingInvites(team, now).map((i) => ({ email: i.email, role: i.role, at: i.at, expiresAt: i.expiresAt })),
    seatsUsed: seatsUsed(team, now),
    seatsTotal: team.seats,
    sharing,
  };
}

/* -------------------------------- request helpers ------------------------------- */

async function authed(headers, deps) {
  const verify = deps.verifyIdTokenClaims || verifyIdTokenClaims;
  let claims;
  try {
    claims = await verify(headers.authorization || headers.Authorization);
  } catch {
    throw new Error("unauthorized");
  }
  return { uid: claims.sub, email: claims.email || null, name: claims.name || null };
}

function ownPlan(uid, deps = {}) {
  try {
    return (deps.publicEntitlement || publicEntitlement)((deps.readRecord || readRecord)(uid)).plan || "free";
  } catch {
    return "free";
  }
}

function originFrom(headers = {}) {
  if (process.env.PUBLIC_URL) return String(process.env.PUBLIC_URL).replace(/\/+$/, "");
  const proto = headers["x-forwarded-proto"] || "https";
  const host = headers["host"] || "appshots.nextechlabs.tech";
  return `${proto}://${host}`;
}

let inviteWindow = 0;
let inviteCount = 0;
function chargeInviteBudget(now) {
  if (now - inviteWindow > 60_000) {
    inviteWindow = now;
    inviteCount = 0;
  }
  if (++inviteCount > MAX_INVITES_PER_MINUTE) throw new Error("rate-limited");
}
/** Test hook. */
export function _resetInviteBudget() {
  inviteWindow = 0;
  inviteCount = 0;
}

async function sendInviteEmail({ to, teamName, inviterName, link, role }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return { sent: false, reason: "smtp-not-configured" };
  await sendMail({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_SECURE || "") !== "false",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || `AppShots <${process.env.SMTP_USER}>`,
    to,
    subject: `${inviterName || "Someone"} invited you to ${teamName} on AppShots`,
    text: [
      `${inviterName || "A teammate"} invited you to join ${teamName} on AppShots as ${role === "admin" ? "an admin" : "a member"}.`,
      ``,
      `Accept the invite:`,
      link,
      ``,
      `The link works once and expires in ${Math.round(INVITE_TTL_MS / 86_400_000)} days.`,
      `If you weren't expecting this, you can ignore it — nothing happens until you accept.`,
      ``,
      `— AppShots`,
    ].join("\n"),
  });
  return { sent: true };
}

/* ---------------------------------- endpoints ---------------------------------- */

/**
 * One team API call. Throws machine-readable codes that server/handlers.js maps
 * to statuses; returns the JSON body on success.
 */
export async function handleTeam({ method, path: pathname, body = {}, headers = {} }, deps = {}) {
  const now = deps.now || Date.now();
  const sharing = (deps.firestoreAdminConfigured || firestoreAdminConfigured)();
  const rest = pathname.replace(/^\/api\/team\/?/, "");

  // Preview an invite BEFORE signing in: the invitee may not have an account
  // yet, and asking someone to sign up for an unnamed thing loses most of them.
  if (method === "GET" && rest.startsWith("invite/")) {
    const token = validToken(rest.slice("invite/".length));
    const found = token ? lookupInvite(token, now) : null;
    if (!found) return { invite: null, error: "invite-invalid" };
    return {
      invite: {
        teamName: found.team.name,
        role: found.invite.role,
        email: found.invite.email,
        invitedBy: found.invite.invitedByName || null,
        expiresAt: found.invite.expiresAt,
      },
    };
  }

  const me = await authed(headers, deps);

  if (method === "GET" && rest === "") return getTeam(me, { sharing, now, deps });
  if (method === "POST" && rest === "join") return joinTeam(me, body, { sharing, now, deps });

  const team = teamForUid(me.uid);
  if (!team) throw new Error("no-team");
  const role = team.members[me.uid].role;

  if (method === "PATCH" && rest === "") return patchTeam(team, role, body, { sharing, now, deps, uid: me.uid });
  if (method === "DELETE" && rest === "") return disband(team, role, { deps, uid: me.uid });
  if (method === "POST" && rest === "transfer") return transferOwner(team, role, body, { sharing, now, deps, uid: me.uid });
  if (method === "POST" && rest === "invites") return invite(team, role, me, body, { sharing, now, deps, headers });
  if (method === "DELETE" && rest.startsWith("invites/"))
    return revokeInvite(team, role, rest.slice("invites/".length), { sharing, now, deps, uid: me.uid });
  if (method === "PATCH" && rest.startsWith("members/"))
    return setRole(team, role, rest.slice("members/".length), body, { sharing, now, deps, uid: me.uid });
  if (method === "DELETE" && rest.startsWith("members/"))
    return removeMember(team, role, rest.slice("members/".length), { sharing, now, deps, uid: me.uid });

  throw new Error("not-found");
}

function lookupInvite(token, now) {
  const ptr = readJson(invitePath(token));
  const team = ptr?.teamId ? readTeam(ptr.teamId) : null;
  const invite = team?.invites?.[token] || null;
  if (!team || !invite) {
    if (ptr) removeFile(invitePath(token));
    return null;
  }
  if (invite.expiresAt <= now) return null;
  return { team, invite };
}

async function getTeam(me, { sharing, now, deps }) {
  let team = teamForUid(me.uid);

  // Someone who just bought Team should land in a workspace, not on a button
  // that asks them to make one. The subscription IS the intent.
  if (!team && ownPlan(me.uid, deps) === "team") {
    team = (deps.createTeam || createTeam)(me, now);
    team = await syncMirror(team, deps);
  }
  if (!team) {
    return { team: null, role: null, members: [], invites: [], seatsUsed: 0, seatsTotal: DEFAULT_SEATS, sharing };
  }
  // Self-healing: a mirror that failed during an earlier write is retried here,
  // so shared access comes back on its own instead of on a support ticket.
  if (sharing && (team.mirrorAt || 0) < team.updatedAt) team = await syncMirror(team, deps);
  return projectTeam(team, me.uid, { sharing, now });
}

async function patchTeam(team, role, body, { sharing, now, deps, uid }) {
  if (!can(role, "editTeam")) throw new Error("forbidden");
  if (body.name !== undefined) {
    const name = String(body.name || "").trim().slice(0, 60);
    if (!name) throw new Error("invalid-name");
    team.name = name;
  }
  if (body.brand !== undefined) {
    if (!can(role, "editBrand")) throw new Error("forbidden");
    team.brand = sanitizeBrand(body.brand, now);
  }
  team.updatedAt = now;
  writeTeam(team);
  await syncMirror(team, deps);
  return projectTeam(team, uid, { sharing, now });
}

/**
 * Keep the brand kit small and boring. It is mirrored into a Firestore document
 * whose indexed fields reject anything over 1500 bytes, so a pasted data-URL
 * logo would fail the write — the client uploads to the blob store and sends the
 * short URL, and this refuses anything longer.
 */
export function sanitizeBrand(brand = {}, now = Date.now()) {
  // CSS hex is 3, 4, 6 or 8 digits — nothing in between. Accepting "#12345"
  // would store a colour that renders as nothing at all.
  const colorRe = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  // Fonts are ids from the editor's own list, so a slug is the whole vocabulary.
  const fontRe = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const logo = typeof brand.logo === "string" && brand.logo.length <= 512 && !brand.logo.startsWith("data:") ? brand.logo : null;
  return {
    logo,
    colors: (Array.isArray(brand.colors) ? brand.colors : []).filter((c) => typeof c === "string" && colorRe.test(c)).slice(0, 12),
    fonts: (Array.isArray(brand.fonts) ? brand.fonts : []).filter((f) => typeof f === "string" && fontRe.test(f)).slice(0, 6),
    updatedAt: now,
  };
}

async function disband(team, role, { deps, uid }) {
  if (!can(role, "disband")) throw new Error("forbidden");
  for (const m of Object.values(team.members)) removeFile(indexPath(m.uid));
  for (const token of Object.keys(team.invites || {})) removeFile(invitePath(token));
  removeFile(teamPath(team.id));
  await dropTeamMirror(team.id, deps);
  return { ok: true, disbanded: team.id, by: uid };
}

async function transferOwner(team, role, body, { sharing, now, deps, uid }) {
  if (!can(role, "transferOwner")) throw new Error("forbidden");
  const target = validUid(body.uid);
  const next = target ? team.members[target] : null;
  if (!next) throw new Error("not-a-member");
  if (target === uid) throw new Error("already-owner");
  // The billing stays with whoever pays Stripe. Handing over the workspace while
  // the subscription still belongs to the old owner would leave a team whose
  // seats nobody is paying for, so the old owner keeps admin and keeps paying.
  team.members[target].role = "owner";
  team.members[uid].role = "admin";
  team.ownerUid = target;
  team.updatedAt = now;
  writeTeam(team);
  await syncMirror(team, deps);
  return projectTeam(team, uid, { sharing, now });
}

async function invite(team, role, me, body, { sharing, now, deps, headers }) {
  if (!can(role, "invite")) throw new Error("forbidden");
  chargeInviteBudget(now);

  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(email)) throw new Error("invalid-email");
  const inviteRole = body.role === "admin" ? "admin" : "member";

  if (Object.values(team.members).some((m) => (m.email || "").toLowerCase() === email)) throw new Error("already-a-member");
  if (pendingInvites(team, now).some((i) => i.email === email)) throw new Error("already-invited");
  if (seatsUsed(team, now) >= team.seats) throw new Error("no-seats-left");

  const token = newToken();
  team.invites[token] = {
    email,
    role: inviteRole,
    at: now,
    expiresAt: now + INVITE_TTL_MS,
    invitedBy: me.uid,
    invitedByName: me.name || me.email || null,
  };
  // Expired invites are dropped on write rather than accumulating forever —
  // they already do not hold a seat, and a stale list is a confusing one.
  for (const [t, inv] of Object.entries(team.invites)) if (inv.expiresAt <= now) delete team.invites[t];
  team.updatedAt = now;
  writeTeam(team);
  writeJson(invitePath(token), { teamId: team.id });

  const link = `${originFrom(headers)}/join/${token}`;
  let delivery = { sent: false, reason: "smtp-not-configured" };
  try {
    delivery = await (deps.sendInviteEmail || sendInviteEmail)({
      to: email,
      teamName: team.name,
      inviterName: me.name || me.email,
      link,
      role: inviteRole,
    });
  } catch {
    // The invite exists and the link is returned either way — a mail outage must
    // not lose the seat reservation, and the inviter can always copy the link.
    delivery = { sent: false, reason: "smtp-failed" };
  }
  return { ...projectTeam(team, me.uid, { sharing, now }), invited: { email, role: inviteRole, token, link, ...delivery } };
}

async function revokeInvite(team, role, token, { sharing, now, deps, uid }) {
  if (!can(role, "revokeInvite")) throw new Error("forbidden");
  const t = validToken(token);
  if (!t || !team.invites[t]) throw new Error("invite-invalid");
  delete team.invites[t];
  removeFile(invitePath(t));
  team.updatedAt = now;
  writeTeam(team);
  return projectTeam(team, uid, { sharing, now });
}

async function joinTeam(me, body, { sharing, now, deps }) {
  const token = validToken(body.token);
  const found = token ? lookupInvite(token, now) : null;
  if (!found) throw new Error("invite-invalid");
  const { team, invite: inv } = found;

  // Already seated somewhere: joining a second team would silently move the
  // person's plan and shared library out from under them.
  const existing = teamForUid(me.uid);
  if (existing && existing.id !== team.id) throw new Error("already-in-a-team");
  if (team.members[me.uid]) {
    delete team.invites[token];
    removeFile(invitePath(token));
    writeTeam(team);
    return { ...projectTeam(team, me.uid, { sharing, now }), joined: false, already: true };
  }
  // The invite already reserved this person's seat, so count the roster only.
  if (Object.keys(team.members).length >= team.seats) throw new Error("no-seats-left");
  // An invite is addressed to an inbox. Letting a forwarded link seat anyone who
  // opens it turns a private workspace into a public one.
  if (inv.email && me.email && inv.email !== String(me.email).toLowerCase()) throw new Error("invite-wrong-email");

  team.members[me.uid] = { uid: me.uid, email: me.email, name: me.name, role: inv.role, at: now };
  delete team.invites[token];
  team.updatedAt = now;
  writeTeam(team);
  writeJson(indexPath(me.uid), { teamId: team.id });
  removeFile(invitePath(token));
  await syncMirror(team, deps);
  return { ...projectTeam(team, me.uid, { sharing, now }), joined: true };
}

async function setRole(team, role, targetUid, body, { sharing, now, deps, uid }) {
  const target = validUid(targetUid);
  const member = target ? team.members[target] : null;
  if (!member) throw new Error("not-a-member");
  if (!can(role, "setRole", member.role)) throw new Error("forbidden");
  const next = body.role;
  if (next !== "admin" && next !== "member") throw new Error("invalid-role");
  // The owner is the payer; demoting them here would orphan the subscription.
  // Handing the workspace over is a separate, explicit act (POST /transfer).
  if (member.role === "owner") throw new Error("cannot-change-owner");
  member.role = next;
  team.updatedAt = now;
  writeTeam(team);
  await syncMirror(team, deps);
  return projectTeam(team, uid, { sharing, now });
}

async function removeMember(team, role, targetUid, { sharing, now, deps, uid }) {
  const target = validUid(targetUid);
  const member = target ? team.members[target] : null;
  if (!member) throw new Error("not-a-member");
  const leaving = target === uid;
  // Anyone may leave; removing someone else needs the rank for it.
  if (!leaving && !can(role, "removeMember", member.role)) throw new Error("forbidden");
  if (member.role === "owner") throw new Error("owner-must-transfer-or-disband");

  delete team.members[target];
  removeFile(indexPath(target));
  team.updatedAt = now;
  writeTeam(team);
  await dropFromMirror(team.id, target, deps);
  await syncMirror(team, deps, [target]);
  if (leaving) return { ok: true, left: true, team: null, role: null, members: [], invites: [], seatsUsed: 0, seatsTotal: team.seats, sharing };
  return projectTeam(team, uid, { sharing, now });
}

/* ------------------------- cascades used by account deletion ------------------- */

/**
 * Detach a user from teams before their account is erased.
 *
 * An owner's team is disbanded: their subscription is being cancelled in the
 * same breath, so the seats it paid for stop existing with it. Leaving the team
 * standing would strand members on a plan nobody is paying for.
 */
export async function purgeTeamsForUid(uid, deps = {}) {
  const team = teamForUid(uid);
  if (!team) return { disbanded: false, left: false };
  if (team.ownerUid === uid) {
    for (const m of Object.values(team.members)) removeFile(indexPath(m.uid));
    for (const token of Object.keys(team.invites || {})) removeFile(invitePath(token));
    removeFile(teamPath(team.id));
    await dropTeamMirror(team.id, deps);
    return { disbanded: true, left: false, teamId: team.id, members: Object.keys(team.members).length };
  }
  delete team.members[uid];
  removeFile(indexPath(uid));
  team.updatedAt = Date.now();
  writeTeam(team);
  await dropFromMirror(team.id, uid, deps);
  return { disbanded: false, left: true, teamId: team.id };
}
