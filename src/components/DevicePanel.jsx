import { useState } from "react";
import { Smartphone, Plus, Copy, Trash2, X } from "lucide-react";
import { DEVICES, getDevice } from "../lib/devices";
import { orientedCanvas, isFreeMode } from "../lib/deviceLayout";

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
  onAdd, onChange, onDelete, onDuplicate, onSelect, onPromote,
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

      {/* ---- device mockups ---- */}
      <div className="space-y-3 border-t border-white/10 pt-4">
        <p className="label mb-0">Device mockups</p>

        {!free ? (
          <>
            <p className="text-xs text-slate-400">
              One centered device. Position it freely, tilt it in 3D, or add more.
            </p>
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
