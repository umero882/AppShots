import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Check, ArrowRight, AlertTriangle } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useAuth } from "../lib/auth";
import { ALL_SIZES, checkSize, readImageSize } from "../lib/sizeCheck";
import { fileToDataUrl, saveLandingDraft } from "../lib/landingDraft";

const GROUPS = [
  { title: "App Store (iPhone and iPad)", pick: (d) => d.store === "ios" && d.kind !== "creative" },
  { title: "Google Play (Android)", pick: (d) => d.store === "android" },
  { title: "App Store header, search and In-App Event art (iOS 27)", pick: (d) => d.kind === "creative" },
];

const chip = "rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-200";

function Names({ list }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {list.map((d) => (
        <span key={d.id} className={chip}>
          {d.name} · {d.canvas.w}×{d.canvas.h}
        </span>
      ))}
    </span>
  );
}

export default function ScreenshotSizes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [over, setOver] = useState(false);
  const [file, setFile] = useState(null);
  const [size, setSize] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function take(f) {
    setError("");
    try {
      setSize(await readImageSize(f));
      setFile(f);
    } catch {
      setFile(null);
      setSize(null);
      setError("That file isn't an image. Try a PNG or JPG.");
    }
  }

  const result = size ? checkSize(size.w, size.h) : null;
  const fits = result && result.exact.length > 0;
  const fixable = result && (result.scale.length > 0 || result.rotated.length > 0);

  async function fix() {
    setBusy(true);
    try {
      const image = await fileToDataUrl(file).catch(() => null);
      saveLandingDraft({ heading: "My screenshots", gradient: "indigo", image });
    } finally {
      setBusy(false);
    }
    navigate(user ? "/dashboard" : "/signup");
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-4xl px-5 py-14">
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
          App Store &amp; Google Play screenshot sizes
        </h1>
        <p className="mt-4 max-w-2xl text-slate-400">
          Every size AppShots exports, in pixels. Drop a screenshot below to check it against
          all of them. It never leaves your browser.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
          className={`mt-8 rounded-2xl border border-dashed p-8 text-center transition ${over ? "border-brand-400 bg-brand-500/10" : "border-white/15 bg-white/[0.02]"}`}
        >
          <Upload className="mx-auto text-brand-300" size={28} />
          <p className="mt-3 text-white">Drop your screenshot here</p>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost mt-3 px-4 py-2 text-sm">
            Choose a file
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}

        {result && (
          <div className="card mt-6 space-y-4 p-6" aria-live="polite">
            <p className="text-lg font-semibold text-white">
              Your image is {size.w}×{size.h}
            </p>
            {fits && (
              <div className="flex gap-3">
                <Check className="mt-1 shrink-0 text-emerald-400" size={18} />
                <div className="space-y-2">
                  <p className="text-sm text-slate-300">Exact match, ready to upload as it is:</p>
                  <Names list={result.exact} />
                </div>
              </div>
            )}
            {result.scale.length > 0 && (
              <div className="flex gap-3">
                <AlertTriangle className="mt-1 shrink-0 text-amber-400" size={18} />
                <div className="space-y-2">
                  <p className="text-sm text-slate-300">Right shape, wrong pixels. Resize it to one of these:</p>
                  <Names list={result.scale} />
                </div>
              </div>
            )}
            {result.rotated.length > 0 && (
              <div className="flex gap-3">
                <AlertTriangle className="mt-1 shrink-0 text-amber-400" size={18} />
                <div className="space-y-2">
                  <p className="text-sm text-slate-300">It is sideways. Rotated, it would match:</p>
                  <Names list={result.rotated} />
                </div>
              </div>
            )}
            {!fits && !fixable && (
              <div className="flex gap-3">
                <AlertTriangle className="mt-1 shrink-0 text-amber-400" size={18} />
                <p className="text-sm text-slate-300">
                  This shape doesn&apos;t match any size in the tables below, so it needs to be placed on a
                  correctly sized canvas.
                </p>
              </div>
            )}
            <button type="button" onClick={fix} disabled={busy} className="btn-primary px-5 py-2.5">
              {busy ? "Opening…" : "Fit it to every size, free"} <ArrowRight size={16} />
            </button>
            <p className="text-xs text-slate-500">
              Opens it in the editor, which exports one design at every size listed here.
            </p>
          </div>
        )}

        {GROUPS.map((g) => {
          const rows = ALL_SIZES.filter(g.pick);
          return (
            <section key={g.title} className="mt-12">
              <h2 className="text-xl font-bold text-white">{g.title}</h2>
              <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Size</th>
                      <th className="px-4 py-2.5 font-medium">Pixels</th>
                      <th className="px-4 py-2.5 font-medium">Width / height</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {rows.map((d) => (
                      <tr key={d.id}>
                        <td className="px-4 py-2.5">{d.name}</td>
                        <td className="px-4 py-2.5 tabular-nums">{d.canvas.w} × {d.canvas.h}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-400">{(d.canvas.w / d.canvas.h).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </main>
      <Footer />
    </div>
  );
}
