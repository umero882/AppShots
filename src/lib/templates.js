/**
 * Background presets + a few starter templates. All original gradient palettes.
 */

export const GRADIENTS = [
  { id: "indigo", name: "Indigo", from: "#6366f1", to: "#8b5cf6", angle: 135 },
  { id: "sunset", name: "Sunset", from: "#f97316", to: "#ec4899", angle: 135 },
  { id: "ocean", name: "Ocean", from: "#0ea5e9", to: "#22d3ee", angle: 135 },
  { id: "forest", name: "Forest", from: "#10b981", to: "#84cc16", angle: 135 },
  { id: "grape", name: "Grape", from: "#7c3aed", to: "#db2777", angle: 160 },
  { id: "slate", name: "Slate", from: "#1e293b", to: "#475569", angle: 135 },
  { id: "peach", name: "Peach", from: "#fb7185", to: "#fbbf24", angle: 135 },
  { id: "mint", name: "Mint", from: "#14b8a6", to: "#a7f3d0", angle: 135 },
];

export const SOLIDS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#ec4899", "#8b5cf6", "#111827", "#ffffff", "#f3f4f6",
];

export const FONTS = [
  { id: "inter", name: "Inter", stack: "Inter, sans-serif" },
  { id: "system", name: "System", stack: "system-ui, sans-serif" },
  { id: "georgia", name: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", name: "Mono", stack: "ui-monospace, 'SFMono-Regular', monospace" },
];

export const LAYOUTS = [
  { id: "text-top", name: "Text top", textPos: "top", deviceScale: 0.78 },
  { id: "text-bottom", name: "Text bottom", textPos: "bottom", deviceScale: 0.78 },
  { id: "device-only", name: "Device only", textPos: "none", deviceScale: 0.92 },
  { id: "centered", name: "Centered", textPos: "top", deviceScale: 0.68 },
];

export function defaultScreen() {
  return {
    id: Math.random().toString(36).slice(2, 9),
    heading: "Your headline here",
    subheading: "",
    image: null, // dataURL of the uploaded screenshot
  };
}

export function defaultProjectState() {
  return {
    deviceId: "iphone-69",
    layoutId: "text-top",
    background: { type: "gradient", gradient: "indigo", solid: "#6366f1", image: null },
    text: {
      font: "inter",
      color: "#ffffff",
      size: 64,
      weight: 800,
      align: "center",
    },
    // Subheading styling, independent of the header (size/color/weight).
    subtext: {
      color: "#ffffff",
      size: 28,
      weight: 500,
    },
    deviceScale: 0.78,
    deviceFit: "fill", // fill the device screen edge-to-edge by default (no blurred sides)
    // Fill-assist — two INDEPENDENT options that keep a screenshot from cropping
    // or floating in blurred side-bars (both default on; legacy projects opt in
    // via `!== false`). Both show the WHOLE shot edge-to-edge (stretch):
    //  • autoFill: a mockup whose screenshot is narrower than its screen (would
    //    letterbox in "Fit") stretches instead of showing side-bars.
    //  • ipadForceFill: iPad mockups always stretch, whatever the fit toggle says.
    autoFill: true,
    ipadForceFill: true,
    screens: [defaultScreen()],
  };
}
