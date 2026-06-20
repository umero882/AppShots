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
  "Minimal", "Bold", "Playful", "Dark", "Editorial", "Vibrant",
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

function scaleFor(layoutId) {
  const l = LAYOUTS.find((x) => x.id === layoutId) || LAYOUTS[0];
  return l.deviceScale;
}

const gradBg = (gradient, solidFallback) => ({ type: "gradient", gradient, solid: solidFallback });
const solidBg = (solid) => ({ type: "solid", gradient: "indigo", solid });

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
];
