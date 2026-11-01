import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, X, Upload, ArrowRight } from "lucide-react";
import Navbar from "../components/Navbar";
import TemplateGrid from "../components/TemplateGrid";
import ScreenCanvas from "../components/ScreenCanvas";
import { useAuth } from "../lib/auth";
import { backend } from "../lib/backend";
import { templateToProjectState, textPosFor } from "../lib/galleryTemplates";
import { saveLandingDraft, fileToDataUrl } from "../lib/landingDraft";

/**
 * Logged-out visitors don't bounce to a blank signup page: they try the design
 * with their own headline and screenshot first, and that exact state becomes
 * their first project once they have an account.
 */
function TryDesign({ template, onClose, onContinue }) {
  const base = templateToProjectState(template);
  const [heading, setHeading] = useState(base.screens[0].heading);
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  // On a phone the preview goes above the fields and smaller, so each edit is
  // visible without scrolling past the controls.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const state = { ...base, _textPos: textPosFor(base.layoutId) };
  const screens = base.screens.map((s, i) => (i === 0 ? { ...s, heading: heading || " ", image: image || s.image } : s));

  async function take(file) {
    setError("");
    try {
      setImage(await fileToDataUrl(file));
    } catch {
      setError("That file isn't an image. Try a PNG or JPG.");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-label={`Try ${template.name}`}>
      <div className="card flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex shrink-0 items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Make {template.name} yours</h3>
            <p className="text-xs text-slate-500">Free. No account needed to try it.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-auto md:flex-row">
          <div className="w-full shrink-0 space-y-4 md:w-64">
            <label className="block text-xs font-medium text-slate-400">
              Your headline
              <input
                value={heading}
                maxLength={40}
                onChange={(e) => setHeading(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2.5 text-base text-white outline-none focus:border-brand-500"
              />
            </label>
            <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/15 px-4 py-3 text-left text-sm text-slate-300 hover:border-brand-400">
              <Upload size={18} className="shrink-0 text-brand-300" />
              {image ? "Replace your screenshot" : "Add your app screenshot"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          </div>
          <div className="scroll-thin order-first flex min-w-0 flex-1 items-start gap-4 overflow-auto pb-2 md:order-none">
            {screens.map((s, i) => (
              <div key={s.id} className="shrink-0">
                <ScreenCanvas state={state} screen={s} width={narrow ? (i === 0 ? 150 : 120) : i === 0 ? 210 : 170} />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex shrink-0 items-center justify-end gap-3">
          <p className="hidden text-xs text-slate-500 sm:block">Sign up to edit every screen and export.</p>
          <button onClick={() => onContinue({ ...base, screens }, heading)} className="btn-primary px-5 py-2.5">
            Continue with this design <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Public inspiration gallery: browse complete, polished screenshot designs for
 * ideas. Picking one starts a project from it (or, logged out, lets the visitor
 * try it with their own headline and screenshot before signing up).
 */
export default function Inspiration() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trying, setTrying] = useState(null);

  async function startFrom(template) {
    if (!user) {
      setTrying(template);
      return;
    }
    const project = await backend.createProject(user.id, {
      name: template.name,
      state: templateToProjectState(template),
    });
    navigate(`/editor/${project.id}`);
  }

  function carry(state, heading) {
    saveLandingDraft({ state, heading });
    navigate("/signup");
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <div className="mb-8 max-w-2xl">
          <span className="chip mb-3 inline-flex">
            <Sparkles size={13} className="text-brand-300" /> Inspiration
          </span>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            App screenshot inspiration
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Browse complete, store-ready screenshot designs across every style. Find one you
            love and {user ? "start a project from it" : "try it with your own app"} in one click.
          </p>
        </div>

        <TemplateGrid onSelect={startFrom} />
      </main>
      {trying && <TryDesign template={trying} onClose={() => setTrying(null)} onContinue={carry} />}
    </div>
  );
}
