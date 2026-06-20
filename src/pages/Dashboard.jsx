import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Image as ImageIcon, Crown } from "lucide-react";
import Navbar from "../components/Navbar";
import ScreenCanvas from "../components/ScreenCanvas";
import { useAuth } from "../lib/auth";
import { backend } from "../lib/backend";
import { defaultProjectState } from "../lib/templates";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  async function createProject() {
    setCreating(true);
    try {
      const project = await backend.createProject(user.id, {
        name: "Untitled project",
        state: defaultProjectState(),
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
          <button onClick={createProject} disabled={creating} className="btn-primary">
            <Plus size={18} /> {creating ? "Creating…" : "New project"}
          </button>
        </div>

        {loading ? (
          <div className="mt-16 text-center text-slate-400">Loading projects…</div>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={createProject} creating={creating} />
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
                    state={{ ...p.state, _textPos: textPos(p.state) }}
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
                  <button
                    onClick={(e) => remove(e, p.id)}
                    className="rounded-lg p-2 text-slate-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    aria-label="Delete project"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function textPos(state) {
  const map = { "text-top": "top", "text-bottom": "bottom", "device-only": "none", centered: "top" };
  return map[state.layoutId] || "top";
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
