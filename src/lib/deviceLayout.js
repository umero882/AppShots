/**
 * Device-mockup layout engine. Pure, framework-free logic for the "device
 * studio": freely positioned + 3D-tilted + multiple + landscape device mockups,
 * plus connected-panorama backgrounds.
 *
 * Backward compatibility is the core constraint. Legacy projects/templates carry
 * a single global `state.deviceId` + `state.deviceScale` and a per-screen
 * `screen.image`. We keep rendering those identically by synthesizing one
 * centered instance on demand (`screenDevices`). A screen only switches to
 * "free mode" once it has an explicit `screen.devices` array — which the editor
 * materializes the first time the user positions/tilts/adds a mockup.
 */
import { clamp01 } from "./elements";

// Baseline 3D perspective (px) applied when a mockup is tilted.
export const PERSPECTIVE = 1200;

// Selectable device frame finishes (bezel color). `bezel` is the frame color;
// `button` overrides the side-button color so it reads on light finishes.
export const FRAME_COLORS = [
  { id: "black", name: "Black", bezel: "#0b0b0e" },
  { id: "titanium", name: "Titanium", bezel: "#54545a" },
  { id: "silver", name: "Silver", bezel: "#d6d6d8", button: "#b8b8bd" },
  { id: "gold", name: "Gold", bezel: "#cdb58e", button: "#b09a72" },
  { id: "blue", name: "Blue", bezel: "#2f3b52" },
  { id: "rose", name: "Rose", bezel: "#caa69b", button: "#ac897f" },
];

const FRAME_BY_ID = Object.fromEntries(FRAME_COLORS.map((c) => [c.id, c]));

/** Resolve a mockup's bezel hex: instance override → project default → device. */
export function frameColorOf(inst, projectColor, device) {
  return inst?.frameColor || projectColor || device?.bezel?.color || "#0b0b0e";
}

/** The side-button color for a bezel finish (darker tint for light frames). */
export function frameButtonColor(bezelHex) {
  const f = FRAME_COLORS.find((c) => c.bezel.toLowerCase() === String(bezelHex).toLowerCase());
  return f?.button || "#26262b";
}

export function getFrameColor(id) {
  return FRAME_BY_ID[id] || null;
}

const freshId = () => `dev_${Math.random().toString(36).slice(2, 9)}`;

/** Output canvas dimensions honoring orientation (landscape swaps w/h). */
export function orientedCanvas(device, orientation = "portrait") {
  const { w, h } = device.canvas;
  return orientation === "landscape" ? { w: h, h: w } : { w, h };
}

/** A placed device mockup instance with sensible defaults. */
export function makeDeviceInstance(deviceId, opts = {}) {
  return {
    id: opts.id || freshId(),
    deviceId,
    image: opts.image ?? null,
    x: opts.x ?? 0.5,
    y: opts.y ?? 0.5,
    scale: opts.scale ?? 0.78,
    rotation: opts.rotation ?? 0,
    tiltX: opts.tiltX ?? 0,
    tiltY: opts.tiltY ?? 0,
    orientation: opts.orientation ?? "portrait",
    frameColor: opts.frameColor ?? null,
  };
}

/** Copy of an instance with a fresh id, nudged so it doesn't sit exactly on top. */
export function duplicateDeviceInstance(inst) {
  return {
    ...inst,
    id: freshId(),
    x: clamp01((inst.x ?? 0.5) + 0.04),
    y: clamp01((inst.y ?? 0.5) + 0.04),
  };
}

/** True once a screen has opted into explicit multi/free device placement. */
export function isFreeMode(screen) {
  return Array.isArray(screen?.devices) && screen.devices.length > 0;
}

/**
 * Devices to render for a screen. Returns the explicit array in free mode,
 * else a single synthesized instance from the legacy single-device fields so
 * old projects/templates render exactly as before.
 */
export function screenDevices(screen, state) {
  if (isFreeMode(screen)) return screen.devices;
  return [
    makeDeviceInstance(state.deviceId, {
      id: "legacy",
      image: screen?.image ?? null,
      scale: state.deviceScale ?? 0.78,
      orientation: state.orientation ?? "portrait",
    }),
  ];
}

/**
 * CSS transform for a free-positioned mockup whose container is absolutely
 * placed at top/left = y/x %. Always centers; adds perspective tilt + z-rotation
 * only when set (keeps upright mockups pixel-identical to the legacy frame).
 */
export function deviceTransform(inst, { perspective = PERSPECTIVE } = {}) {
  const parts = ["translate(-50%, -50%)"];
  if (inst.tiltX || inst.tiltY) {
    parts.push(`perspective(${perspective}px)`);
    if (inst.tiltX) parts.push(`rotateX(${inst.tiltX}deg)`);
    if (inst.tiltY) parts.push(`rotateY(${inst.tiltY}deg)`);
  }
  if (inst.rotation) parts.push(`rotate(${inst.rotation}deg)`);
  return parts.join(" ");
}

/**
 * Connected-panorama background slice. With one design spanning `total` screens,
 * screen `index` shows its horizontal slice (0% for the first, 100% for the
 * last). Returns null when there's nothing to span (<2 screens).
 */
export function panoramaStyle(index, total) {
  if (!total || total < 2) return null;
  return {
    backgroundSize: `${total * 100}% 100%`,
    backgroundPosition: `${(index / (total - 1)) * 100}% 50%`,
    backgroundRepeat: "no-repeat",
  };
}
