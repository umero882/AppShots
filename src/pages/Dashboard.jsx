import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, Image as ImageIcon, Crown, Copy, Shuffle, CheckCircle2, Users, Share2, Lock } from "lucide-react";
import Navbar from "../components/Navbar";
import VerifyEmailBanner from "../components/VerifyEmailBanner";
import ScreenCanvas from "../components/ScreenCanvas";
import { useAuth } from "../lib/auth";
import { useTeam } from "../lib/teamContext";
import { trackPurchase, trackProjectCreated } from "../lib/analytics";
import { backend } from "../lib/backend";
import { defaultProjectState } from "../lib/templates";
import TemplatePicker from "../components/TemplatePicker";
import { templateToProjectState, textPosFor, makeVariantState, nextVariantName } from "../lib/galleryTemplates";

export default function Dashboard() {
  const { user, refreshEntitlement } = useAuth();
  const team = useTeam();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [checkoutOk, setCheckoutOk] = useState(false);
  // "mine" or "team". The team library is a different query, not a filter of the
  // personal one — a teammate's project was never in the personal list.
  const [scope, setScope] = useState("mine");
  const [sharingId, setSharingId] = useState(null);

  const teamId = team.sharing ? team.teamId : null;
  const inTeamScope = scope === "team" && !!teamId;

  // A workspace that goes away (left, disbanded) must not strand the view on an
  // empty tab it can no longer query.
  useEffect(() => {
    if (!teamId && scope === "team") setScope("mine");
  }, [teamId, scope]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const load = inTeamScope ? backend.listTeamProjects(teamId) : backend.listProjects(user.id);
    Promise.resolve(load)
      .then((p) => {
        if (active) {
          setProjects(p);
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user.id, inTeamScope, teamId]);

  /** Names for the "shared by" line — uids alone tell a teammate nothing. */
  const memberName = (uid) => {
    if (uid === user.id) return "you";
    const m = team.members.find((x) => x.uid === uid);
    return m?.name || m?.email || "a teammate";
  };

  async function toggleShare(e, p) {
    e.preventDefault();
    e.stopPropagation();
    if (!teamId) return;
    setSharingId(p.id);
    try {
      const next = p.teamId ? null : teamId;
      await backend.setProjectTeam(p.id, next);
      setProjects((list) =>
        // Un-sharing while looking at the team library removes it from view;
        // anywhere else it just loses its badge.
        inTeamScope && !next ? list.filter((x) => x.id !== p.id) : list.map((x) => (x.id === p.id ? { ...x, teamId: next } : x)),
      );
    } finally {
      setSharingId(null);
    }
  }

  // Returning from Stripe Checkout: reconcile entitlement live (don't wait for the
  // webhook), confirm the upgrade, and strip the query so a refresh won't re-fire.
  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    const sessionId = searchParams.get("session_id") || undefined;
    setCheckoutOk(true);
    // Only count the purchase once the SERVER confirms the plan. The redirect
    // happens whether or not the payment settled, so trusting it would inflate
    // conversions with abandoned and failed payments.
    refreshEntitlement({ sessionId })
      .then((ent) => {
        if (ent?.plan && ent.plan !== "free") {
          trackPurchase({ plan: ent.plan, transactionId: sessionId, value: undefined });
        }
      })
      .catch(() => {});
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    next.delete("session_id");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createFrom(template) {
    setPickerOpen(false);
    setCreating(true);
    try {
      const project = await backend.createProject(user.id, {
        name: template ? template.name : "Untitled project",
        state: template ? templateToProjectState(template) : defaultProjectState(),
        // Starting from the team library makes a team project — otherwise the
        // new file lands somewhere the person who opened the tab wasn't looking.
        teamId: inTeamScope ? teamId : null,
      });
      trackProjectCreated({ source: template ? "template" : "blank" });
      navigate(`/editor/${project.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function remove(e, id) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this project? This can't be undone.")) return;
    await backend.deleteProject(id);
    setProjects((p) => p.filter((x) => x.id !== id));
  }

  async function duplicate(e, p) {
    e.preventDefault();
    e.stopPropagation();
    const copy = await backend.createProject(user.id, {
      name: `${p.name} copy`,
      state: JSON.parse(JSON.stringify(p.state)),
      teamId: p.teamId || null,
    });
    setProjects((list) => [copy, ...list]);
  }

  // A/B variant: a restyled copy (same content + device, distinct look) so users
  // can upload two styles to the store and test which converts better.
  async function abVariant(e, p) {
    e.preventDefault();
    e.stopPropagation();
    const seed = Math.floor(Math.random() * 997);
    const variantState = makeVariantState(p.state, seed);
    const copy = await backend.createProject(user.id, {
      name: nextVariantName(projects, p.name),
      state: JSON.parse(JSON.stringify(variantState)),
      teamId: p.teamId || null,
    });
    setProjects((list) => [copy, ...list]);
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 py-10">
        {checkoutOk && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>
              You’re on the <span className="font-semibold capitalize">{user.plan}</span> plan — thanks for
              upgrading! Watermark-free, full-resolution exports are unlocked.
            </span>
            <button
              onClick={() => setCheckoutOk(false)}
              className="ml-auto shrink-0 text-emerald-300/70 hover:text-emerald-200"
            >
              Dismiss
            </button>
          </div>
        )}
        <VerifyEmailBanner />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {inTeamScope ? `${team.team?.name} library` : "Your projects"}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Welcome back, {user.name}.{" "}
              <span className="inline-flex items-center gap-1">
                {user.plan === "free" ? (
                  <Link to="/pricing" className="text-brand-300 hover:text-brand-200">
                    Upgrade for watermark-free exports
                  </Link>
                ) : (
                  <span className="chip">
                    <Crown size={12} className="text-amber-300" />
                    {user.plan} plan
                  </span>
                )}
              </span>
            </p>
          </div>
          <button onClick={() => setPickerOpen(true)} disabled={creating} className="btn-primary">
            <Plus size={18} /> {creating ? "Creating…" : inTeamScope ? "New team project" : "New project"}
          </button>
        </div>

        {teamId && (
          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
            <button
              onClick={() => setScope("mine")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${scope === "mine" ? "bg-brand-600 text-white" : "text-slate-300"}`}
            >
              My projects
            </button>
            <button
              onClick={() => setScope("team")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${scope === "team" ? "bg-brand-600 text-white" : "text-slate-300"}`}
            >
              <Users size={14} /> Team library
            </button>
          </div>
        )}

        {loading ? (
          <div className="mt-16 text-center text-slate-400">Loading projects…</div>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={() => setPickerOpen(true)} creating={creating} teamName={inTeamScope ? team.team?.name : null} />
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((p) => (
              <Link
                key={p.id}
                to={`/editor/${p.id}`}
                className="card group relative overflow-hidden p-4 transition hover:border-brand-500/40"
              >
                <div className="grid place-items-center rounded-xl bg-ink-900 p-4">
                  <ScreenCanvas
                    state={{ ...p.state, _textPos: textPosFor(p.state.layoutId) }}
                    screen={p.state.screens?.[0] || { heading: "", image: null }}
                    width={150}
                  />
                </div>
                {p.teamId && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-300 backdrop-blur">
                    <Users size={11} /> Shared
                  </span>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {(p.state.screens?.length || 1)} screen
                      {(p.state.screens?.length || 1) > 1 ? "s" : ""} ·{" "}
                      {inTeamScope ? `by ${memberName(p.userId)}` : new Date(p.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    {teamId && p.userId === user.id && (
                      <button
                        onClick={(e) => toggleShare(e, p)}
                        disabled={sharingId === p.id}
                        className={`rounded-lg p-2 transition hover:bg-white/5 ${p.teamId ? "text-brand-300" : "text-slate-500 hover:text-brand-300"}`}
                        aria-label={p.teamId ? "Make private" : "Share with team"}
                        title={p.teamId ? "Shared with the team — click to make private" : "Share with the team"}
                      >
                        {p.teamId ? <Lock size={16} /> : <Share2 size={16} />}
                      </button>
                    )}
                    <button
                      onClick={(e) => abVariant(e, p)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-brand-300"
                      aria-label="Create A/B style variant"
                      title="Create A/B variant (same content, new look)"
                    >
                      <Shuffle size={16} />
                    </button>
                    <button
                      onClick={(e) => duplicate(e, p)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white"
                      aria-label="Duplicate project"
                      title="Duplicate"
                    >
                      <Copy size={16} />
                    </button>
                    {p.userId === user.id && (
                      <button
                        onClick={(e) => remove(e, p.id)}
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                        aria-label="Delete project"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        <TemplatePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={createFrom}
        />
      </main>
    </div>
  );
}

function EmptyState({ onCreate, creating, teamName }) {
  return (
    <div className="card mt-10 flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15 text-brand-300">
        {teamName ? <Users size={26} /> : <ImageIcon size={26} />}
      </div>
      <h3 className="mt-5 text-lg font-semibold text-white">
        {teamName ? `Nothing shared with ${teamName} yet` : "No projects yet"}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-400">
        {teamName
          ? "Start one here, or share an existing project from My projects — everyone with a seat can open and edit it."
          : "Create your first project to start building store screenshots."}
      </p>
      <button onClick={onCreate} disabled={creating} className="btn-primary mt-6">
        <Plus size={18} /> {teamName ? "Create a team project" : "Create your first project"}
      </button>
    </div>
  );
}
