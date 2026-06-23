import { useRef, useState } from "react";
import { X, RotateCw, Maximize2 } from "lucide-react";
import {
  fracDelta, clamp01, angleFromCenter, distance, scaleFromResize, snapToGuides,
} from "../lib/elements";
import { orientedCanvas, frameColorOf } from "../lib/deviceLayout";
import { frameSpec, railGradient, shade, mix } from "../lib/deviceFrames";

/**
 * A realistic device mockup: a metal rail (brushed gradient) around a black
 * screen bezel and the screenshot, with a family-specific camera cutout and side
 * buttons — so an iPhone, iPad, Pixel and Galaxy read as different devices, not
 * just different sizes.
 *
 * 3D: tiltX/tiltY apply a single-element perspective rotation (exports cleanly),
 * plus an extruded metal edge (layered box-shadow in the tilt direction), a
 * screen glare that shifts with the angle, and a contact shadow on the ground —
 * the cues that make the tilt actually read as 3D.
 */
export function DeviceMockup({ device, image, width, orientation = "portrait", color, tiltX = 0, tiltY = 0, fit = "fill" }) {
  const canvas = orientedCanvas(device, orientation);
  const w = width;
  const h = w * (canvas.h / canvas.w);
  const spec = frameSpec(device);
  const land = orientation === "landscape";

  const railPx = Math.max(2, w * spec.rail);
  const bezelPx = Math.max(3, w * spec.bezel);
  const chinPx = w * spec.chin;
  const radius = w * spec.radius;
  const innerR = Math.max(2, radius - railPx);
  const screenR = Math.max(1, innerR - bezelPx * 0.5);

  const railColor = color || device.bezel.color;
  const tilted = Math.abs(tiltX) + Math.abs(tiltY) > 1.5;

  // Extruded metal side wall stepping in the tilt direction. Coloured like a
  // real chamfered rail: a bright highlight catching light at the visible edge,
  // falling off to the dark body — this is what makes the tilt read as 3D.
  const extrusion = (() => {
    if (!tilted) return "";
    const mag = Math.min(46, Math.abs(tiltX) + Math.abs(tiltY));
    const ex = -Math.sin((tiltY * Math.PI) / 180);
    const ey = Math.sin((tiltX * Math.PI) / 180);
    const len = w * 0.085 * (mag / 26);
    const steps = 20;
    const hi = shade(railColor, 0.5);
    const body = shade(railColor, -0.12);
    const deep = shade(railColor, -0.62);
    const parts = [];
    for (let i = 1; i <= steps; i++) {
      const f = (len * i) / steps;
      // first ~2 steps = bright chamfer, then body grading into deep shadow
      const col = i <= 2 ? hi : mix(body, deep, (i - 2) / (steps - 2));
      parts.push(`${(ex * f).toFixed(1)}px ${(ey * f).toFixed(1)}px 0 ${col}`);
    }
    return parts.join(", ");
  })();

  // Screen glare band — its position tracks the horizontal tilt (glass look).
  const glarePos = 50 + tiltY * 1.3;
  const glare = `linear-gradient(112deg, transparent ${glarePos - 28}%, rgba(255,255,255,0.14) ${glarePos}%, rgba(255,255,255,0.04) ${glarePos + 10}%, transparent ${glarePos + 22}%)`;

  return (
    <div className="relative" style={{ width: w, height: h }}>
      {/* soft contact shadow on the ground, drifting + narrowing with tilt */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          left: "50%", top: "50%", width: w * 1.02, height: h * 0.12,
          transform: `translate(-50%, ${h * 0.47}px) translateX(${tiltY * 1.5}px) scaleX(${Math.max(0.6, 1 - Math.abs(tiltY) / 160)})`,
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.42), rgba(0,0,0,0.16) 46%, transparent 72%)",
          borderRadius: "50%",
        }}
      />

      {/* the device — single-element 3D projection (stronger perspective) */}
      <div
        style={{
          width: w, height: h,
          transform: `perspective(${w * 1.25}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
          transformOrigin: "center center",
        }}
      >
        {/* metal rail */}
        <div
          className="relative h-full w-full"
          style={{
            background: railGradient(railColor),
            borderRadius: radius,
            padding: railPx,
            boxShadow: [extrusion, "0 30px 60px -22px rgba(0,0,0,0.6)"].filter(Boolean).join(", "),
          }}
        >
          {/* subtle rail highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ borderRadius: radius, boxShadow: `inset 0 0 ${railPx * 1.4}px rgba(255,255,255,${spec.railLight ? 0.35 : 0.18})` }}
          />
          {/* black screen bezel (chin/forehead for classic phones) */}
          <div
            className="relative h-full w-full overflow-hidden"
            style={{
              background: "#050509",
              borderRadius: innerR,
              padding: `${bezelPx + (land ? 0 : chinPx)}px ${bezelPx + (land ? chinPx : 0)}px`,
            }}
          >
            <div className="relative h-full w-full overflow-hidden bg-white" style={{ borderRadius: screenR }}>
              {image ? (
                fit === "contain" ? (
                  <>
                    {/* whole screenshot, never cropped; a blurred cover copy fills
                        the letterbox area so it reads as intentional. */}
                    <img
                      src={image}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ filter: "blur(16px)", transform: "scale(1.12)" }}
                      crossOrigin="anonymous"
                    />
                    <img
                      src={image}
                      alt="app screenshot"
                      className="absolute inset-0 h-full w-full"
                      style={{ objectFit: "contain" }}
                      crossOrigin="anonymous"
                    />
                  </>
                ) : (
                  // fill: cover the screen edge-to-edge, anchored to the top so
                  // headers/status bar stay and only the overflowing bottom trims.
                  <img
                    src={image}
                    alt="app screenshot"
                    className="absolute inset-0 h-full w-full"
                    style={{ objectFit: "cover", objectPosition: "top center" }}
                    crossOrigin="anonymous"
                  />
                )
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 text-slate-400">
                  <svg width="26%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <span className="mt-2 text-[10px] font-medium uppercase tracking-wider">Upload screenshot</span>
                </div>
              )}
              {/* glass glare + recessed-glass inner shadow for depth */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: glare }} />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{ boxShadow: `inset 0 0 ${w * 0.03}px rgba(0,0,0,0.30)`, borderRadius: screenR }}
              />
            </div>

            <Camera spec={spec} w={w} land={land} chinPx={chinPx} bezelPx={bezelPx} />
          </div>

          {!land && <DeviceButtons layout={spec.buttons} w={w} h={h} railPx={railPx} color={railColor} />}
        </div>
      </div>
    </div>
  );
}

/** Family-specific front camera / cutout, positioned over the screen or chin. */
function Camera({ spec, w, land, chinPx, bezelPx }) {
  if (spec.camera === "none" || land) return null;
  const black = { background: "#000" };
  if (spec.camera === "island") {
    return <div className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ ...black, top: w * 0.03, width: w * 0.26, height: w * 0.075 }} />;
  }
  if (spec.camera === "notch") {
    return <div className="absolute left-1/2 -translate-x-1/2 rounded-b-2xl" style={{ ...black, top: bezelPx, width: w * 0.42, height: w * 0.06 }} />;
  }
  if (spec.camera === "punch") {
    return <div className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ ...black, top: w * 0.035, width: w * 0.05, height: w * 0.05 }} />;
  }
  if (spec.camera === "dot") {
    // iPad front camera — a tiny lens centered on the top bezel.
    return <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-slate-700" style={{ top: bezelPx * 0.35, width: w * 0.012, height: w * 0.012 }} />;
  }
  if (spec.camera === "home") {
    // Classic iPhone — earpiece in the forehead + home button in the chin.
    return (
      <>
        <div className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ ...black, top: chinPx * 0.5, width: w * 0.16, height: w * 0.012 }} />
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
          style={{ bottom: chinPx * 0.18, width: chinPx * 0.5, height: chinPx * 0.5, background: "#0b0b0e", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)" }}
        />
      </>
    );
  }
  return null;
}

/** Side buttons whose placement/material vary by device family. */
function DeviceButtons({ layout, w, h, railPx, color }) {
  const bw = Math.max(2, w * 0.013);
  const grad = `linear-gradient(180deg, ${shade(color, 0.2)}, ${shade(color, -0.25)})`;
  const btn = (style, key) => (
    <div key={key} className="absolute" style={{ width: bw, background: grad, borderRadius: bw, ...style }} />
  );
  const off = -bw * 0.55;
  if (layout === "iphone") {
    return (
      <>
        {btn({ left: off, top: h * 0.16, height: h * 0.045 }, "action")}
        {btn({ left: off, top: h * 0.24, height: h * 0.07 }, "vup")}
        {btn({ left: off, top: h * 0.335, height: h * 0.07 }, "vdn")}
        {btn({ right: off, top: h * 0.26, height: h * 0.11 }, "power")}
      </>
    );
  }
  if (layout === "ipad") {
    return (
      <>
        {btn({ right: off, top: h * 0.05, height: h * 0.05 }, "power")}
        {btn({ right: off, top: h * 0.14, height: h * 0.08 }, "vol")}
      </>
    );
  }
  // right2 — power above a longer volume rocker on the right (Pixel/Galaxy/Android)
  return (
    <>
      {btn({ right: off, top: h * 0.2, height: h * 0.075 }, "power")}
      {btn({ right: off, top: h * 0.31, height: h * 0.12 }, "vol")}
    </>
  );
}

/**
 * Free-positioning overlay for one screen's device mockups. Each instance is
 * absolutely placed by fractional x/y and z-rotated here; the 3D tilt + depth
 * live inside DeviceMockup. Selected mockups get drag/resize/rotate handles.
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
              transform: `translate(-50%, -50%) rotate(${d.rotation || 0}deg)`,
            }}
          >
            <DeviceMockup
              device={device}
              image={d.image}
              width={elW}
              orientation={d.orientation}
              color={color}
              tiltX={d.tiltX}
              tiltY={d.tiltY}
              fit={d.fit}
            />

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
