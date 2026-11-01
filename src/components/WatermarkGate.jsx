import { useEffect } from "react";
import { Link } from "react-router-dom";
import { X, Check, Loader2, Sparkles } from "lucide-react";

/**
 * Shown once per session to Free users the first time they export: their own
 * design, with and without the "Made with AppShots" badge, so the difference is
 * something they can see rather than a line on a pricing card. Exporting free
 * is never blocked.
 */
export default function WatermarkGate({ before, after, onFree, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Pane = ({ src, label, tone }) => (
    <figure className="min-w-0 flex-1 text-center">
      <div className="mx-auto grid min-h-[200px] place-items-center">
        {src ? (
          <img src={src} alt="" className="mx-auto max-h-[46vh] w-auto rounded-lg shadow-[0_16px_32px_rgba(0,0,0,0.45)] ring-1 ring-white/10" />
        ) : (
          <Loader2 className="animate-spin text-slate-500" />
        )}
      </div>
      <figcaption className={`mt-3 text-xs font-semibold uppercase tracking-widest ${tone}`}>{label}</figcaption>
    </figure>
  );

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-label="Free export">
      <div className="card w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">This is how your export will look</h3>
            <p className="mt-1 text-sm text-slate-400">Free exports carry a small badge. Pro removes it.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 flex gap-6">
          <Pane src={before} label="Free" tone="text-slate-400" />
          <Pane src={after} label="Pro" tone="text-brand-300" />
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button onClick={onFree} className="btn-ghost px-5 py-2.5">Export free with the badge</button>
          <Link to="/pricing" className="btn-primary px-5 py-2.5">
            <Sparkles size={16} /> Remove it with Pro
          </Link>
        </div>
        <p className="mt-3 flex items-center justify-end gap-1.5 text-xs text-slate-500">
          <Check size={13} className="text-brand-400" /> Cancel anytime. Your design is saved either way.
        </p>
      </div>
    </div>
  );
}
