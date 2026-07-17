import { useMemo, useState, memo, useEffect } from "react";
import { Search, X, Check } from "lucide-react";
import ScreenCanvas from "./ScreenCanvas";
import {
  TEMPLATES, TEMPLATE_CATEGORIES, filterTemplates, textPosFor,
} from "../lib/galleryTemplates";

const stateFor = (template) => ({
  ...template.style,
  _textPos: textPosFor(template.style.layoutId),
});

const Thumb = memo(function Thumb({ template, width }) {
  return <ScreenCanvas state={stateFor(template)} screen={template.screens[0]} width={width} />;
});

/** Full-screen preview of every screen in a template, with an apply action. */
export function TemplatePreview({ template, onUse, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const state = stateFor(template);
  const n = template.screens.length;
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label={`Preview of ${template.name}`}
    >
      <div className="card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">{template.name}</h3>
            <p className="text-xs text-slate-500">
              {template.category} · {n} screen{n > 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close preview" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {/* Previews scroll in the space between the pinned header and footer, so the
            action buttons are never clipped by max-h on short viewports. */}
        <div className="scroll-thin flex min-h-0 flex-1 items-start gap-4 overflow-auto pb-2">
          {template.screens.map((s, i) => (
            <div key={i} className="shrink-0">
              <ScreenCanvas state={state} screen={s} width={200} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex shrink-0 justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={onUse} className="btn-primary">
            <Check size={16} /> Use this template
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemplateGrid({
  templates = TEMPLATES,
  onSelect,
  compact = false,
  thumbWidth = 150,
}) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(null);

  const visible = useMemo(
    () => filterTemplates(templates, { category, query }),
    [templates, category, query]
  );

  const chips = ["All", ...TEMPLATE_CATEGORIES];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          aria-label="Search templates"
          className="input pl-9"
        />
      </div>

      <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              category === c
                ? "bg-brand-600 text-white"
                : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {query ? `No templates match "${query}".` : "No templates in this category."}
        </p>
      ) : (
        <div
          className={`grid gap-3 ${
            compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          }`}
        >
          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => setPreview(t)}
              aria-label={`Preview template ${t.name}`}
              className="card group flex flex-col items-center gap-2 p-2 text-center transition hover:border-brand-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <div className="grid w-full place-items-center overflow-hidden rounded-lg bg-ink-900 p-2">
                <Thumb template={t} width={thumbWidth} />
              </div>
              <div className="w-full">
                <p className="truncate text-xs font-semibold text-white">{t.name}</p>
                <p className="text-[10px] text-slate-500">{t.category}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {preview && (
        <TemplatePreview
          template={preview}
          onUse={() => {
            onSelect?.(preview);
            setPreview(null);
          }}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
