import { LAYOUTS, GRADIENTS } from "./templates";
import { contrastRatio } from "./contrast";
import {
  mockDashboard, mockFeed, mockProfile, mockOnboarding,
  mockStats, mockChat, mockMusic, mockMap,
} from "./mockScreens";

export function textPosFor(layoutId) {
  const l = LAYOUTS.find((x) => x.id === layoutId) || LAYOUTS[0];
  return l.textPos;
}

function freshId() {
  return Math.random().toString(36).slice(2, 9);
}

export function templateToProjectState(template) {
  const { deviceId, layoutId, deviceScale, background, text } = template.style;
  return {
    deviceId,
    layoutId,
    deviceScale,
    background: { ...background },
    text: { ...text },
    screens: template.screens.map((s) => ({
      id: freshId(),
      heading: s.heading,
      subheading: s.subheading || "",
      image: s.image ?? null,
    })),
  };
}

export function applyTemplateStyle(prevState, template) {
  const { deviceId, layoutId, deviceScale, background, text } = template.style;
  return {
    ...prevState,
    deviceId,
    layoutId,
    deviceScale,
    background: { ...background },
    text: { ...text },
  };
}

export function filterTemplates(templates, { category = "All", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return templates.filter(
    (t) =>
      (category === "All" || t.category === category) &&
      (!q ||
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q))
  );
}

/* ----------------------------- catalog ----------------------------- */

export const TEMPLATE_CATEGORIES = [
  "Minimal", "Bold", "Playful", "Dark", "Editorial", "Vibrant", "Gradient", "Pattern",
];

export function backgroundColors(background) {
  if (background.type === "solid") return [background.solid];
  const g = GRADIENTS.find((x) => x.id === background.gradient) || GRADIENTS[0];
  return [g.from, g.to];
}

export function worstContrast(textColor, background) {
  return Math.min(
    ...backgroundColors(background).map((c) => contrastRatio(textColor, c))
  );
}

export const SUGGEST_LIGHT = "#ffffff";
export const SUGGEST_DARK = "#0b1020";

/**
 * Best-contrast headline color (light or dark) for a given background — picks
 * whichever of SUGGEST_LIGHT / SUGGEST_DARK has the higher worst-case contrast.
 */
export function suggestTextColor(background) {
  return worstContrast(SUGGEST_DARK, background) > worstContrast(SUGGEST_LIGHT, background)
    ? SUGGEST_DARK
    : SUGGEST_LIGHT;
}

function scaleFor(layoutId) {
  const l = LAYOUTS.find((x) => x.id === layoutId) || LAYOUTS[0];
  return l.deviceScale;
}

const gradBg = (gradient, solidFallback) => ({ type: "gradient", gradient, solid: solidFallback });
const solidBg = (solid) => ({ type: "solid", gradient: "indigo", solid });
const patBg = (pattern, fg, base, scale = 26) => ({
  type: "pattern", pattern, patternFg: fg, patternBg: base, patternScale: scale,
});

// mk(id, name, category, accent, background, color, font, layoutId, deviceId, screens)
function mk(id, name, category, accent, background, color, font, layoutId, deviceId, screens) {
  return {
    id, name, category, accent,
    style: {
      deviceId, layoutId,
      deviceScale: scaleFor(layoutId),
      background,
      text: { font, color, size: 60, weight: 800, align: "center" },
    },
    screens,
  };
}

const scr = (image, heading, subheading = "") => ({ image, heading, subheading });

export const TEMPLATES = [
  // ---------- Minimal (light solids, dark text) ----------
  mk("minimal-light", "Minimal Light", "Minimal", "#6366f1", solidBg("#f3f4f6"), "#111827", "inter", "text-top", "iphone-69", [
    scr(mockDashboard("#6366f1"), "Everything in one place", "Simple, fast, focused."),
    scr(mockFeed("#6366f1"), "Stay in your flow"),
    scr(mockProfile("#6366f1"), "Made for you"),
  ]),
  mk("minimal-paper", "Paper", "Minimal", "#0ea5e9", solidBg("#ffffff"), "#0b1020", "inter", "text-bottom", "iphone-69", [
    scr(mockOnboarding("#0ea5e9"), "Start in seconds"),
    scr(mockStats("#0ea5e9"), "See your progress"),
  ]),
  mk("minimal-mist", "Mist", "Minimal", "#6366f1", solidBg("#eef2ff"), "#1e1b4b", "inter", "centered", "ipad-13", [
    scr(mockDashboard("#6366f1"), "Designed to feel calm"),
    scr(mockChat("#6366f1"), "Talk to anyone"),
  ]),
  mk("minimal-stone", "Stone", "Minimal", "#0f766e", solidBg("#e7e5e4"), "#1c1917", "inter", "text-top", "pixel-8", [
    scr(mockMap("#0f766e"), "Find your way"),
    scr(mockFeed("#0f766e"), "Discover more"),
  ]),

  // ---------- Bold (dark saturated solids, white text) ----------
  mk("bold-indigo", "Bold Indigo", "Bold", "#a5b4fc", solidBg("#3730a3"), "#ffffff", "inter", "text-top", "iphone-69", [
    scr(mockStats("#a5b4fc", { dark: true }), "Numbers that matter"),
    scr(mockDashboard("#a5b4fc", { dark: true }), "Command center"),
    scr(mockProfile("#a5b4fc", { dark: true }), "Your space"),
  ]),
  mk("bold-crimson", "Crimson", "Bold", "#fecaca", solidBg("#9f1239"), "#ffffff", "inter", "text-bottom", "iphone-69", [
    scr(mockFeed("#fecaca", { dark: true }), "Turn heads"),
    scr(mockChat("#fecaca", { dark: true }), "Never miss a beat"),
  ]),
  mk("bold-emerald", "Emerald", "Bold", "#6ee7b7", solidBg("#065f46"), "#ffffff", "inter", "centered", "pixel-8", [
    scr(mockMap("#6ee7b7", { dark: true }), "Go further"),
    scr(mockStats("#6ee7b7", { dark: true }), "Grow every day"),
  ]),
  mk("bold-violet", "Violet", "Bold", "#ddd6fe", solidBg("#5b21b6"), "#ffffff", "system", "text-top", "iphone-65", [
    scr(mockMusic("#ddd6fe", { dark: true }), "Feel the rhythm"),
    scr(mockFeed("#ddd6fe", { dark: true }), "Endless discovery"),
  ]),

  // ---------- Playful (gradients, dark text) ----------
  mk("playful-peach", "Peach Pop", "Playful", "#9a3412", gradBg("peach", "#fb7185"), "#1c1917", "inter", "text-top", "iphone-69", [
    scr(mockOnboarding("#9a3412"), "Say hello"),
    scr(mockProfile("#9a3412"), "Be yourself"),
  ]),
  mk("playful-mint", "Mint Fizz", "Playful", "#065f46", gradBg("mint", "#14b8a6"), "#064e3b", "inter", "centered", "iphone-69", [
    scr(mockChat("#065f46"), "Stay connected"),
    scr(mockFeed("#065f46"), "Fresh every day"),
  ]),
  mk("playful-sunset", "Sunset", "Playful", "#7c2d12", gradBg("sunset", "#f97316"), "#1f2937", "system", "text-bottom", "pixel-8", [
    scr(mockMusic("#7c2d12"), "Your soundtrack"),
    scr(mockMap("#7c2d12"), "Adventure awaits"),
  ]),
  mk("playful-ocean", "Ocean", "Playful", "#0c4a6e", gradBg("ocean", "#0ea5e9"), "#0c4a6e", "inter", "text-top", "android-phone", [
    scr(mockDashboard("#0c4a6e"), "Dive right in"),
    scr(mockStats("#0c4a6e"), "Track the tide"),
  ]),

  // ---------- Dark ----------
  mk("dark-ink", "Ink", "Dark", "#818cf8", solidBg("#0b1020"), "#ffffff", "inter", "text-top", "iphone-69", [
    scr(mockDashboard("#818cf8", { dark: true }), "Built for the night"),
    scr(mockStats("#818cf8", { dark: true }), "Insights at a glance"),
    scr(mockProfile("#818cf8", { dark: true }), "Owned by you"),
  ]),
  mk("dark-slate", "Slate", "Dark", "#94a3b8", gradBg("slate", "#475569"), "#ffffff", "inter", "text-bottom", "iphone-69", [
    scr(mockMusic("#94a3b8", { dark: true }), "Pure focus"),
    scr(mockFeed("#94a3b8", { dark: true }), "Less noise"),
  ]),
  mk("dark-onyx", "Onyx", "Dark", "#a78bfa", solidBg("#111827"), "#ffffff", "mono", "centered", "ipad-13", [
    scr(mockMap("#a78bfa", { dark: true }), "Navigate the dark"),
    scr(mockChat("#a78bfa", { dark: true }), "Always in sync"),
  ]),
  mk("dark-carbon", "Carbon", "Dark", "#34d399", solidBg("#18181b"), "#ffffff", "inter", "text-top", "pixel-8", [
    scr(mockStats("#34d399", { dark: true }), "Power under the hood"),
    scr(mockDashboard("#34d399", { dark: true }), "Total control"),
  ]),

  // ---------- Editorial (serif) ----------
  mk("editorial-cream", "Cream", "Editorial", "#92400e", solidBg("#faf7f0"), "#1c1917", "georgia", "text-top", "iphone-69", [
    scr(mockFeed("#92400e"), "Stories worth telling"),
    scr(mockProfile("#92400e"), "A space for ideas"),
  ]),
  mk("editorial-sage", "Sage", "Editorial", "#166534", solidBg("#e6ece4"), "#14241a", "georgia", "text-bottom", "iphone-69", [
    scr(mockOnboarding("#166534"), "Read deeply"),
    scr(mockChat("#166534"), "Conversations that count"),
  ]),
  mk("editorial-rose", "Rose Type", "Editorial", "#9f1239", solidBg("#fdf2f4"), "#4c0519", "georgia", "centered", "ipad-13", [
    scr(mockDashboard("#9f1239"), "Curated for you"),
    scr(mockFeed("#9f1239"), "The finer details"),
  ]),
  mk("editorial-noir", "Noir", "Editorial", "#e5e7eb", solidBg("#1c1917"), "#ffffff", "georgia", "text-top", "iphone-69", [
    scr(mockMusic("#e5e7eb", { dark: true }), "After hours"),
    scr(mockStats("#e5e7eb", { dark: true }), "The full picture"),
  ]),

  // ---------- Vibrant ----------
  mk("vibrant-grape", "Grape", "Vibrant", "#f5d0fe", gradBg("grape", "#7c3aed"), "#ffffff", "inter", "text-top", "iphone-69", [
    scr(mockStats("#f5d0fe", { dark: true }), "Bold by default"),
    scr(mockMusic("#f5d0fe", { dark: true }), "Turn it up"),
    scr(mockFeed("#f5d0fe", { dark: true }), "Stand out"),
  ]),
  mk("vibrant-indigo", "Electric", "Vibrant", "#c7d2fe", gradBg("indigo", "#6366f1"), "#ffffff", "inter", "centered", "iphone-69", [
    scr(mockDashboard("#c7d2fe", { dark: true }), "Energy, organized"),
    scr(mockProfile("#c7d2fe", { dark: true }), "Plug in"),
  ]),
  mk("vibrant-fuchsia", "Fuchsia", "Vibrant", "#fbcfe8", solidBg("#a21caf"), "#ffffff", "system", "text-bottom", "pixel-8", [
    scr(mockChat("#fbcfe8", { dark: true }), "Bright conversations"),
    scr(mockFeed("#fbcfe8", { dark: true }), "Pop of color"),
  ]),
  mk("vibrant-cyan", "Cyan", "Vibrant", "#a5f3fc", solidBg("#0e7490"), "#ffffff", "inter", "text-top", "android-phone", [
    scr(mockMap("#a5f3fc", { dark: true }), "Cool and clear"),
    scr(mockStats("#a5f3fc", { dark: true }), "Crisp data"),
  ]),

  // ---------- extra variety (proven WCAG-safe combos, new devices) ----------
  mk("minimal-frost", "Frost", "Minimal", "#6366f1", solidBg("#f3f4f6"), "#111827", "inter", "text-bottom", "iphone-69", [
    scr(mockOnboarding("#6366f1"), "Effortless from day one"),
    scr(mockDashboard("#6366f1"), "Clarity, by default"),
  ]),
  mk("bold-cobalt", "Cobalt", "Bold", "#a5b4fc", solidBg("#3730a3"), "#ffffff", "inter", "centered", "galaxy-s24", [
    scr(mockStats("#a5b4fc", { dark: true }), "Built to perform"),
    scr(mockFeed("#a5b4fc", { dark: true }), "Front and center"),
  ]),
  mk("dark-space", "Space", "Dark", "#818cf8", solidBg("#0b1020"), "#ffffff", "inter", "text-bottom", "iphone-69", [
    scr(mockMusic("#818cf8", { dark: true }), "Made for the dark"),
    scr(mockStats("#818cf8", { dark: true }), "Signal over noise"),
  ]),
  mk("vibrant-volt", "Volt", "Vibrant", "#c7d2fe", gradBg("indigo", "#6366f1"), "#ffffff", "inter", "text-top", "galaxy-s24", [
    scr(mockDashboard("#c7d2fe", { dark: true }), "Charged and ready"),
    scr(mockProfile("#c7d2fe", { dark: true }), "Plug in"),
  ]),
  mk("editorial-broadsheet", "Broadsheet", "Editorial", "#92400e", solidBg("#faf7f0"), "#1c1917", "georgia", "centered", "ipad-11", [
    scr(mockFeed("#92400e"), "The long read"),
    scr(mockProfile("#92400e"), "Ideas worth keeping"),
  ]),
  mk("playful-bubble", "Bubble", "Playful", "#065f46", gradBg("mint", "#14b8a6"), "#064e3b", "inter", "text-top", "iphone-69", [
    scr(mockChat("#065f46"), "Say more"),
    scr(mockOnboarding("#065f46"), "Pop in anytime"),
  ]),

  // ---------- Gradient (bold full-bleed gradients, light text) ----------
  mk("gradient-sunset", "Sunset", "Gradient", "#fed7aa", gradBg("sunset", "#f97316"), "#4a044e", "inter", "text-top", "iphone-69", [
    scr(mockOnboarding("#fed7aa"), "Rise and shine", "Everything you need to start"),
    scr(mockDashboard("#fed7aa"), "Your day, sorted"),
    scr(mockStats("#fed7aa"), "Watch it grow"),
  ]),
  mk("gradient-ocean", "Ocean", "Gradient", "#bae6fd", gradBg("ocean", "#0ea5e9"), "#0c4a6e", "inter", "text-bottom", "iphone-69", [
    scr(mockDashboard("#bae6fd"), "Clarity, on tap"),
    scr(mockMap("#bae6fd"), "Explore without limits"),
    scr(mockProfile("#bae6fd"), "Made just for you"),
  ]),
  mk("gradient-grape", "Grape", "Gradient", "#e9d5ff", gradBg("grape", "#7c3aed"), "#ffffff", "inter", "text-top", "iphone-65", [
    scr(mockMusic("#e9d5ff"), "Turn it up"),
    scr(mockFeed("#e9d5ff"), "Endless discovery"),
  ]),
  mk("gradient-forest", "Forest", "Gradient", "#bbf7d0", gradBg("forest", "#16a34a"), "#052e16", "inter", "text-top", "iphone-69", [
    scr(mockStats("#bbf7d0"), "Grow every day"),
    scr(mockDashboard("#bbf7d0"), "Rooted in results"),
  ]),
  mk("gradient-peach", "Peach", "Gradient", "#fecdd3", gradBg("peach", "#fb7185"), "#4c0519", "inter", "centered", "iphone-69", [
    scr(mockProfile("#fecdd3"), "Soft on the eyes"),
    scr(mockChat("#fecdd3"), "Keep it warm"),
  ]),
  mk("gradient-mint", "Mint", "Gradient", "#99f6e4", gradBg("mint", "#14b8a6"), "#042f2e", "inter", "text-top", "pixel-8", [
    scr(mockOnboarding("#99f6e4"), "A breath of fresh"),
    scr(mockStats("#99f6e4"), "Feel the momentum"),
  ]),

  // ---------- Pattern (CSS-pattern backdrops) ----------
  mk("pattern-dots", "Dot Grid", "Pattern", "#6366f1", patBg("dots", "#6366f1", "#0b1020", 26), "#ffffff", "inter", "text-top", "iphone-69", [
    scr(mockDashboard("#6366f1", { dark: true }), "Focus on what matters", "Clean, quiet, quick"),
    scr(mockStats("#6366f1", { dark: true }), "Numbers that add up"),
  ]),
  mk("pattern-grid", "Blueprint", "Pattern", "#38bdf8", patBg("grid", "#1e3a5f", "#0b1220", 30), "#e0f2fe", "mono", "text-top", "iphone-69", [
    scr(mockOnboarding("#38bdf8", { dark: true }), "Built for builders"),
    scr(mockDashboard("#38bdf8", { dark: true }), "Every detail, planned"),
  ]),
  mk("pattern-diagonal", "Momentum", "Pattern", "#f472b6", patBg("diagonal", "#831843", "#1a0b14", 22), "#fce7f3", "inter", "text-bottom", "iphone-65", [
    scr(mockFeed("#f472b6", { dark: true }), "Always moving forward"),
    scr(mockMusic("#f472b6", { dark: true }), "Ride the beat"),
  ]),
  mk("pattern-checker", "Arcade", "Pattern", "#a3e635", patBg("checker", "#365314", "#0a0f02", 34), "#ecfccb", "inter", "text-top", "galaxy-s24", [
    scr(mockProfile("#a3e635", { dark: true }), "Play your way"),
    scr(mockChat("#a3e635", { dark: true }), "Game on"),
  ]),
  mk("pattern-cross", "Weave", "Pattern", "#fbbf24", patBg("crosshatch", "#78350f", "#140c02", 24), "#fef3c7", "georgia", "centered", "ipad-11", [
    scr(mockFeed("#fbbf24", { dark: true }), "Threads worth following"),
    scr(mockProfile("#fbbf24", { dark: true }), "Woven together"),
  ]),
  mk("pattern-stripes", "Signal", "Pattern", "#22d3ee", patBg("stripes", "#0e7490", "#08131a", 20), "#cffafe", "inter", "text-top", "iphone-69", [
    scr(mockStats("#22d3ee", { dark: true }), "Tune in to trends"),
    scr(mockDashboard("#22d3ee", { dark: true }), "Crystal clear"),
  ]),

  // ---------- More minimal / bold / dark variety ----------
  mk("minimal-canvas", "Canvas", "Minimal", "#0f172a", solidBg("#ffffff"), "#0f172a", "georgia", "centered", "iphone-69", [
    scr(mockProfile("#0f172a"), "Less, but better"),
    scr(mockDashboard("#0f172a"), "Room to breathe"),
  ]),
  mk("minimal-fog", "Fog", "Minimal", "#475569", solidBg("#e2e8f0"), "#1e293b", "inter", "text-top", "iphone-69", [
    scr(mockOnboarding("#475569"), "Simple by design"),
    scr(mockStats("#475569"), "Quietly powerful"),
  ]),
  mk("bold-ink", "Ink", "Bold", "#f8fafc", solidBg("#0f172a"), "#f8fafc", "inter", "text-top", "iphone-69", [
    scr(mockDashboard("#f8fafc", { dark: true }), "Make a statement"),
    scr(mockStats("#f8fafc", { dark: true }), "Bold by default"),
  ]),
  mk("bold-ember", "Ember", "Bold", "#fecaca", solidBg("#7f1d1d"), "#fff1f2", "inter", "text-bottom", "iphone-69", [
    scr(mockFeed("#fecaca", { dark: true }), "Turn up the heat"),
    scr(mockProfile("#fecaca", { dark: true }), "Unmistakable"),
  ]),
  mk("dark-obsidian", "Obsidian", "Dark", "#94a3b8", solidBg("#0a0a0a"), "#e5e7eb", "mono", "text-top", "pixel-8", [
    scr(mockDashboard("#94a3b8", { dark: true }), "Engineered for speed"),
    scr(mockStats("#94a3b8", { dark: true }), "Zero to fast"),
  ]),
  mk("dark-aurora", "Aurora", "Dark", "#a5f3fc", gradBg("slate", "#1e293b"), "#ecfeff", "inter", "text-top", "iphone-69", [
    scr(mockMap("#a5f3fc", { dark: true }), "Chase the lights"),
    scr(mockMusic("#a5f3fc", { dark: true }), "After hours"),
  ]),
  mk("vibrant-citrus", "Citrus", "Vibrant", "#fef08a", gradBg("sunset", "#f59e0b"), "#422006", "inter", "text-top", "galaxy-s24", [
    scr(mockOnboarding("#fef08a"), "Fresh squeezed"),
    scr(mockChat("#fef08a"), "Zesty and fast"),
  ]),
  mk("playful-candy", "Candy", "Playful", "#f5d0fe", gradBg("grape", "#c026d3"), "#ffffff", "inter", "centered", "iphone-69", [
    scr(mockProfile("#f5d0fe"), "Sweet and simple"),
    scr(mockFeed("#f5d0fe"), "Treat yourself"),
  ]),
  mk("editorial-mono", "Manuscript", "Editorial", "#57534e", solidBg("#f5f5f4"), "#1c1917", "georgia", "text-bottom", "ipad-13", [
    scr(mockFeed("#57534e"), "Stories that stay"),
    scr(mockProfile("#57534e"), "Written for you"),
  ]),
];
