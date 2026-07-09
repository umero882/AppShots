import { useState } from "react";
import { Smartphone, Plus, Copy, Trash2, X, Box, Upload, Boxes } from "lucide-react";
import { DEVICES, getDevice } from "../lib/devices";
import { orientedCanvas, isFreeMode, deviceTransform, FRAME_COLORS, projectFit } from "../lib/deviceLayout";
import { LIVE3D_MATERIALS } from "../lib/live3d";

function FrameColorRow({ label = "Frame color", value, onPick }) {
  const active = (value || "#0b0b0e").toLowerCase();
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2">
        {FRAME_COLORS.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.bezel)}
            title={c.name}
            className={`h-8 w-8 rounded-full ring-2 transition ${
              active === c.bezel.toLowerCase() ? "ring-white" : "ring-white/15 hover:ring-white/40"
            }`}
            style={{ background: c.bezel }}
          />
        ))}
      </div>
    </div>
  );
}

// One-click 3D perspective poses (the signature AppScreens look). Each sets the
// mockup's tilt + z-rotation; "Flat" clears them.
export const POSES = [
  { id: "flat", name: "Flat", tiltX: 0, tiltY: 0, rotation: 0 },
  { id: "left", name: "Left", tiltX: 8, tiltY: 30, rotation: 0 },
  { id: "right", name: "Right", tiltX: 8, tiltY: -30, rotation: 0 },
  { id: "iso-l", name: "Iso L", tiltX: 16, tiltY: 26, rotation: -6 },
  { id: "iso-r", name: "Iso R", tiltX: 16, tiltY: -26, rotation: 6 },
  { id: "back", name: "Back", tiltX: 26, tiltY: 0, rotation: 0 },
];

const poseMatches = (d, p) =>
  !!d && (d.tiltX || 0) === p.tiltX && (d.tiltY || 0) === p.tiltY && (d.rotation || 0) === p.rotation;

function Tilt3dPicker({ active, onPick }) {
  return (
    <div>
      <p className="label flex items-center gap-1.5"><Box size={13} /> 3D perspective</p>
      <div className="grid grid-cols-3 gap-2">
        {POSES.map((p) => {
          const on = poseMatches(active, p);
          return (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              title={p.name}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2 transition ${
                on ? "border-brand-500 bg-brand-500/10 text-white" : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
              }`}
            >
              <span className="grid h-7 w-7 place-items-center" style={{ perspective: "120px" }}>
                <span
                  className="block h-6 w-4 rounded-[3px] border border-current"
                  style={{ transform: deviceTransform({ tiltX: p.tiltX, tiltY: p.tiltY, rotation: p.rotation }, { perspective: 120 }).replace("translate(-50%, -50%) ", "") }}
                />
              </span>
              <span className="text-[10px] font-semibold">{p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Device-studio panel: choose the output screenshot size + orientation, then
 * place one or many device mockups that can be freely positioned, scaled,
 * rotated, 3D-tilted and set to landscape. Also toggles the connected-panorama
 * design that spans the first screen's background across every screen.
 *
 * Legacy screens (a single centered device) render the "Position & tilt freely"
 * promote button; pressing it materializes an explicit instance list in the
 * parent (free mode).
 */
export function FrameGrid({ activeId, onPick }) {
  const grouped = {
    ios: DEVICES.filter((d) => d.store === "ios"),
    android: DEVICES.filter((d) => d.store === "android"),
  };
  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([store, devices]) => (
        <div key={store}>
          <p className="label">{store === "ios" ? "App Store" : "Google Play"}</p>
          <div className="grid grid-cols-2 gap-2">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => onPick(d.id)}
                className={`rounded-xl border p-3 text-left text-sm transition ${
                  activeId === d.id
                    ? "border-brand-500 bg-brand-500/10 text-white"
                    : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                }`}
              >
                <p className="font-semibold">{d.name}</p>
                <p className="text-[11px] text-slate-500">{d.canvas.w}×{d.canvas.h}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Live3DSection({
  live3d, frameActive, onToggle, onChange,
  modelNames = [], modelError, onUploadModel, onRemoveModel, onChangeModel,
}) {
  const on = !!live3d?.enabled;
  const model = live3d?.model || null;
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center justify-between">
        <span className="label mb-0 flex items-center gap-1.5"><Boxes size={13} /> Real 3D (WebGL)</span>
        <input
          type="checkbox"
          checked={on}
          disabled={frameActive}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 accent-brand-500 disabled:opacity-40"
        />
      </label>
      {frameActive ? (
        <p className="text-[11px] text-slate-500">Turn off the photoreal frame above to use live 3D.</p>
      ) : on ? (
        <div className="space-y-3 rounded-xl border border-brand-500/40 bg-brand-500/5 p-3">
          <p className="text-[11px] text-slate-400">Drag the device on the canvas to rotate it. Exports include the rendered 3D.</p>

          {/* real device model */}
          <div className="space-y-2">
            <p className="label mb-0">Device model</p>
            {model?.src ? (
              <>
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                  <span className="text-xs font-semibold text-white">Real model loaded</span>
                  <button onClick={onRemoveModel} title="Remove model" className="text-slate-400 hover:text-red-400"><X size={14} /></button>
                </div>
                <div>
                  <p className="label">Screen surface</p>
                  <select
                    value={model.screenKey || ""}
                    onChange={(e) => onChangeModel({ screenKey: e.target.value || null })}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                  >
                    <option value="">Auto-detect</option>
                    {modelNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">If the screenshot lands on the wrong part, pick the screen/glass material here.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => onChangeModel({ flip: !model.flip })} className={`btn-soft justify-center ${model.flip ? "ring-1 ring-brand-500" : ""}`}>Flip Y</button>
                  <button onClick={() => onChangeModel({ rotate: ((model.rotate || 0) + 90) % 360 })} className="btn-soft justify-center">Rotate {model.rotate || 0}°</button>
                </div>
                <button onClick={onUploadModel} className="btn-soft w-full justify-center"><Upload size={14} /> Replace model</button>
              </>
            ) : (
              <>
                <button onClick={onUploadModel} className="btn-soft w-full justify-center"><Upload size={14} /> Load device model (.glb / .gltf)</button>
                {modelError && <p className="text-[11px] text-red-400">{modelError}</p>}
                <p className="text-[11px] text-slate-500">
                  Drop a real phone model for an industry-standard look (its own buttons, camera &amp; rails). Free CC0 models:
                  search <b>poly.pizza</b> or Sketchfab (license = CC0) for &ldquo;smartphone&rdquo;, download <b>.glb</b>, load it here.
                  Without a model, a generic metal device is shown.
                </p>
              </>
            )}
          </div>

          {/* body material — generic device only */}
          {!model?.src && (
            <div>
              <p className="label">Body material</p>
              <div className="flex flex-wrap gap-2">
                {LIVE3D_MATERIALS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onChange({ material: m.id })}
                    title={m.name}
                    className={`h-8 w-8 rounded-full ring-2 transition ${
                      (live3d.material || "titanium") === m.id ? "ring-white" : "ring-white/15 hover:ring-white/40"
                    }`}
                    style={{ background: m.color }}
                  />
                ))}
              </div>
            </div>
          )}

          <Slider label="Rotate ↔" value={Math.round(live3d.rotY || 0)} min={-60} max={60} suffix="°" onChange={(v) => onChange({ rotY: v })} />
          <Slider label="Rotate ↕" value={Math.round(live3d.rotX || 0)} min={-60} max={60} suffix="°" onChange={(v) => onChange({ rotX: v })} />
          <Slider label="Zoom" value={Math.round((live3d.zoom || 1) * 100)} min={60} max={160} suffix="%" onChange={(v) => onChange({ zoom: v / 100 })} />
          <button
            onClick={() => onChange({ rotX: -14, rotY: 22, zoom: 1 })}
            className="text-xs text-slate-400 transition hover:text-white"
          >
            Reset 3D pose
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">
          A live, rotatable 3D device — load a real phone model (.glb) for a true industry-standard look, or use the built-in generic device. Drag to spin it. Loads on demand.
        </p>
      )}
    </div>
  );
}

function FitToggle({ value, onChange }) {
  const opts = [
    { id: "contain", label: "Fit", hint: "Show the whole screenshot; fill the side gaps with a blurred extension" },
    { id: "fill", label: "Fill", hint: "Fill edge-to-edge, keep the top — only the overflowing bottom trims" },
    { id: "fill-center", label: "Center", hint: "Fill edge-to-edge, centered — trims top + bottom evenly (keeps the middle)" },
    { id: "stretch", label: "Stretch", hint: "Stretch to the screen's shape — the whole screenshot shows edge-to-edge with nothing cropped (great for splash screens)" },
  ];
  const cur = opts.some((o) => o.id === value) ? value : "fill"; // fill is the default
  return (
    <div>
      <p className="label">Screenshot</p>
      <div className="flex overflow-hidden rounded-lg border border-white/10">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            title={o.hint}
            className={`flex-1 px-2 py-1.5 text-xs font-semibold transition ${
              cur === o.id ? "bg-brand-600 text-white" : "bg-white/5 text-slate-300 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Two independent fill-assist switches (project-level). Each stops a screenshot
// floating in blurred side-bars, from a different angle — see templates.js.
function FillAssist({ state, update }) {
  const rows = [
    { key: "autoFill", label: "Auto-fill narrow shots", hint: "Screenshots narrower than the screen show in full (stretched edge-to-edge) instead of blurred side-bars." },
    { key: "ipadForceFill", label: "iPad always fills", hint: "iPad mockups always show the whole screenshot edge-to-edge (stretched) — nothing cropped, no side-bars." },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <label key={r.key} className="flex cursor-pointer items-start justify-between gap-3">
          <span className="text-xs text-slate-300">
            {r.label}
            <span className="mt-0.5 block text-[11px] text-slate-500">{r.hint}</span>
          </span>
          <input
            type="checkbox"
            checked={state[r.key] !== false}
            onChange={(e) => update({ [r.key]: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
          />
        </label>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, suffix = "", onChange }) {
  return (
    <div>
      <p className="label">{label} · {value}{suffix}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-brand-500"
      />
    </div>
  );
}

function OrientationToggle({ value, onChange }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-white/10">
      {["portrait", "landscape"].map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 px-3 py-1.5 text-xs font-semibold capitalize transition ${
            (value || "portrait") === o ? "bg-brand-600 text-white" : "bg-white/5 text-slate-300 hover:text-white"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export default function DevicePanel({
  state, update, screen, selectedDevice,
  onAdd, onChange, onDelete, onDuplicate, onSelect, onPromote, onPose,
  frame, onPickFrame, onRemoveFrame, onAutoFitFrame,
  live3d, onToggleLive3d, onChangeLive3d,
  live3dModelNames, live3dModelError, onUploadModel, onRemoveModel, onChangeLive3dModel,
}) {
  const [adding, setAdding] = useState(false);
  const free = isFreeMode(screen);
  const devices = free ? screen.devices : [];
  const selected = free ? devices.find((d) => d.id === selectedDevice) : null;
  const out = orientedCanvas(getDevice(state.deviceId), state.orientation);

  return (
    <div className="space-y-6">
      {/* ---- screenshot output ---- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">Screenshot size</p>
          <span className="text-[11px] text-slate-500">{out.w}×{out.h}</span>
        </div>
        <OrientationToggle value={state.orientation} onChange={(o) => update({ orientation: o })} />
        <FrameGrid activeId={state.deviceId} onPick={(id) => update({ deviceId: id })} />
      </div>

      {/* ---- photoreal 3D frame ---- */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <p className="label mb-0 flex items-center gap-1.5"><Box size={13} /> Photoreal 3D frame</p>
        {frame ? (
          <>
            <div className="flex items-center justify-between rounded-lg border border-brand-500/40 bg-brand-500/5 px-2.5 py-2">
              <span className="text-xs font-semibold text-white">Frame active — CSS device hidden</span>
              <button onClick={onRemoveFrame} title="Remove frame" className="text-slate-400 hover:text-red-400"><X size={14} /></button>
            </div>
            <p className="text-[11px] text-slate-400">
              Pins auto-fit the screen on upload. Drag them on the canvas to fine-tune, or re-run:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onAutoFitFrame} className="btn-soft justify-center"><Box size={14} /> Auto-fit</button>
              <button onClick={onPickFrame} className="btn-soft justify-center"><Upload size={14} /> Replace</button>
            </div>
          </>
        ) : (
          <>
            <button onClick={onPickFrame} className="btn-soft w-full justify-center"><Upload size={14} /> Upload device frame (PNG)</button>
            <p className="text-[11px] text-slate-500">
              Drop a photoreal device render with a <b>transparent screen</b> (e.g. a free Rotato or Figma 3D mockup export).
              Your screenshot is perspective-warped into the screen and the frame composites on top — for true photoreal 3D.
            </p>
          </>
        )}
      </div>

      {/* ---- real 3D (WebGL) ---- */}
      <div className="border-t border-white/10 pt-4">
        <Live3DSection
          live3d={live3d}
          frameActive={!!frame}
          onToggle={onToggleLive3d}
          onChange={onChangeLive3d}
          modelNames={live3dModelNames}
          modelError={live3dModelError}
          onUploadModel={onUploadModel}
          onRemoveModel={onRemoveModel}
          onChangeModel={onChangeLive3dModel}
        />
      </div>

      {/* ---- device mockups ---- */}
      <div className="space-y-3 border-t border-white/10 pt-4">
        <p className="label mb-0">Device mockups{frame ? " (replaced by frame)" : live3d?.enabled ? " (replaced by live 3D)" : ""}</p>

        <FrameColorRow value={state.frameColor} onPick={(c) => update({ frameColor: c })} />
        {/* In free/multi mode each device renders from its OWN fit, so this toggle
            must read + write the instances — otherwise it could show "Fill" while a
            device is still letterboxed (contain) with blurred sides. */}
        <FitToggle
          value={projectFit(state, screen)}
          onChange={(f) => {
            update({ deviceFit: f });
            if (free) devices.forEach((d) => onChange(d.id, { fit: f }));
          }}
        />
        <FillAssist state={state} update={update} />

        {!free ? (
          <>
            <p className="text-xs text-slate-400">
              One centered device. Drop it into a 3D pose, position it freely, or add more.
            </p>
            <Tilt3dPicker active={null} onPick={onPose} />
            <button onClick={() => onPromote()} className="btn-soft w-full justify-center">
              <Smartphone size={15} /> Position &amp; tilt freely
            </button>
          </>
        ) : (
          <>
            {/* mockup chips */}
            <div className="flex flex-wrap gap-2">
              {devices.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => onSelect(d.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    selectedDevice === d.id
                      ? "border-brand-500 bg-brand-500/10 text-white"
                      : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                  }`}
                >
                  <Smartphone size={13} /> {getDevice(d.deviceId).name}
                  <span className="text-slate-500">#{i + 1}</span>
                </button>
              ))}
            </div>

            {selected ? (
              <div className="space-y-3 rounded-xl border border-brand-500/40 bg-brand-500/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-white">Selected mockup</p>
                  <div className="flex gap-1.5">
                    <button onClick={() => onDuplicate(selected.id)} title="Duplicate" className="rounded-md border border-white/10 p-1 text-slate-200 hover:bg-white/5">
                      <Copy size={13} />
                    </button>
                    <button onClick={() => onDelete(selected.id)} title="Delete" className="rounded-md border border-red-500/30 p-1 text-red-300 hover:bg-red-500/10">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <OrientationToggle value={selected.orientation} onChange={(o) => onChange(selected.id, { orientation: o })} />
                <Tilt3dPicker active={selected} onPick={onPose} />
                <FrameColorRow
                  label="Frame color (this mockup)"
                  value={selected.frameColor || state.frameColor}
                  onPick={(c) => onChange(selected.id, { frameColor: c })}
                />
                <FitToggle value={selected.fit} onChange={(f) => onChange(selected.id, { fit: f })} />
                <Slider label="Position X" value={Math.round(selected.x * 100)} min={-20} max={120} suffix="%" onChange={(v) => onChange(selected.id, { x: v / 100 })} />
                <Slider label="Position Y" value={Math.round(selected.y * 100)} min={-20} max={120} suffix="%" onChange={(v) => onChange(selected.id, { y: v / 100 })} />
                <Slider label="Size" value={Math.round(selected.scale * 100)} min={20} max={160} suffix="%" onChange={(v) => onChange(selected.id, { scale: v / 100 })} />
                <Slider label="Rotation" value={selected.rotation} min={-45} max={45} suffix="°" onChange={(v) => onChange(selected.id, { rotation: v })} />
                <Slider label="Tilt ↕" value={selected.tiltX} min={-40} max={40} suffix="°" onChange={(v) => onChange(selected.id, { tiltX: v })} />
                <Slider label="Tilt ↔" value={selected.tiltY} min={-40} max={40} suffix="°" onChange={(v) => onChange(selected.id, { tiltY: v })} />
                <button
                  onClick={() => onChange(selected.id, { x: 0.5, y: 0.5, rotation: 0, tiltX: 0, tiltY: 0 })}
                  className="text-xs text-slate-400 transition hover:text-white"
                >
                  Reset position &amp; tilt
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Select a mockup above to position it, or drag it on the canvas.</p>
            )}

            {/* add a mockup */}
            {adding ? (
              <div className="space-y-2 rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="label mb-0">Add a device</p>
                  <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-white"><X size={14} /></button>
                </div>
                <FrameGrid activeId={null} onPick={(id) => { onAdd(id); setAdding(false); }} />
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="btn-soft w-full justify-center">
                <Plus size={15} /> Add device
              </button>
            )}
          </>
        )}
      </div>

      {/* ---- connected panorama ---- */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <label className="flex cursor-pointer items-center justify-between">
          <span className="label mb-0">Connected panorama</span>
          <input
            type="checkbox"
            checked={!!state.panorama?.enabled}
            onChange={(e) => update({ panorama: { ...state.panorama, enabled: e.target.checked } })}
            className="h-4 w-4 accent-brand-500"
          />
        </label>
        <p className="text-[11px] text-slate-500">
          Spans the first screen&apos;s background across all screens so they line up as one
          continuous design in the store carousel. Set it in the Background tab on screen 1.
        </p>
      </div>
    </div>
  );
}
