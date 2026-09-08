/**
 * Team workspaces — browser side.
 *
 * Every call goes to /api/team, which owns the roster (server/teams.js). Nothing
 * here decides who is allowed to do what; the helpers below only decide which
 * buttons are worth rendering, so a stale UI can never become an escalation.
 */
import { apiFetch, describeApiError } from "./apiClient";

export const ROLE_LABELS = { owner: "Owner", admin: "Admin", member: "Member" };
export const ROLE_HELP = {
  owner: "Billing, seats, roles — everything.",
  admin: "Invite and remove members, edit the brand kit.",
  member: "Use the shared library, templates and brand kit.",
};

export const roleLabel = (role) => ROLE_LABELS[role] || "Member";

/* ------------------------------- what to show ---------------------------------- */

export const isManager = (role) => role === "owner" || role === "admin";
export const canEditBrand = (role) => isManager(role);
export const canInvite = (role) => isManager(role);
/** Only the owner hands out roles — mirrors `can()` on the server. */
export const canSetRole = (role) => role === "owner";
export const canDisband = (role) => role === "owner";

/**
 * Is the "Remove" button worth rendering next to this member?
 * Leaving is always allowed; removing a peer is not, and the owner can never be
 * removed at all — they hold the subscription.
 */
export function canRemoveMember(myRole, target, myUid) {
  if (!target || target.role === "owner") return false;
  if (target.uid === myUid) return true; // leaving
  if (myRole === "owner") return true;
  return myRole === "admin" && target.role === "member";
}

/** "3 of 5 seats used" — and whether there is room for one more. */
export function seatSummary(team) {
  const used = team?.seatsUsed ?? 0;
  const total = team?.seatsTotal ?? 0;
  return { used, total, free: Math.max(0, total - used), full: used >= total };
}

/** Short, human relative age for invite/join timestamps. */
export function timeAgo(ts, now = Date.now()) {
  const ms = now - Number(ts || 0);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Days left on a pending invite, floored at 0. */
export const daysLeft = (expiresAt, now = Date.now()) =>
  Math.max(0, Math.ceil((Number(expiresAt || 0) - now) / 86_400_000));

/* --------------------------------- messages ------------------------------------ */

const TEAM_ERRORS = {
  "no-seats-left": "Every seat is taken. Remove a member or revoke an invite to free one up.",
  "already-a-member": "They're already on the team.",
  "already-invited": "They've already been invited — the invite is still pending.",
  "already-in-a-team": "You're already in a workspace. Leave it before joining another.",
  "invite-invalid": "This invite has expired or has already been used.",
  "invite-wrong-email": "This invite was sent to a different email address. Sign in with that address to accept it.",
  "cannot-change-owner": "The owner's role can't be changed — transfer ownership instead.",
  "owner-must-transfer-or-disband": "You own this workspace. Transfer it to someone else, or disband it.",
  "not-a-member": "That person isn't on the team any more.",
  "no-team": "You're not in a workspace yet.",
  forbidden: "You don't have permission to do that.",
  "invalid-name": "Give the workspace a name.",
  "invalid-email": "Enter a valid email address.",
};

/** Team-aware wrapper around the shared API error copy. */
export function describeTeamError(err, fallback = "Something went wrong — please try again.") {
  const code = err?.code || err?.message;
  return TEAM_ERRORS[code] || describeApiError(err, fallback);
}

/* ----------------------------------- calls ------------------------------------- */

export const getTeam = () => apiFetch("/api/team");

export const renameTeam = (name) => apiFetch("/api/team", { method: "PATCH", body: { name } });

export const saveBrandKit = (brand) => apiFetch("/api/team", { method: "PATCH", body: { brand } });

export const inviteMember = (email, role = "member") =>
  apiFetch("/api/team/invites", { method: "POST", body: { email, role } });

export const revokeInvite = (token) =>
  apiFetch(`/api/team/invites/${encodeURIComponent(token)}`, { method: "DELETE" });

export const setMemberRole = (uid, role) =>
  apiFetch(`/api/team/members/${encodeURIComponent(uid)}`, { method: "PATCH", body: { role } });

export const removeMember = (uid) =>
  apiFetch(`/api/team/members/${encodeURIComponent(uid)}`, { method: "DELETE" });

export const transferOwnership = (uid) => apiFetch("/api/team/transfer", { method: "POST", body: { uid } });

export const disbandTeam = () => apiFetch("/api/team", { method: "DELETE" });

export const joinTeam = (token) => apiFetch("/api/team/join", { method: "POST", body: { token } });

/** Preview an invite before signing in — the invitee may not have an account yet. */
export const previewInvite = (token) => apiFetch(`/api/team/invite/${encodeURIComponent(token)}`);
