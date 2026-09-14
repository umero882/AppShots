import { AlignCenter, AlignLeft, AlignRight, Minus, Plus, MousePointerClick } from "lucide-react";
import { FONTS } from "../lib/templates";
import { TEXT_EFFECTS } from "../lib/textEffects";
import { stepSize } from "../lib/textTarget";

const ALIGNS = [
  { id: "left", icon: AlignLeft, title: "Align left" },
  { id: "center", icon: AlignCenter, title: "Align center" },
  { id: "right", icon: AlignRight, title: "Align right" },
];
const WEIGHTS = [400, 500, 600, 700, 800, 900];

/**
 * The contextual bar above the canvas: styles whichever text is active
 * (see resolveTextTarget) without a trip to the side panel. The row is always
 * reserved so the stage never jumps; with nothing active it doubles as the
 * hint for editing in place.
 */
export default function TextToolbar({ target, onChange }) {
  if (!target) {
    return (
      <div className="flex h-11 shrink-0 items-center justify-center gap-2 border-b border-white/5 bg-ink-900/60 px-4 text-[11px] text-slate-500">
        <MousePointerClick size={13} />
        Click text on the canvas to style it · double-click to edit it in place
      </div>
    );
  }
  const { label, values: v, sizeSpec, caps } = target;
  return (
    <div
      className="scroll-thin flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/5 bg-ink-900/80 px-3 backdrop-blur"
      // Keep canvas selection intact while using the bar.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-brand-300">{label}</span>

      {caps.font && (
        <select
          aria-label="Font"
          className="tb-select"
          value={v.font}
          onChange={(e) => onChange({ font: e.target.value })}
        >
          {FONTS.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}

      <div className="flex shrink-0 items-center rounded-lg border border-white/10 bg-white/5">
        <button
          type="button"
          className="tb-icon"
          title="Smaller"
          aria-label="Smaller"
          disabled={v.size <= sizeSpec.min}
          onClick={() => onChange({ size: stepSize(v.size, sizeSpec, -1) })}
        >
          <Minus size={13} />
        </button>
        <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-slate-100">
          {v.size}{sizeSpec.unit}
        </span>
        <button
          type="button"
          className="tb-icon"
          title="Larger"
          aria-label="Larger"
          disabled={v.size >= sizeSpec.max}
          onClick={() => onChange({ size: stepSize(v.size, sizeSpec, 1) })}
        >
          <Plus size={13} />
        </button>
      </div>

      <select
        aria-label="Weight"
        className="tb-select"
        value={v.weight}
        onChange={(e) => onChange({ weight: +e.target.value })}
      >
        {WEIGHTS.map((w) => (
          <option key={w} value={w}>{w}</option>
        ))}
      </select>

      {caps.align && (
        <div className="flex shrink-0 items-center rounded-lg border border-white/10 bg-white/5">
          {ALIGNS.map((a) => (
            <button
              key={a.id}
              type="button"
              title={a.title}
              aria-label={a.title}
              aria-pressed={v.align === a.id}
              onClick={() => onChange({ align: a.id })}
              className={`tb-icon ${v.align === a.id ? "bg-brand-500/20 text-brand-200" : ""}`}
            >
              <a.icon size={14} />
            </button>
          ))}
        </div>
      )}

      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1" title="Color">
        <span className="h-4 w-4 rounded-full ring-1 ring-white/20" style={{ background: v.color }} />
        <input
          type="color"
          aria-label="Color"
          value={v.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-0 w-0 opacity-0"
        />
        <span className="text-[11px] text-slate-300">Color</span>
      </label>

      {caps.effect && (
        <select
          aria-label="Effect"
          className="tb-select"
          value={v.effect}
          onChange={(e) => onChange({ effect: e.target.value })}
        >
          {TEXT_EFFECTS.map((ef) => (
            <option key={ef.id} value={ef.id}>{ef.id === "none" ? "No effect" : ef.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
