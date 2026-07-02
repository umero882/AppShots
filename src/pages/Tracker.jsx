import { useState } from "react";
import { Search, Loader2, Star, ExternalLink, Smartphone, Tablet, Radar } from "lucide-react";
import Navbar from "../components/Navbar";
import { searchApps, STOREFRONTS } from "../lib/appStoreTracker";

/**
 * App Store tracker: research a competitor's live App Store listing — their real
 * screenshots + metadata — for benchmarking and inspiration. Powered by Apple's
 * public iTunes Search API (proxied server-side). Screenshots are shown for
 * reference and link back to the App Store; they are not copied into projects.
 */
export default function Tracker() {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("us");
  const [results, setResults] = useState(null); // null = no search yet
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run(e) {
    e?.preventDefault();
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    setErr("");
    try {
      const data = await searchApps({ q: term, id: term, country });
      setResults(data.results);
      if (!data.results.length) setErr(`No App Store results for “${term}”.`);
    } catch (ex) {
      setErr(ex.message === "bad-query" ? "Enter an app name or App Store link." : "The App Store lookup is unavailable right now — try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <div className="mb-6 max-w-2xl">
          <span className="chip mb-3 inline-flex">
            <Radar size={13} className="text-brand-300" /> App Store Tracker
          </span>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Spy on the competition</h1>
          <p className="mt-2 text-sm text-slate-400">
            Look up any app’s live App Store screenshots and metadata for benchmarking and
            inspiration. Search by name or paste an App Store link.
          </p>
        </div>

        <form onSubmit={run} className="mb-8 flex flex-wrap gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="App name or App Store URL (e.g. Duolingo)"
              className="input pl-9"
            />
          </div>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="input max-w-[190px]"
            aria-label="App Store country"
          >
            {STOREFRONTS.map((s) => (
              <option key={s.cc} value={s.cc}>{s.label}</option>
            ))}
          </select>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Search
          </button>
        </form>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
            <Loader2 size={18} className="animate-spin" /> Searching the App Store…
          </div>
        ) : err ? (
          <p className="py-16 text-center text-sm text-slate-400">{err}</p>
        ) : results === null ? (
          <p className="py-16 text-center text-sm text-slate-500">
            Search for a competitor to see their store screenshots.
          </p>
        ) : (
          <div className="space-y-6">
            {results.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function AppCard({ app }) {
  const shots = app.screenshots?.length ? app.screenshots : app.ipadScreenshots;
  const isTablet = !app.screenshots?.length && app.ipadScreenshots?.length;
  return (
    <div className="card p-4">
      <div className="flex items-start gap-4">
        {app.icon ? (
          <img src={app.icon} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" loading="lazy" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-white">{app.name}</h3>
              <p className="truncate text-xs text-slate-400">{app.developer}</p>
            </div>
            {app.url ? (
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost shrink-0 px-2 py-1.5 text-xs"
                title="Open on the App Store"
              >
                <ExternalLink size={14} /> App Store
              </a>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {app.genre && <span>{app.genre}</span>}
            {app.rating != null && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <Star size={11} className="fill-amber-300" /> {app.rating}
                <span className="text-slate-500">({fmtCount(app.ratingCount)})</span>
              </span>
            )}
            {app.price && <span>{app.price}</span>}
            {app.version && <span>v{app.version}</span>}
            <span className="inline-flex items-center gap-1">
              {isTablet ? <Tablet size={11} /> : <Smartphone size={11} />}
              {shots?.length || 0} screenshot{(shots?.length || 0) === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {shots?.length ? (
        <div className="scroll-thin mt-4 flex gap-3 overflow-x-auto pb-2">
          {shots.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="shrink-0" title="Open full size">
              <img
                src={src}
                alt={`${app.name} screenshot ${i + 1}`}
                loading="lazy"
                className="h-64 w-auto rounded-xl border border-white/10 bg-ink-900 object-contain"
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-500">No screenshots published for this listing.</p>
      )}
    </div>
  );
}

function fmtCount(n) {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
