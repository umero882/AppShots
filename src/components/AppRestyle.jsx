import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowRight, Loader2, Plus } from "lucide-react";
import ScreenCanvas from "./ScreenCanvas";
import { defaultProjectState } from "../lib/templates";
import { getDevice } from "../lib/devices";
import { saveLandingDraft } from "../lib/landingDraft";

// Apple's public iTunes Search API and its image host both allow cross-origin
// reads, so a visitor can pull their own live listing with no account.
const SEARCH = "https://itunes.apple.com/search?entity=software&limit=5&term=";
const shot = (url, size) => url.replace(/\/\d+x\d+[a-z]*\.(jpg|png|webp)$/i, `/${size}bb.jpg`);
const shortName = (n) => n.split(/[:–—|-]/)[0].trim().slice(0, 26);

// First sentence of the store description, if it is short enough for a banner.
function tagline(desc = "") {
  const first = desc.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] || "";
  return first.length >= 8 && first.length <= 56 ? first : "";
}

async function toDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

const mix = (c, to, t) => c.map((v, i) => Math.round(v + (to[i] - v) * t));
const rgb = (c) => `rgb(${c.join(",")})`;

// Average colour of the icon: the brand colour the new art is built around.
function iconColor(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 16;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const max = Math.max(d[i], d[i + 1], d[i + 2]);
        const min = Math.min(d[i], d[i + 1], d[i + 2]);
        if (max - min < 24) continue; // skip white/grey/black: they wash out the brand colour
        r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
      }
      resolve(n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : [99, 102, 241]);
    };
    img.onerror = () => resolve([99, 102, 241]);
    img.src = dataUrl;
  });
}

// What the phone in the banner shows: the app's icon and name on its own colour.
function splash(icon, name, c1, c2) {
  const esc = name.replace(/[<>&"]/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>` +
    `<clipPath id="r"><rect x="115" y="300" width="160" height="160" rx="36"/></clipPath></defs>` +
    `<rect width="390" height="844" fill="url(#g)"/>` +
    `<image href="${icon}" x="115" y="300" width="160" height="160" clip-path="url(#r)"/>` +
    `<text x="195" y="520" font-family="Inter, Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${esc}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// A preview that is at most `max` px wide and shrinks to its container, so a
// banner never forces sideways scrolling on a phone.
function Fluid({ max, children }) {
  const ref = useRef(null);
  const [w, setW] = useState(max);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => setW(Math.min(max, Math.round(el.clientWidth) || max));
    set();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return (
    <div ref={ref} style={{ width: max, maxWidth: "100%" }}>
      <div className="overflow-hidden rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.4)] ring-1 ring-white/10">
        {children(w)}
      </div>
    </div>
  );
}

const PLACEMENTS = [
  { id: "aso-header", width: 600, label: "Product page header" },
  { id: "aso-search", width: 380, label: "Search results card" },
  { id: "iae-card", width: 380, label: "In-App Event card" },
];

export default function AppRestyle({ ctaTo }) {
  const [q, setQ] = useState("");
  const [apps, setApps] = useState([]);
  const [app, setApp] = useState(null);
  const [brand, setBrand] = useState(null); // { icon, splash, css }
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
      const list = j.results || [];
      setApps(list);
      setApp(list[0] || null);
      if (!list.length) setError("No App Store app found. Try the exact name.");
    } catch {
      setError("Couldn't reach the App Store right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const name = app ? shortName(app.trackName) : "";

  // Build the brand kit (icon, colour, splash) whenever the chosen app changes.
  useEffect(() => {
    setBrand(null);
    if (!app) return undefined;
    let live = true;
    (async () => {
      try {
        const icon = await toDataUrl(app.artworkUrl512 || app.artworkUrl100);
        const c = await iconColor(icon);
        const c1 = rgb(mix(c, [255, 255, 255], 0.08));
        const c2 = rgb(mix(c, [0, 0, 0], 0.45));
        if (live) setBrand({ icon, splash: splash(icon, name, c1, c2), css: `linear-gradient(135deg, ${c1}, ${c2})` });
      } catch {
        if (live) setBrand(null);
      }
    })();
    return () => { live = false; };
  }, [app, name]);

  async function carry() {
    setSaving(true);
    saveLandingDraft({
      deviceId: "aso-header",
      heading: name,
      screens: [{ heading: name, subheading: tagline(app.description), image: brand.splash }],
      background: { type: "gradient", gradient: "indigo", solid: "", aiGradient: { css: brand.css } },
    });
    navigate(ctaTo);
  }

  return (
    <section id="restyle" className="border-t border-white/5">
      <div className="mx-auto max-w-7xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="chip mx-auto">New App Store placements · iOS 27</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Beyond screenshots: your iOS 27 art
          </h2>
          <p className="mt-4 text-slate-400">
            iOS 27 adds a header banner, a search results card and In-App Event art. Type your
            app&apos;s name and see them built from your own icon and brand colour.
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
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <img src={app.artworkUrl100} alt="" className="h-10 w-10 rounded-lg" />
              <p className="min-w-0 flex-1 text-sm text-slate-300">
                <span className="font-semibold text-white">{name}</span> on the App Store. New placements to add:
              </p>
              <span className="flex items-center gap-1.5 text-xs text-brand-300"><Plus size={14} /> Header</span>
              <span className="hidden items-center gap-1.5 text-xs text-brand-300 sm:flex"><Plus size={14} /> Search card</span>
              <span className="hidden items-center gap-1.5 text-xs text-brand-300 sm:flex"><Plus size={14} /> Event art</span>
            </div>

            {brand ? (
              <div className="flex flex-wrap items-start justify-center gap-6">
                {PLACEMENTS.map((pl) => {
                  const device = getDevice(pl.id);
                  const state = {
                    ...defaultProjectState(),
                    deviceId: pl.id,
                    background: { type: "gradient", gradient: "indigo", solid: "", aiGradient: { css: brand.css } },
                    text: { font: "inter", color: "#ffffff", size: 70, weight: 800, align: "left" },
                  };
                  const screen = {
                    id: pl.id,
                    heading: name,
                    subheading: tagline(app.description),
                    image: brand.splash,
                  };
                  return (
                    <figure key={pl.id} className="min-w-0 max-w-full">
                      <Fluid max={pl.width}>{(w) => <ScreenCanvas state={state} screen={screen} width={w} />}</Fluid>
                      <figcaption className="mt-2 text-xs text-slate-500">
                        {pl.label} · {device.canvas.w}×{device.canvas.h}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            ) : (
              <p className="flex items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Building your art…
              </p>
            )}

            {brand && (
              <div className="text-center">
                <button type="button" onClick={carry} disabled={saving} className="btn-primary px-6 py-3 text-base">
                  {saving ? "Opening…" : `Make ${name}'s header`} <ArrowRight size={18} />
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  A starting point built from your icon. Swap in your own screenshot and copy in the editor.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
