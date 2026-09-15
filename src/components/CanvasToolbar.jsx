import { useRef } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Minus, Plus, MousePointerClick,
  ArrowDown, ArrowUp, Copy, Trash2, Upload, Move3d, Image,
} from "lucide-react";
import { FONTS, GRADIENTS } from "../lib/templates";
import { TEXT_EFFECTS } from "../lib/textEffects";
import { PATTERN_DEFAULTS } from "../lib/patterns";
import { stepSize } from "../lib/textTarget";
import { OPACITY_SPEC, DEVICE_SCALE_SPEC, BLUR_SPEC, BACKGROUND_TYPES } from "../lib/selectionTarget";
import { readFileAsDataURL } from "../lib/export";

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
 * (screenshot, size) — plus duplicate/delete for things that can be. It fills
 * the row the editor reserves above the stage (next to the zoom control), so
 * the stage never jumps; empty, it carries the hint for editing in place.
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
  onDevicePromote,
  onBackgroundChange, // (patch, defaults?) → merged under the screen's background
}) {
  if (!target) {
    return (
      <div className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 px-4 text-[11px] text-slate-500">
        <MousePointerClick size={13} />
        Click anything on the canvas to style it · double-click text to edit it in place
      </div>
    );
  }

  const label = target.kind === "text" ? target.text.label : target.label;
  return (
    <div
      className="scroll-thin flex h-11 min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-3"
      // Keep canvas selection intact while using the bar.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-brand-300">{label}</span>

      {target.kind === "text" && <TextControls t={target.text} onChange={onTextStyle} />}
      {target.kind === "element" && <ElementControls t={target} onChange={(p) => onElementChange(target.id, p)} />}
      {target.kind === "device" && (
        <DeviceControls t={target} onChange={(p) => onDeviceChange(target.id, p)} onUpload={onDeviceUpload} />
      )}
      {target.kind === "background" && <BackgroundControls bg={target.bg} onChange={onBackgroundChange} />}

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
        <Actions
          onDuplicate={() => onDeviceDuplicate(target.id)}
          // The legacy single mockup can't be removed — it IS the screen's
          // device — so offer the step that unlocks free placement instead.
          onDelete={target.legacy ? null : () => onDeviceDelete(target.id)}
          onPromote={target.legacy ? onDevicePromote : null}
        />
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

function BackgroundControls({ bg, onChange }) {
  const fileRef = useRef(null);
  const type = bg.type || "gradient";
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onChange({ type: "image", image: await readFileAsDataURL(file) });
  }
  return (
    <>
      <div className="flex shrink-0 items-center rounded-lg border border-white/10 bg-white/5">
        {BACKGROUND_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => onChange({ type: t }, t === "pattern" ? PATTERN_DEFAULTS : undefined)}
            className={`h-7 px-2 text-[11px] font-semibold capitalize transition ${
              type === t ? "rounded-md bg-brand-500/20 text-brand-200" : "text-slate-300 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {type === "gradient" && (
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1" role="group" aria-label="Gradient presets">
          {GRADIENTS.map((g) => {
            const on = bg.gradient === g.id && !bg.aiGradient;
            return (
              <button
                key={g.id}
                type="button"
                title={g.name}
                aria-label={g.name}
                aria-pressed={on}
                onClick={() => onChange({ gradient: g.id, aiGradient: null })}
                className={`h-5 w-5 rounded-full ring-2 transition ${on ? "ring-white" : "ring-transparent hover:ring-white/40"}`}
                style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
              />
            );
          })}
        </div>
      )}

      {type === "solid" && <ColorWell label="Color" value={bg.solid || "#6366f1"} onChange={(solid) => onChange({ solid })} />}

      {type === "pattern" && (
        <>
          <ColorWell label="Ink" value={bg.patternFg || PATTERN_DEFAULTS.patternFg} onChange={(patternFg) => onChange({ patternFg })} />
          <ColorWell label="Paper" value={bg.patternBg || PATTERN_DEFAULTS.patternBg} onChange={(patternBg) => onChange({ patternBg })} />
        </>
      )}

      {type === "image" && (
        <>
          <button type="button" className="tb-btn" onClick={() => fileRef.current?.click()} title="Use a photo or artwork as the backdrop">
            <Image size={13} /> {bg.image ? "Replace image" : "Upload image"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
          {bg.image && (
            <Stepper value={bg.blur || 0} spec={BLUR_SPEC} onChange={(blur) => onChange({ blur })} labels={["Less blur", "More blur"]} title="Blur" />
          )}
        </>
      )}
    </>
  );
}

function Actions({ onBackward, onForward, onDuplicate, onDelete, onPromote }) {
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
      {onPromote && (
        <button type="button" className="tb-btn" onClick={onPromote} title="Drag, rotate and tilt the mockup anywhere on the canvas">
          <Move3d size={13} /> Position freely
        </button>
      )}
      <button type="button" className="tb-btn" onClick={onDuplicate} title="Duplicate (Ctrl/⌘ D)">
        <Copy size={13} /> Duplicate
      </button>
      {onDelete && (
        <button type="button" className="tb-btn text-red-300 hover:bg-red-500/10" onClick={onDelete} title="Delete (⌫)">
          <Trash2 size={13} /> Delete
        </button>
      )}
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
