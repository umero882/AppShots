/**
 * Pure math + presets for the "Real 3D (WebGL)" device mode — a live, rotatable
 * Three.js device whose screen carries the screenshot, with PBR metal and
 * environment reflections. Everything that doesn't need a GL context lives here
 * so it can be unit-tested; the WebGL plumbing is in components/Live3DDevice.jsx.
 *
 * Geometry is normalized to a 1-unit-wide device; the component scales it to the
 * canvas. Rotation is stored in degrees on `screen.live3d` and clamped here.
 */

const D2R = Math.PI / 180;
const ROT_LIMIT = 60; // degrees, both pitch and yaw

/** Default state when Real-3D is switched on for a screen. */
export function makeLive3d(overrides = {}) {
  return { enabled: true, rotX: -14, rotY: 22, zoom: 1, material: "titanium", env: "studio", ...overrides };
}

/** Body material presets — color + PBR params for a MeshStandardMaterial. */
export const LIVE3D_MATERIALS = [
  { id: "titanium", name: "Titanium", color: "#3b3d42", metalness: 1, roughness: 0.34 },
  { id: "graphite", name: "Graphite", color: "#1b1c20", metalness: 1, roughness: 0.26 },
  { id: "silver", name: "Silver", color: "#c8ccd2", metalness: 1, roughness: 0.22 },
  { id: "gold", name: "Gold", color: "#c9a45c", metalness: 1, roughness: 0.3 },
  { id: "blue", name: "Blue", color: "#2f4d74", metalness: 1, roughness: 0.32 },
  { id: "rose", name: "Rose", color: "#c08a82", metalness: 1, roughness: 0.3 },
];

export function materialPreset(id) {
  return LIVE3D_MATERIALS.find((m) => m.id === id) || LIVE3D_MATERIALS[0];
}

/** Environment (reflection mood) presets. */
export const LIVE3D_ENVS = [
  { id: "studio", name: "Studio" },
  { id: "warm", name: "Warm" },
  { id: "cool", name: "Cool" },
];

const clampDeg = (v) => Math.max(-ROT_LIMIT, Math.min(ROT_LIMIT, v || 0));

/** Clamp a (rotX, rotY) pair to the allowed tilt range. */
export function clampRot(rotX, rotY) {
  return { rotX: clampDeg(rotX), rotY: clampDeg(rotY) };
}

/** Device group rotation in radians, clamped. x = pitch, y = yaw. */
export function rotationRad(live3d) {
  const { rotX, rotY } = clampRot(live3d?.rotX, live3d?.rotY);
  return { x: rotX * D2R, y: rotY * D2R };
}

/**
 * Normalized device box derived from the screen aspect (height / width). The
 * device is 1 unit wide; height follows the aspect so phones and tablets keep
 * their proportions.
 */
export function deviceBox(aspect, { depth = 0.085, radius = 0.07, bezel = 0.025 } = {}) {
  const a = aspect > 0 ? aspect : 2;
  return { width: 1, height: a, depth, radius, bezel };
}

/** Camera distance for a zoom factor (1 = default framing); zoom in → closer. */
export function cameraDistance(zoom = 1) {
  const z = zoom > 0 ? zoom : 1;
  return 3.2 / z;
}

/**
 * Translate a pointer drag delta (px) into rotation deltas (deg). Horizontal
 * drag spins the yaw; vertical drag changes the pitch (inverted so dragging up
 * tips the top of the device toward you).
 */
export function dragToRot(dx, dy, sens = 0.4) {
  return { dRotY: dx * sens, dRotX: -dy * sens };
}
