import { useEffect, useRef } from "react";
import { X, FilePlus2 } from "lucide-react";
import TemplateGrid from "./TemplateGrid";

export default function TemplatePicker({ open, onClose, onPick }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="card my-auto w-full max-w-5xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a template"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Start with a template</h2>
            <p className="text-sm text-slate-400">Pick a design — you can customize everything later.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn-ghost px-2.5 py-2">
            <X size={18} />
          </button>
        </div>

        <button
          onClick={() => onPick?.(null)}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-white/15 p-4 text-left transition hover:border-brand-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/5 text-brand-300">
            <FilePlus2 size={18} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-white">Blank project</span>
            <span className="block text-xs text-slate-500">Start from a clean canvas.</span>
          </span>
        </button>

        <TemplateGrid onSelect={(t) => onPick?.(t)} />
      </div>
    </div>
  );
}
