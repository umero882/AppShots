import { useMemo, useState, memo } from "react";
import { Search } from "lucide-react";
import ScreenCanvas from "./ScreenCanvas";
import {
  TEMPLATES, TEMPLATE_CATEGORIES, filterTemplates, textPosFor,
} from "../lib/galleryTemplates";

const Thumb = memo(function Thumb({ template, width }) {
  const state = {
    ...template.style,
    _textPos: textPosFor(template.style.layoutId),
  };
  return <ScreenCanvas state={state} screen={template.screens[0]} width={width} />;
});

export default function TemplateGrid({
  templates = TEMPLATES,
  onSelect,
  compact = false,
  thumbWidth = 150,
}) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");

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
        <p className="py-10 text-center text-sm text-slate-500">No templates match "{query}".</p>
      ) : (
        <div
          className={`grid gap-3 ${
            compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          }`}
        >
          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect?.(t)}
              aria-label={`Use template ${t.name}`}
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
    </div>
  );
}
