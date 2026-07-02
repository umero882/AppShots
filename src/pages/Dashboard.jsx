import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Image as ImageIcon, Crown, Copy, Shuffle } from "lucide-react";
import Navbar from "../components/Navbar";
import ScreenCanvas from "../components/ScreenCanvas";
import { useAuth } from "../lib/auth";
import { backend } from "../lib/backend";
import { defaultProjectState } from "../lib/templates";
import TemplatePicker from "../components/TemplatePicker";
import { templateToProjectState, textPosFor, makeVariantState, nextVariantName } from "../lib/galleryTemplates";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    backend.listProjects(user.id).then((p) => {
      if (active) {
        setProjects(p);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [user.id]);

  async function createFrom(template) {
    setPickerOpen(false);
    setCreating(true);
    try {
      const project = await backend.createProject(user.id, {
        name: template ? template.name : "Untitled project",
        state: template ? templateToProjectState(template) : defaultProjectState(),
      });
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
    });
    setProjects((list) => [copy, ...list]);
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Your projects
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
            <Plus size={18} /> {creating ? "Creating…" : "New project"}
          </button>
        </div>

        {loading ? (
          <div className="mt-16 text-center text-slate-400">Loading projects…</div>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={() => setPickerOpen(true)} creating={creating} />
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
                <div className="mt-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {(p.state.screens?.length || 1)} screen
                      {(p.state.screens?.length || 1) > 1 ? "s" : ""} ·{" "}
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
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
                    <button
                      onClick={(e) => remove(e, p.id)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                      aria-label="Delete project"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
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

function EmptyState({ onCreate, creating }) {
  return (
    <div className="card mt-10 flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15 text-brand-300">
        <ImageIcon size={26} />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-white">No projects yet</h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-400">
        Create your first project to start building store screenshots.
      </p>
      <button onClick={onCreate} disabled={creating} className="btn-primary mt-6">
        <Plus size={18} /> Create your first project
      </button>
    </div>
  );
}
