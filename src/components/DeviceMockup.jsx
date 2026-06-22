import { useRef, useState } from "react";
import { X, RotateCw, Maximize2 } from "lucide-react";
import {
  fracDelta, clamp01, angleFromCenter, distance, scaleFromResize, snapToGuides,
} from "../lib/elements";
import { orientedCanvas, deviceTransform, frameColorOf, frameButtonColor } from "../lib/deviceLayout";

/**
 * A single device mockup: CSS/SVG bezel + screen + notch + side buttons wrapping
 * an uploaded screenshot. `width` is the rendered frame width in px; the height
 * follows the device aspect (swapped in landscape). The notch is hidden in
 * landscape — a top-center island would sit on the wrong edge.
 */
export function DeviceMockup({ device, image, width, orientation = "portrait", color }) {
  const canvas = orientedCanvas(device, orientation);
  const w = width;
  const h = w * (canvas.h / canvas.w);
  const bezel = Math.max(4, w * 0.035);
  const radius = w * 0.13;
  const notch = orientation === "landscape" ? "none" : device.notch;
  const bezelColor = color || device.bezel.color;
  const buttonColor = frameButtonColor(bezelColor);

  return (
    <div
      className="relative shadow-2xl"
      style={{
        width: w,
        height: h,
        background: bezelColor,
        borderRadius: radius,
        padding: bezel,
        boxShadow: "0 25px 60px -15px rgba(0,0,0,0.55)",
        outline: `${Math.max(1, w * 0.004)}px solid rgba(255,255,255,0.10)`,
        outlineOffset: -Math.max(1, w * 0.004),
      }}
    >
      {device.buttons && <SideButtons w={w} h={h} color={buttonColor} />}
      <div
        className="relative w-full h-full overflow-hidden bg-white"
        style={{ borderRadius: radius - bezel * 0.6 }}
      >
        <Notch type={notch} />
        {image ? (
          <img
            src={image}
            alt="app screenshot"
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 text-slate-400">
            <svg width="28%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span className="mt-2 text-[10px] font-medium uppercase tracking-wider">
              Upload screenshot
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Notch({ type }) {
  if (type === "none") return null;
  if (type === "dynamic-island") {
    return <div className="absolute left-1/2 top-[1.5%] -translate-x-1/2 h-[3.5%] aspect-[2.6] rounded-full bg-black z-20" />;
  }
  if (type === "notch") {
    return <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[3%] w-[42%] rounded-b-2xl bg-black z-20" />;
  }
  // punch-hole
  return <div className="absolute left-1/2 top-[1.4%] -translate-x-1/2 h-[1.6%] aspect-square rounded-full bg-black z-20" />;
}

function SideButtons({ w, h, color = "#26262b" }) {
  const bw = Math.max(2, w * 0.012);
  const btn = (style) => (
    <div className="absolute" style={{ width: bw, background: color, borderRadius: bw, ...style }} />
  );
  return (
    <>
      {btn({ right: -bw * 0.6, top: h * 0.22, height: h * 0.09 })}
      {btn({ left: -bw * 0.6, top: h * 0.18, height: h * 0.06 })}
      {btn({ left: -bw * 0.6, top: h * 0.26, height: h * 0.1 })}
    </>
  );
}

/**
 * Free-positioning overlay for one screen's device mockups. Mirrors
 * ElementsLayer: each instance is absolutely placed by fractional x/y, gets a
 * 3D-tilt + rotation transform, and (when editable + selected) shows
 * drag/resize/rotate/delete handles. Tilt itself is set from the panel sliders.
 */
export function DevicesLayer({
  devices = [],
  width,
  getDevice,
  defaultColor = null,
  editable = false,
  selectedId = null,
  onSelect,
  onChange,
  onDelete,
}) {
  const rootRef = useRef(null);
  const drag = useRef(null);
  const [guides, setGuides] = useState({ x: null, y: null });
  const resolve = getDevice || ((id) => DEVICE_FALLBACK(id));

  function canvasRect() {
    return rootRef.current?.getBoundingClientRect();
  }

  function startMove(e, d) {
    if (!editable) return;
    e.stopPropagation();
    onSelect?.(d.id);
    const rect = canvasRect();
    drag.current = { mode: "move", id: d.id, startX: e.clientX, startY: e.clientY, ox: d.x, oy: d.y, rect };
    addWindowListeners();
  }

  function startResize(e, d) {
    e.stopPropagation();
    const rect = canvasRect();
    const cx = rect.left + d.x * rect.width;
    const cy = rect.top + d.y * rect.height;
    drag.current = { mode: "resize", id: d.id, cx, cy, startDist: distance(cx, cy, e.clientX, e.clientY), baseScale: d.scale };
    addWindowListeners();
  }

  function startRotate(e, d) {
    e.stopPropagation();
    const rect = canvasRect();
    const cx = rect.left + d.x * rect.width;
    const cy = rect.top + d.y * rect.height;
    drag.current = { mode: "rotate", id: d.id, cx, cy, startAngle: angleFromCenter(cx, cy, e.clientX, e.clientY), baseRot: d.rotation };
    addWindowListeners();
  }

  function onMove(e) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      const { dx, dy } = fracDelta(e.clientX - d.startX, e.clientY - d.startY, d.rect.width, d.rect.height);
      const targets = [
        { x: 0.5, y: 0.5 },
        ...devices.filter((x) => x.id !== d.id).map((x) => ({ x: x.x, y: x.y })),
      ];
      const snap = snapToGuides(clamp01(d.ox + dx), clamp01(d.oy + dy), targets);
      onChange?.(d.id, { x: snap.x, y: snap.y });
      setGuides({ x: snap.guideX, y: snap.guideY });
    } else if (d.mode === "resize") {
      onChange?.(d.id, { scale: scaleFromResize(d.baseScale, d.startDist, distance(d.cx, d.cy, e.clientX, e.clientY)) });
    } else if (d.mode === "rotate") {
      const ang = angleFromCenter(d.cx, d.cy, e.clientX, e.clientY);
      onChange?.(d.id, { rotation: Math.round(d.baseRot + (ang - d.startAngle)) });
    }
  }

  function endDrag() {
    drag.current = null;
    setGuides({ x: null, y: null });
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
  }

  function addWindowListeners() {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10">
      {editable && guides.x != null && (
        <div className="pointer-events-none absolute inset-y-0 z-40 w-px -translate-x-1/2 bg-brand-400/80" style={{ left: `${guides.x * 100}%` }} />
      )}
      {editable && guides.y != null && (
        <div className="pointer-events-none absolute inset-x-0 z-40 h-px -translate-y-1/2 bg-brand-400/80" style={{ top: `${guides.y * 100}%` }} />
      )}
      {devices.map((d) => {
        const device = resolve(d.deviceId);
        const elW = width * d.scale;
        const color = frameColorOf(d, defaultColor, device);
        const selected = editable && selectedId === d.id;
        return (
          <div
            key={d.id}
            onPointerDown={(e) => startMove(e, d)}
            className={`absolute ${editable ? "pointer-events-auto cursor-move" : ""}`}
            style={{
              left: `${d.x * 100}%`,
              top: `${d.y * 100}%`,
              width: elW,
              transform: deviceTransform(d),
              transformStyle: "preserve-3d",
            }}
          >
            <DeviceMockup device={device} image={d.image} width={elW} orientation={d.orientation} color={color} />

            {selected && (
              <>
                <div className="pointer-events-none absolute -inset-1 rounded-[10px] border-2 border-brand-400" />
                <button
                  onPointerDown={(e) => { e.stopPropagation(); onDelete?.(d.id); }}
                  className="absolute -right-3 -top-3 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white shadow"
                  title="Delete"
                >
                  <X size={12} />
                </button>
                <button
                  onPointerDown={(e) => startRotate(e, d)}
                  className="absolute left-1/2 -top-7 grid h-5 w-5 -translate-x-1/2 cursor-grab place-items-center rounded-full bg-brand-500 text-white shadow"
                  title="Rotate"
                >
                  <RotateCw size={12} />
                </button>
                <button
                  onPointerDown={(e) => startResize(e, d)}
                  className="absolute -bottom-3 -right-3 grid h-5 w-5 cursor-nwse-resize place-items-center rounded-full bg-white text-ink-900 shadow ring-1 ring-black/10"
                  title="Resize"
                >
                  <Maximize2 size={11} />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Defensive fallback so the layer renders even if no resolver is supplied.
function DEVICE_FALLBACK(id) {
  return { id, canvas: { w: 1290, h: 2796 }, bezel: { color: "#0b0b0e" }, notch: "none", buttons: false };
}
