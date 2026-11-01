import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, Loader2 } from "lucide-react";
import ScreenCanvas from "./ScreenCanvas";
import { defaultProjectState, GRADIENTS } from "../lib/templates";
import { saveLandingDraft } from "../lib/landingDraft";

// Apple's public iTunes Search API and its image host both allow cross-origin
// reads, so a visitor can pull their own live listing with no account.
const SEARCH = "https://itunes.apple.com/search?entity=software&limit=5&term=";
const shot = (url, size) => url.replace(/\/\d+x\d+[a-z]*\.(jpg|png|webp)$/i, `/${size}bb.jpg`);
const shortName = (n) => n.split(/[:–—|-]/)[0].trim().slice(0, 26);
// Neutral sample lines: the point is to show the restyle, not to claim anything.
const SAMPLE = ["See it in action", "Built to be easy", "Everything in one place", "Start in seconds"];

async function toDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export default function AppRestyle({ ctaTo }) {
  const [q, setQ] = useState("");
  const [apps, setApps] = useState([]);
  const [app, setApp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function find(e) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setError("");
    try {
      const j = await (await fetch(SEARCH + encodeURIComponent(term))).json();
      const list = (j.results || []).filter((a) => a.screenshotUrls?.length);
      setApps(list);
      setApp(list[0] || null);
      if (!list.length) setError("No App Store app found with screenshots. Try the exact name.");
    } catch {
      setError("Couldn't reach the App Store right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const gradient = app ? GRADIENTS[app.trackId % GRADIENTS.length].id : "indigo";
  const shots = app ? app.screenshotUrls.slice(0, 4) : [];
  const name = app ? shortName(app.trackName) : "";

  async function carry() {
    setSaving(true);
    try {
      const screens = await Promise.all(
        shots.map(async (u, i) => ({
          heading: i === 0 ? name : SAMPLE[i % SAMPLE.length],
          subheading: i === 0 ? app.primaryGenreName || "" : "",
          image: await toDataUrl(shot(u, "600x1300")).catch(() => null),
        })),
      );
      saveLandingDraft({ gradient, heading: name, screens });
    } finally {
      setSaving(false);
    }
    navigate(ctaTo);
  }

  return (
    <section id="restyle" className="border-t border-white/5">
      <div className="mx-auto max-w-7xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="chip mx-auto">Already on the App Store?</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            See your store page, restyled
          </h2>
          <p className="mt-4 text-slate-400">
            Type your app&apos;s name. We pull your live screenshots and show them the way
            AppShots would frame them.
          </p>
          <form onSubmit={find} className="mx-auto mt-6 flex max-w-md gap-2">
            <label className="sr-only" htmlFor="restyle-q">App name</label>
            <input
              id="restyle-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. Duolingo"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-950 px-3 py-2.5 text-white outline-none focus:border-brand-500"
            />
            <button type="submit" disabled={busy} className="btn-primary px-4">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Show me
            </button>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
          {apps.length > 1 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {apps.map((a) => (
                <button
                  key={a.trackId}
                  type="button"
                  aria-pressed={app?.trackId === a.trackId}
                  onClick={() => setApp(a)}
                  className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${app?.trackId === a.trackId ? "border-brand-400 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}
                >
                  <img src={a.artworkUrl60} alt="" className="h-5 w-5 rounded" />
                  {shortName(a.trackName)}
                </button>
              ))}
            </div>
          )}
        </div>

        {app && (
          <div className="mt-12 space-y-8">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Your page today</p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {shots.map((u) => (
                  <img key={u} src={shot(u, "392x696")} alt="" loading="lazy" className="h-[300px] w-auto shrink-0 rounded-xl ring-1 ring-white/10" />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand-300">With AppShots</p>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {shots.map((u, i) => {
                  const state = {
                    ...defaultProjectState(),
                    background: { type: "gradient", gradient, solid: "" },
                    deviceScale: 0.84,
                    _textPos: "top",
                    text: { font: "inter", color: "#ffffff", size: 66, weight: 800, align: "center" },
                  };
                  const screen = {
                    id: u,
                    heading: i === 0 ? name : SAMPLE[i % SAMPLE.length],
                    subheading: i === 0 ? app.primaryGenreName || "" : "",
                    image: shot(u, "600x1300"),
                  };
                  return (
                    <div key={u} className="shrink-0 drop-shadow-[0_20px_35px_rgba(0,0,0,0.45)]">
                      <ScreenCanvas state={state} screen={screen} width={190} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-center">
              <button type="button" onClick={carry} disabled={saving} className="btn-primary px-6 py-3 text-base">
                {saving ? "Saving…" : `Redo ${name}'s screenshots`} <ArrowRight size={18} />
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Sample headlines. Your real screenshots open in the editor, ready to edit.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
