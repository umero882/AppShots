import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  UserPlus,
  Crown,
  Shield,
  Mail,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Palette,
  Loader2,
  LogOut,
  ArrowRightLeft,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { Avatar } from "./Settings";
import { useAuth } from "../lib/auth";
import { useTeam } from "../lib/teamContext";
import { backend } from "../lib/backend";
import { fileToAvatarDataUrl } from "../lib/avatar";
import { FONTS } from "../lib/templates";
import {
  ROLE_HELP,
  canInvite,
  canEditBrand,
  canRemoveMember,
  canSetRole,
  canDisband,
  describeTeamError,
  daysLeft,
  roleLabel,
  seatSummary,
  timeAgo,
} from "../lib/team";

const ROLE_ICON = { owner: Crown, admin: Shield, member: Users };

/** Colour swatches are the brand kit's whole point — keep them legal and few. */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export default function Team() {
  const { user } = useAuth();
  const team = useTeam();
  const navigate = useNavigate();

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const role = team.role;
  const seats = seatSummary(team);

  async function act(key, fn, done) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const res = await fn();
      if (done) setNotice(done(res) || "");
      return res;
    } catch (e) {
      setError(describeTeamError(e));
      return null;
    } finally {
      setBusy("");
    }
  }

  if (!user) return null;

  // Free and Pro users land here from a link or a stale tab. Sell rather than 404.
  if (!team.loading && !team.team) {
    return (
      <Shell>
        <div className="card mt-8 p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/15 text-brand-300">
            <Users size={22} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-white">No workspace yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            The Team plan seats five people in one shared workspace — a shared project library,
            shared templates, a brand kit, and roles that decide who can change what.
          </p>
          <Link to="/pricing" className="btn-primary mx-auto mt-6">
            See the Team plan
          </Link>
          {team.error && <p className="mt-4 text-sm text-red-400">{team.error}</p>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {team.loading && !team.team ? (
        <p className="mt-10 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Loading your workspace…
        </p>
      ) : (
        <>
          <TeamHeader team={team} role={role} seats={seats} busy={busy} act={act} />

          {error && (
            <p className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
              {notice}
            </p>
          )}

          {!team.sharing && (
            <p className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
              Shared projects and templates are unavailable on this deployment — seats, roles and
              the brand kit still work. (The server needs <code>FIREBASE_SERVICE_ACCOUNT</code> set.)
            </p>
          )}

          <Members team={team} role={role} me={user} busy={busy} act={act} />
          <Invites team={team} role={role} seats={seats} busy={busy} act={act} />
          <BrandKit team={team} role={role} busy={busy} act={act} />
          <DangerZone team={team} role={role} me={user} busy={busy} act={act} navigate={navigate} />
        </>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-10">{children}</main>
      <Footer />
    </div>
  );
}

/* --------------------------------- header --------------------------------------- */

function TeamHeader({ team, role, seats, busy, act }) {
  const [name, setName] = useState(team.team?.name || "");
  const [editing, setEditing] = useState(false);
  useEffect(() => setName(team.team?.name || ""), [team.team?.name]);

  const editable = canEditBrand(role);
  const trimmed = name.trim();

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow">
          <Users size={22} />
        </div>
        <div>
          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!trimmed || trimmed === team.team.name) return setEditing(false);
                await act("rename", () => team.rename(trimmed));
                setEditing(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                className="input py-1.5"
                value={name}
                maxLength={60}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="btn-primary py-1.5" disabled={busy === "rename"}>
                Save
              </button>
            </form>
          ) : (
            <h1 className="text-2xl font-bold text-white">
              {team.team?.name}
              {editable && (
                <button
                  onClick={() => setEditing(true)}
                  className="ml-3 align-middle text-xs font-semibold text-slate-400 underline hover:text-slate-200"
                >
                  Rename
                </button>
              )}
            </h1>
          )}
          <p className="mt-1 text-sm text-slate-400">
            You&rsquo;re {role === "admin" ? "an" : "the"} <span className="text-slate-200">{roleLabel(role).toLowerCase()}</span>
            {" · "}
            {seats.used} of {seats.total} seats used
          </p>
        </div>
      </div>
      <div className="chip">
        <Crown size={14} className="text-amber-300" /> Team plan
      </div>
    </div>
  );
}

/* --------------------------------- members -------------------------------------- */

function Members({ team, role, me, busy, act }) {
  return (
    <section className="card mt-8 p-6 sm:p-7">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Members ({team.members.length})
      </h2>
      <ul className="mt-5 divide-y divide-white/5">
        {team.members.map((m) => {
          const Icon = ROLE_ICON[m.role] || Users;
          const isMe = m.uid === me.id;
          return (
            <li key={m.uid} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
              <Avatar name={m.name || m.email || "?"} size="h-10 w-10" text="text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">
                  {m.name || m.email}
                  {isMe && <span className="ml-2 text-xs font-normal text-slate-500">you</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{m.email}</p>
              </div>

              {canSetRole(role) && m.role !== "owner" ? (
                <select
                  className="input w-auto py-1.5 text-sm"
                  value={m.role}
                  disabled={busy === `role:${m.uid}`}
                  onChange={(e) => act(`role:${m.uid}`, () => team.setRole(m.uid, e.target.value))}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
                  <Icon size={13} className={m.role === "owner" ? "text-amber-300" : ""} />
                  {roleLabel(m.role)}
                </span>
              )}

              {canRemoveMember(role, m, me.id) && (
                <button
                  onClick={() =>
                    act(`rm:${m.uid}`, () => team.remove(m.uid), () =>
                      m.uid === me.id ? "You've left the workspace." : `${m.name || m.email} was removed.`,
                    )
                  }
                  disabled={busy === `rm:${m.uid}`}
                  className="btn-ghost py-1.5 text-slate-400 hover:text-red-300"
                  title={m.uid === me.id ? "Leave this workspace" : "Remove from workspace"}
                >
                  {m.uid === me.id ? <LogOut size={15} /> : <Trash2 size={15} />}
                  {m.uid === me.id ? "Leave" : "Remove"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 border-t border-white/5 pt-4 text-xs text-slate-500">{ROLE_HELP[role] || ROLE_HELP.member}</p>
    </section>
  );
}

/* --------------------------------- invites -------------------------------------- */

function Invites({ team, role, seats, busy, act }) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [copied, setCopied] = useState("");
  const [lastLink, setLastLink] = useState("");

  if (!canInvite(role)) return null;

  async function copy(link, token) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(token);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard blocked — the link is on screen to select by hand */
    }
  }

  return (
    <section className="card mt-6 p-6 sm:p-7">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Invite people</h2>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await act(
            "invite",
            () => team.invite(email.trim(), inviteRole),
            (r) =>
              r?.invited?.sent
                ? `Invite emailed to ${r.invited.email}.`
                : `Invite created for ${r?.invited?.email} — copy the link below, email isn't configured.`,
          );
          if (res?.invited) {
            setLastLink(res.invited.link);
            setEmail("");
          }
        }}
        className="mt-5 flex flex-wrap gap-2"
      >
        <div className="relative min-w-[16rem] flex-1">
          <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="email"
            required
            className="input pl-10"
            placeholder="teammate@company.com"
            value={email}
            disabled={seats.full}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={inviteRole}
          disabled={seats.full}
          onChange={(e) => setInviteRole(e.target.value)}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" className="btn-primary" disabled={busy === "invite" || seats.full}>
          <UserPlus size={16} /> {busy === "invite" ? "Sending…" : "Invite"}
        </button>
      </form>

      {seats.full ? (
        <p className="mt-3 text-xs text-amber-300">
          All {seats.total} seats are taken. Remove a member or revoke a pending invite to free one up.
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          {seats.free} {seats.free === 1 ? "seat" : "seats"} left. An invite holds a seat until it&rsquo;s accepted or expires.
        </p>
      )}

      {lastLink && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-ink-900 px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-xs text-slate-400">{lastLink}</code>
          <button onClick={() => copy(lastLink, "last")} className="btn-ghost py-1 text-xs">
            {copied === "last" ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copied === "last" ? "Copied" : "Copy link"}
          </button>
        </div>
      )}

      {team.invites.length > 0 && (
        <ul className="mt-6 divide-y divide-white/5 border-t border-white/5 pt-2">
          {team.invites.map((inv) => (
            <li key={inv.token || inv.email} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-200">{inv.email}</p>
                <p className="text-xs text-slate-500">
                  {roleLabel(inv.role)} · invited {timeAgo(inv.at)} · expires in {daysLeft(inv.expiresAt)}d
                </p>
              </div>
              {inv.token && (
                <>
                  <button onClick={() => copy(`${window.location.origin}/join/${inv.token}`, inv.token)} className="btn-ghost py-1 text-xs">
                    {copied === inv.token ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    {copied === inv.token ? "Copied" : "Copy link"}
                  </button>
                  <button
                    onClick={() => act(`rev:${inv.token}`, () => team.revoke(inv.token), () => "Invite revoked.")}
                    disabled={busy === `rev:${inv.token}`}
                    className="btn-ghost py-1 text-xs text-slate-400 hover:text-red-300"
                  >
                    <Trash2 size={14} /> Revoke
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------- brand kit ------------------------------------- */

/**
 * The brand kit is what makes a shared workspace feel like one company's: the
 * colours and fonts everyone reaches for, and the logo that goes on the shots.
 * It is stored on the team, applied from the editor.
 */
function BrandKit({ team, role, busy, act }) {
  const brand = team.brand || { colors: [], fonts: [], logo: null };
  const editable = canEditBrand(role);
  const fileRef = useRef(null);

  const [colors, setColors] = useState(brand.colors || []);
  const [fonts, setFonts] = useState(brand.fonts || []);
  const [logo, setLogo] = useState(brand.logo || null);
  const [draft, setDraft] = useState("#6366f1");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setColors(brand.colors || []);
    setFonts(brand.fonts || []);
    setLogo(brand.logo || null);
  }, [brand.colors, brand.fonts, brand.logo]);

  const dirty = useMemo(
    () =>
      JSON.stringify(colors) !== JSON.stringify(brand.colors || []) ||
      JSON.stringify(fonts) !== JSON.stringify(brand.fonts || []) ||
      (logo || null) !== (brand.logo || null),
    [colors, fonts, logo, brand],
  );

  async function pickLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      // The team document indexes every field, and Firestore rejects an indexed
      // value over 1500 bytes — so the logo goes to the blob store and only its
      // short URL is saved on the team. This must not touch the uploader's own
      // profile logo: a shared mark and a personal one are different things.
      const dataUrl = await fileToAvatarDataUrl(file);
      setLogo(await backend.uploadImage(dataUrl));
    } catch {
      /* surfaced by the save below if it matters */
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="card mt-6 p-6 sm:p-7">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        <Palette size={15} /> Brand kit
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Colours, fonts and a logo the whole workspace can reach from the editor.
      </p>

      {/* Colours */}
      <div className="mt-5">
        <span className="label">Brand colours</span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {colors.map((c) => (
            <span key={c} className="group relative">
              <span
                className="block h-9 w-9 rounded-lg border border-white/15"
                style={{ background: c }}
                title={c}
              />
              {editable && (
                <button
                  onClick={() => setColors(colors.filter((x) => x !== c))}
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full bg-red-600 text-white group-hover:grid"
                  aria-label={`Remove ${c}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {editable && colors.length < 12 && (
            <span className="flex items-center gap-1.5">
              <input
                type="color"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-9 w-9 cursor-pointer rounded-lg border border-white/15 bg-transparent p-0"
                aria-label="Pick a colour"
              />
              <button
                onClick={() => HEX_RE.test(draft) && !colors.includes(draft) && setColors([...colors, draft])}
                className="btn-ghost py-1.5 text-xs"
              >
                Add
              </button>
            </span>
          )}
          {!colors.length && !editable && <p className="text-sm text-slate-500">None yet.</p>}
        </div>
      </div>

      {/* Fonts */}
      <div className="mt-5">
        <span className="label">Brand fonts</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {FONTS.map((f) => {
            const on = fonts.includes(f.id);
            return (
              <button
                key={f.id}
                disabled={!editable}
                onClick={() => setFonts(on ? fonts.filter((x) => x !== f.id) : [...fonts, f.id])}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  on ? "border-brand-500 bg-brand-500/15 text-white" : "border-white/10 text-slate-300 hover:border-white/20"
                }`}
                style={{ fontFamily: f.stack }}
              >
                {f.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Logo */}
      <div className="mt-5 flex items-center gap-4">
        <Avatar avatar={logo} name={team.team?.name || "Team"} size="h-12 w-12" text="text-sm" />
        <div>
          <span className="label">Logo</span>
          {editable ? (
            <div className="mt-1 flex gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-ghost py-1.5 text-xs">
                {uploading ? "Uploading…" : logo ? "Change" : "Upload"}
              </button>
              {logo && (
                <button onClick={() => setLogo(null)} className="btn-ghost py-1.5 text-xs text-slate-400 hover:text-red-300">
                  Remove
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickLogo} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Only owners and admins can change the brand kit.</p>
          )}
        </div>
      </div>

      {editable && (
        <div className="mt-6 flex items-center gap-3 border-t border-white/5 pt-5">
          <button
            onClick={() => act("brand", () => team.saveBrand({ colors, fonts, logo }), () => "Brand kit saved.")}
            disabled={!dirty || busy === "brand"}
            className="btn-primary"
          >
            {busy === "brand" ? "Saving…" : "Save brand kit"}
          </button>
          {dirty && <span className="text-xs text-slate-500">Unsaved changes</span>}
        </div>
      )}
    </section>
  );
}

/* ------------------------------- danger zone ------------------------------------ */

function DangerZone({ team, role, me, busy, act, navigate }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [heir, setHeir] = useState("");

  const others = team.members.filter((m) => m.uid !== me.id);
  const owner = role === "owner";
  if (!owner) return null;

  return (
    <section className="card mt-6 border-red-500/20 p-6 sm:p-7">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-red-300">
        <AlertTriangle size={15} /> Workspace
      </h2>

      {others.length > 0 && (
        <div className="mt-4 border-b border-white/5 pb-5">
          <p className="text-sm font-medium text-white">Transfer ownership</p>
          <p className="mt-1 text-xs text-slate-500">
            The new owner runs the workspace. The subscription stays on your card until you change it in
            billing, so you keep an admin seat.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select className="input w-auto" value={heir} onChange={(e) => setHeir(e.target.value)}>
              <option value="">Choose a member…</option>
              {others.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
            <button
              onClick={() => act("transfer", () => team.transfer(heir), () => "Ownership transferred.")}
              disabled={!heir || busy === "transfer"}
              className="btn-ghost"
            >
              <ArrowRightLeft size={15} /> Transfer
            </button>
          </div>
        </div>
      )}

      {!canDisband(role) ? null : !open ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-400">
            Disband the workspace. Everyone loses their seat and shared projects go back to their authors.
          </p>
          <button onClick={() => setOpen(true)} className="btn-ghost text-red-300 hover:text-red-200">
            <Trash2 size={16} /> Disband
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-sm text-slate-300">
            <p className="font-semibold text-red-200">Disbanding this workspace:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
              <li>removes all {team.members.length} members from their seats</li>
              <li>deletes the shared templates and the brand kit</li>
              <li>leaves every project with the person who created it — nothing is deleted</li>
              <li>does <strong>not</strong> cancel your subscription — do that in billing</li>
            </ul>
          </div>
          <label className="block">
            <span className="label">Type DISBAND to confirm</span>
            <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DISBAND" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                await act("disband", () => team.disband());
                navigate("/dashboard");
              }}
              disabled={confirm.trim().toUpperCase() !== "DISBAND" || busy === "disband"}
              className="btn bg-red-600 text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              {busy === "disband" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Disband workspace
            </button>
            <button onClick={() => { setOpen(false); setConfirm(""); }} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
