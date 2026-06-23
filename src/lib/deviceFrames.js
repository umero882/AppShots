/**
 * Per-device-family visual identity for realistic mockups. Pure helpers (no DOM)
 * so they're testable; DeviceMockup turns a spec into CSS/SVG.
 *
 * Each family differs by more than size: corner radius, bezel thickness, metal
 * rail, camera cutout (island / notch / punch-hole / iPad dot / classic home
 * button) and side-button layout — the cues that make an iPhone read as an
 * iPhone and a Pixel as a Pixel.
 */

/** Lighten (amt>0) or darken (amt<0) a hex color. amt in [-1,1]. */
export function shade(hex, amt) {
  let c = String(hex || "#000").replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const ch = (v) => Math.round((t - v) * p) + v;
  const r = ch((num >> 16) & 255);
  const g = ch((num >> 8) & 255);
  const b = ch(num & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function toRgb(hex) {
  let c = String(hex || "#000").replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const n = parseInt(c, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Linear blend between two hex colors. t in [0,1]. */
export function mix(a, b, t) {
  const pa = toRgb(a);
  const pb = toRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const v = (x, y) => Math.round(x + (y - x) * k);
  const r = v(pa.r, pb.r);
  const g = v(pa.g, pb.g);
  const bch = v(pa.b, pb.b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bch).toString(16).slice(1)}`;
}

/** Brushed-metal gradient for the device rail from a base color. */
export function railGradient(hex) {
  return `linear-gradient(145deg, ${shade(hex, 0.34)} 0%, ${hex} 46%, ${shade(hex, -0.3)} 100%)`;
}

// radius/bezel/rail are fractions of the frame width. `chin` adds extra bezel top
// & bottom (classic phones). `buttons` selects a layout.
const FAMILY = {
  iphone:          { radius: 0.165, bezel: 0.030, rail: 0.014, chin: 0, buttons: "iphone", railLight: true },
  "iphone-classic":{ radius: 0.085, bezel: 0.030, rail: 0.010, chin: 0.085, buttons: "iphone", railLight: false },
  ipad:            { radius: 0.055, bezel: 0.045, rail: 0.010, chin: 0, buttons: "ipad", railLight: true },
  pixel:           { radius: 0.105, bezel: 0.028, rail: 0.009, chin: 0, buttons: "right2", railLight: false },
  galaxy:          { radius: 0.070, bezel: 0.020, rail: 0.006, chin: 0, buttons: "right2", railLight: false },
  "android-phone": { radius: 0.110, bezel: 0.032, rail: 0.010, chin: 0, buttons: "right2", railLight: false },
  "android-tablet":{ radius: 0.050, bezel: 0.050, rail: 0.010, chin: 0, buttons: "ipad", railLight: false },
};

/** Resolve a device's family from an explicit field or its id. */
export function familyOf(device) {
  if (device?.family) return device.family;
  const id = device?.id || "";
  if (id.startsWith("ipad")) return "ipad";
  if (id.includes("pixel")) return "pixel";
  if (id.includes("galaxy")) return "galaxy";
  if (id.includes("tablet")) return "android-tablet";
  if (id.startsWith("iphone")) return device?.notch === "none" ? "iphone-classic" : "iphone";
  return "android-phone";
}

/** Camera cutout style for a device, factoring family. */
export function cameraType(device, family) {
  const byNotch = { "dynamic-island": "island", notch: "notch", "punch-hole": "punch", none: "none" };
  let cam = byNotch[device?.notch] || "none";
  if (cam === "none") {
    if (family === "ipad" || family === "android-tablet") cam = "dot";
    else if (family === "iphone-classic") cam = "home"; // forehead earpiece + home button
  }
  return cam;
}

/** Full visual spec for rendering a device frame. */
export function frameSpec(device) {
  const family = familyOf(device);
  const base = FAMILY[family] || FAMILY["android-phone"];
  return { family, camera: cameraType(device, family), ...base };
}
