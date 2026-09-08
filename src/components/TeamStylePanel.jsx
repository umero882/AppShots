import { useCallback, useEffect, useState } from "react";
import { Users, Plus, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTeam } from "../lib/teamContext";
import { backend } from "../lib/backend";
import ScreenCanvas from "./ScreenCanvas";
import { textPosFor } from "../lib/galleryTemplates";
import { defaultProjectState } from "../lib/templates";
import { applyTeamTemplate, canDeleteTemplate, styleFromState, suggestTemplateName } from "../lib/teamTemplates";

/**
 * The workspace's own templates, inside the editor's Templates tab.
 *
 * Renders nothing at all when there is no workspace — the editor sidebar is
 * cramped, and an empty "Team" heading is worse than no heading.
 */
export default function TeamStylePanel({ state, projectName, update }) {
  const { user } = useAuth();
  const team = useTeam();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const teamId = team.sharing ? team.teamId : null;

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    Promise.resolve(backend.listTeamTemplates(teamId))
      .then(setTemplates)
      .catch(() => setError("Couldn't load the team's templates."))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!teamId) return null;

  async function saveCurrent() {
    setSaving(true);
    setError("");
    try {
      const created = await backend.saveTeamTemplate(teamId, {
        name: suggestTemplateName(projectName, templates),
        style: styleFromState(state),
        createdBy: user.id,
        createdByName: user.name || user.email,
      });
      setTemplates((list) => [created, ...list]);
    } catch {
      setError("Couldn't save that as a team template.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    setTemplates((list) => list.filter((t) => t.id !== id));
    try {
      await backend.deleteTeamTemplate(teamId, id);
    } catch {
      load(); // put it back if the delete was refused
    }
  }

  return (
    <div className="border-t border-white/5 pt-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Users size={13} /> {team.team?.name}
        </p>
        <button onClick={saveCurrent} disabled={saving} className="btn-ghost px-2 py-1 text-xs">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Save style
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          No shared styles yet. &ldquo;Save style&rdquo; puts this project&rsquo;s look — background, type,
          layout — where the whole team can start from it.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {templates.map((t) => (
            <div key={t.id} className="group relative">
              <button
                onClick={() => update((prev) => applyTeamTemplate(prev, t))}
                className="block w-full overflow-hidden rounded-xl border border-white/10 bg-ink-900 p-2 transition hover:border-brand-500/50"
                title={`Apply “${t.name}”${t.createdByName ? ` · by ${t.createdByName}` : ""}`}
              >
                {/* Over a default state, never bare: a template saved before a
                    style field existed would otherwise render as a crash in the
                    sidebar rather than as a slightly plain thumbnail. */}
                <ScreenCanvas
                  state={{ ...defaultProjectState(), ...(t.style || {}), _textPos: textPosFor(t.style?.layoutId) }}
                  screen={{ heading: t.name, image: null }}
                  width={110}
                />
                <p className="mt-1.5 truncate text-[11px] text-slate-300">{t.name}</p>
              </button>
              {canDeleteTemplate(t, user.id, team.role) && (
                <button
                  onClick={() => remove(t.id)}
                  className="absolute right-1.5 top-1.5 hidden rounded-lg bg-ink-950/80 p-1.5 text-slate-400 backdrop-blur transition hover:text-red-400 group-hover:block"
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
