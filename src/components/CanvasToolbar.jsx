import {
  AlignCenter, AlignLeft, AlignRight, Minus, Plus, MousePointerClick,
  ArrowDown, ArrowUp, Copy, Trash2, Upload,
} from "lucide-react";
import { FONTS } from "../lib/templates";
import { TEXT_EFFECTS } from "../lib/textEffects";
import { stepSize } from "../lib/textTarget";
import { OPACITY_SPEC, DEVICE_SCALE_SPEC } from "../lib/selectionTarget";

const ALIGNS = [
  { id: "left", icon: AlignLeft, title: "Align left" },
  { id: "center", icon: AlignCenter, title: "Align center" },
  { id: "right", icon: AlignRight, title: "Align right" },
];
const WEIGHTS = [400, 500, 600, 700, 800, 900];

/**
 * The contextual bar above the canvas. It reads `resolveSelection` and shows
 * the controls for whatever is selected — a headline line or text block
 * (typography), any other element (color, opacity, layer), or a device mockup
 * (screenshot, size) — plus duplicate/delete for things that can be. The row
 * is always reserved so the stage never jumps; empty, it carries the hint for
 * editing in place.
 */
export default function CanvasToolbar({
  target,
  onTextStyle,
  onElementChange,
  onElementReorder,
  onElementDuplicate,
  onElementDelete,
  onDeviceChange,
  onDeviceUpload,
  onDeviceDuplicate,
  onDeviceDelete,
}) {
  if (!target) {
    return (
      <div className="flex h-11 shrink-0 items-center justify-center gap-2 border-b border-white/5 bg-ink-900/60 px-4 text-[11px] text-slate-500">
        <MousePointerClick size={13} />
        Click text on the canvas to style it · double-click to edit it in place
      </div>
    );
  }

  const label = target.kind === "text" ? target.text.label : target.label;
  return (
    <div
      className="scroll-thin flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/5 bg-ink-900/80 px-3 backdrop-blur"
      // Keep canvas selection intact while using the bar.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-brand-300">{label}</span>

      {target.kind === "text" && <TextControls t={target.text} onChange={onTextStyle} />}
      {target.kind === "element" && <ElementControls t={target} onChange={(p) => onElementChange(target.id, p)} />}
      {target.kind === "device" && (
        <DeviceControls t={target} onChange={(p) => onDeviceChange(target.id, p)} onUpload={onDeviceUpload} />
      )}

      {/* element actions — text elements have an id, headline lines don't */}
      {target.id && target.kind !== "device" && (
        <Actions
          onBackward={target.isBottom ? null : () => onElementReorder(target.id, "backward")}
          onForward={target.isTop ? null : () => onElementReorder(target.id, "forward")}
          onDuplicate={() => onElementDuplicate(target.id)}
          onDelete={() => onElementDelete(target.id)}
        />
      )}
      {target.kind === "device" && (
        <Actions onDuplicate={() => onDeviceDuplicate(target.id)} onDelete={() => onDeviceDelete(target.id)} />
      )}
    </div>
  );
}

/* ----------------------------- controls ----------------------------- */

function TextControls({ t, onChange }) {
  const { values: v, sizeSpec, caps } = t;
  return (
    <>
      {caps.font && (
        <select aria-label="Font" className="tb-select" value={v.font} onChange={(e) => onChange({ font: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}

      <Stepper
        value={v.size}
        spec={sizeSpec}
        onChange={(size) => onChange({ size })}
        labels={["Smaller", "Larger"]}
      />

      <select aria-label="Weight" className="tb-select" value={v.weight} onChange={(e) => onChange({ weight: +e.target.value })}>
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

      <ColorWell label="Color" value={v.color} onChange={(color) => onChange({ color })} />

      {caps.effect && (
        <select aria-label="Effect" className="tb-select" value={v.effect} onChange={(e) => onChange({ effect: e.target.value })}>
          {TEXT_EFFECTS.map((ef) => (
            <option key={ef.id} value={ef.id}>{ef.id === "none" ? "No effect" : ef.name}</option>
          ))}
        </select>
      )}
    </>
  );
}

function ElementControls({ t, onChange }) {
  return (
    <>
      {t.colors.map((c) => (
        <ColorWell key={c.key} label={c.label} value={c.value} onChange={(val) => onChange({ [c.key]: val })} />
      ))}
      <Stepper
        value={t.opacity}
        spec={OPACITY_SPEC}
        onChange={(pct) => onChange({ opacity: pct / 100 })}
        labels={["More transparent", "More opaque"]}
        title="Opacity"
      />
    </>
  );
}

function DeviceControls({ t, onChange, onUpload }) {
  return (
    <>
      <button type="button" className="tb-btn" onClick={onUpload} title={t.hasImage ? "Replace the screenshot in this mockup" : "Upload a screenshot into this mockup"}>
        <Upload size={13} /> {t.hasImage ? "Replace screenshot" : "Upload screenshot"}
      </button>
      <Stepper
        value={t.scale}
        spec={DEVICE_SCALE_SPEC}
        onChange={(pct) => onChange({ scale: pct / 100 })}
        labels={["Smaller", "Larger"]}
        title="Size"
      />
    </>
  );
}

function Actions({ onBackward, onForward, onDuplicate, onDelete }) {
  const hasLayer = onBackward !== undefined || onForward !== undefined;
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      {hasLayer && (
        <div className="flex items-center rounded-lg border border-white/10 bg-white/5">
          <button type="button" className="tb-icon" title="Send backward" aria-label="Send backward" disabled={!onBackward} onClick={onBackward || undefined}>
            <ArrowDown size={13} />
          </button>
          <button type="button" className="tb-icon" title="Bring forward" aria-label="Bring forward" disabled={!onForward} onClick={onForward || undefined}>
            <ArrowUp size={13} />
          </button>
        </div>
      )}
      <button type="button" className="tb-btn" onClick={onDuplicate} title="Duplicate (Ctrl/⌘ D)">
        <Copy size={13} /> Duplicate
      </button>
      <button type="button" className="tb-btn text-red-300 hover:bg-red-500/10" onClick={onDelete} title="Delete (⌫)">
        <Trash2 size={13} /> Delete
      </button>
    </div>
  );
}

/* ----------------------------- primitives ----------------------------- */

function Stepper({ value, spec, onChange, labels: [down, up], title }) {
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-white/10 bg-white/5" title={title}>
      <button type="button" className="tb-icon" title={down} aria-label={down} disabled={value <= spec.min} onClick={() => onChange(stepSize(value, spec, -1))}>
        <Minus size={13} />
      </button>
      <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-slate-100">
        {value}{spec.unit}
      </span>
      <button type="button" className="tb-icon" title={up} aria-label={up} disabled={value >= spec.max} onClick={() => onChange(stepSize(value, spec, 1))}>
        <Plus size={13} />
      </button>
    </div>
  );
}

function ColorWell({ label, value, onChange }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1" title={label}>
      <span className="h-4 w-4 rounded-full ring-1 ring-white/20" style={{ background: value }} />
      <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-0 w-0 opacity-0" />
      <span className="text-[11px] text-slate-300">{label}</span>
    </label>
  );
}
