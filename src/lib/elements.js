/**
 * Canvas "elements" — draggable / resizable / rotatable overlays placed on top of
 * a screen (badges, ratings, shapes, arrows, emoji, icons, and search-backed
 * photos/illustrations).
 *
 * An element's position/size is stored as FRACTIONS of the canvas so it scales
 * with the on-screen preview AND the full-resolution export (it's all DOM):
 *   x, y      center, 0..1
 *   scale     relative size multiplier (1 = the kind's base size)
 *   rotation  degrees
 *
 * Kinds:
 *   badge  — styled HTML pill/rating with text (rendered as DOM, exports crisp)
 *   shape  — vector blob/orb/etc as an inline SVG data-URI <img>
 *   arrow  — vector arrow/callout pointer as an SVG data-URI <img>
 *   emoji  — a native emoji glyph
 *   icon   — a lucide icon (by name)
 *   image  — a photo/illustration (data-URL or remote URL)
 */

/* ----------------------------- geometry (pure) ----------------------------- */

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/** Pixel delta → fraction-of-canvas delta. */
export function fracDelta(dxPx, dyPx, rectW, rectH) {
  return { dx: rectW ? dxPx / rectW : 0, dy: rectH ? dyPx / rectH : 0 };
}

/** Angle (deg) from a center point to a pointer, 0 = +x axis. */
export function angleFromCenter(cx, cy, px, py) {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/** New scale from a resize drag: base * (currentDist / startDist), clamped. */
export function scaleFromResize(baseScale, startDist, currentDist) {
  if (!startDist) return baseScale;
  const next = (baseScale * currentDist) / startDist;
  return Math.max(0.15, Math.min(6, next));
}

/**
 * Snap a dragged position to the canvas center when it's within `threshold`.
 * @returns { x, y, snapX, snapY } — snapX/snapY drive the alignment guides.
 */
export function snapToCenter(x, y, threshold = 0.02) {
  const snapX = Math.abs(x - 0.5) <= threshold;
  const snapY = Math.abs(y - 0.5) <= threshold;
  return { x: snapX ? 0.5 : x, y: snapY ? 0.5 : y, snapX, snapY };
}

/**
 * Snap a dragged position to the nearest target on each axis (canvas center +
 * other elements' centers). Returns the snapped pos and the fraction position of
 * each active guide line (or null).
 * @param {Array<{x:number,y:number}>} targets
 * @returns { x, y, guideX, guideY }
 */
export function snapToGuides(x, y, targets = [], threshold = 0.02) {
  let sx = x;
  let sy = y;
  let guideX = null;
  let guideY = null;
  for (const t of targets) {
    if (guideX === null && Math.abs(x - t.x) <= threshold) {
      sx = t.x;
      guideX = t.x;
    }
    if (guideY === null && Math.abs(y - t.y) <= threshold) {
      sy = t.y;
      guideY = t.y;
    }
  }
  return { x: sx, y: sy, guideX, guideY };
}

/* ----------------------------- SVG helpers ----------------------------- */

const svgUri = (svg) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${svg}</svg>`
  );

function shapeSvg(variant, color) {
  switch (variant) {
    case "circle":
      return svgUri(`<circle cx='50' cy='50' r='46' fill='${color}'/>`);
    case "ring":
      return svgUri(`<circle cx='50' cy='50' r='42' fill='none' stroke='${color}' stroke-width='8'/>`);
    case "square":
      return svgUri(`<rect x='6' y='6' width='88' height='88' rx='18' fill='${color}'/>`);
    case "triangle":
      return svgUri(`<path d='M50 8 L92 88 L8 88 Z' fill='${color}'/>`);
    case "orb":
      return svgUri(
        `<defs><radialGradient id='g' cx='38%' cy='32%' r='70%'>` +
          `<stop offset='0%' stop-color='#ffffff' stop-opacity='0.85'/>` +
          `<stop offset='45%' stop-color='${color}'/>` +
          `<stop offset='100%' stop-color='${color}' stop-opacity='0.9'/>` +
          `</radialGradient></defs><circle cx='50' cy='50' r='46' fill='url(#g)'/>`
      );
    case "blob":
    default:
      return svgUri(
        `<path fill='${color}' d='M58 8c14 4 30 14 33 30c3 16-8 28-18 38c-11 11-24 20-39 16C19 88 6 72 5 56C4 38 13 22 28 13C38 7 47 5 58 8Z'/>`
      );
  }
}

function arrowSvg(variant, color) {
  switch (variant) {
    case "arrow-curve":
      return svgUri(
        `<path d='M12 20 C45 10 70 30 78 60' fill='none' stroke='${color}' stroke-width='7' stroke-linecap='round'/>` +
          `<path d='M64 56 L82 64 L74 46 Z' fill='${color}'/>`
      );
    case "underline":
      return svgUri(
        `<path d='M8 60 C30 78 70 78 92 56' fill='none' stroke='${color}' stroke-width='7' stroke-linecap='round'/>`
      );
    case "pointer":
      return svgUri(
        `<path d='M20 20 L74 50 L48 56 L58 84 L44 88 L34 60 L16 70 Z' fill='${color}'/>`
      );
    case "arrow":
    default:
      return svgUri(
        `<path d='M10 50 H78' stroke='${color}' stroke-width='8' stroke-linecap='round'/>` +
          `<path d='M64 30 L90 50 L64 70 Z' fill='${color}'/>`
      );
  }
}

/* ----------------------------- built-in libraries ----------------------------- */

// Each library item is a template; makeElement() turns it into a placed element.
export const BADGES = [
  { id: "rating", label: "★ Rating", kind: "badge", badge: "rating", text: "4.9", stars: 5, color: "#f59e0b", bg: "#111827", fg: "#ffffff" },
  { id: "editors-choice", label: "Editor's Choice", kind: "badge", badge: "pill", text: "Editor's Choice", emoji: "🏆", bg: "#111827", fg: "#ffffff" },
  { id: "number-one", label: "#1 in Category", kind: "badge", badge: "pill", text: "#1 in Productivity", bg: "#4f46e5", fg: "#ffffff" },
  { id: "featured", label: "Featured", kind: "badge", badge: "pill", text: "Featured", emoji: "✨", bg: "#0ea5e9", fg: "#ffffff" },
  { id: "new", label: "New", kind: "badge", badge: "pill", text: "NEW", bg: "#10b981", fg: "#ffffff" },
  { id: "as-seen", label: "As seen in", kind: "badge", badge: "pill", text: "As seen in", bg: "#ffffff", fg: "#111827" },
];

export const SHAPES = [
  { id: "blob", label: "Blob", kind: "shape", variant: "blob", color: "#6366f1" },
  { id: "orb", label: "Orb", kind: "shape", variant: "orb", color: "#8b5cf6" },
  { id: "circle", label: "Circle", kind: "shape", variant: "circle", color: "#0ea5e9" },
  { id: "ring", label: "Ring", kind: "shape", variant: "ring", color: "#f59e0b" },
  { id: "square", label: "Square", kind: "shape", variant: "square", color: "#10b981" },
  { id: "triangle", label: "Triangle", kind: "shape", variant: "triangle", color: "#ec4899" },
];

export const ARROWS = [
  { id: "arrow", label: "Arrow", kind: "arrow", variant: "arrow", color: "#111827" },
  { id: "arrow-curve", label: "Curve", kind: "arrow", variant: "arrow-curve", color: "#111827" },
  { id: "pointer", label: "Pointer", kind: "arrow", variant: "pointer", color: "#111827" },
  { id: "underline", label: "Underline", kind: "arrow", variant: "underline", color: "#f59e0b" },
  { id: "callout", label: "Callout", kind: "badge", badge: "callout", text: "Tap here!", bg: "#111827", fg: "#ffffff" },
];

export const EMOJI = [
  { e: "🚀", k: "rocket launch fast" }, { e: "🎉", k: "party celebrate" },
  { e: "✨", k: "sparkle shine magic" }, { e: "🔥", k: "fire hot trending" },
  { e: "❤️", k: "heart love" }, { e: "👍", k: "thumbs up like" },
  { e: "⭐", k: "star rating" }, { e: "💡", k: "idea bulb" },
  { e: "🏆", k: "trophy award win" }, { e: "🎯", k: "target goal" },
  { e: "💎", k: "diamond premium" }, { e: "⚡", k: "bolt fast power" },
  { e: "📈", k: "chart growth up" }, { e: "🔒", k: "lock secure privacy" },
  { e: "🎁", k: "gift present" }, { e: "💰", k: "money cash finance" },
  { e: "🍔", k: "food burger" }, { e: "☕", k: "coffee drink" },
  { e: "🏃", k: "run fitness sport" }, { e: "🧘", k: "yoga calm health" },
  { e: "✈️", k: "plane travel" }, { e: "🎵", k: "music note" },
  { e: "🛒", k: "cart shopping" }, { e: "📱", k: "phone mobile" },
  { e: "💬", k: "chat message social" }, { e: "📷", k: "camera photo" },
  { e: "🎮", k: "game controller" }, { e: "🚗", k: "car vehicle" },
  { e: "👨‍👩‍👧", k: "family parents kids" }, { e: "🎓", k: "education graduate school" },
  { e: "👋", k: "wave hand hello" }, { e: "🙌", k: "hands celebrate" },
  { e: "💪", k: "muscle strong fitness" }, { e: "😍", k: "love eyes happy" },
  { e: "🤩", k: "star struck wow" }, { e: "👀", k: "eyes look" },
  { e: "✅", k: "check done complete" }, { e: "🌟", k: "glowing star" },
  { e: "💯", k: "hundred perfect" }, { e: "🥇", k: "gold medal first" },
];

// lucide icon names (resolved to components via lib/elementIcons.jsx, which
// imports only this curated set so the bundle stays tree-shaken).
export const ICONS = [
  "Star", "Heart", "Check", "CheckCircle", "Zap", "Bell", "Award", "Trophy",
  "Shield", "Lock", "Sparkles", "Flame", "ThumbsUp", "Rocket", "TrendingUp",
  "Gift", "Crown", "Target", "Smartphone", "Camera", "Music", "ShoppingCart",
  "CreditCard", "Plane", "Car", "Dumbbell", "Users", "MessageCircle",
  "Play", "Download", "Search", "Settings", "Bookmark", "Tag", "Gem",
];

/* ------------------------- search-backed categories ------------------------- */
// Photos/illustrations sourced live from the proxy image search (Pexels/Openverse).
// `q` is the default query; the user can also type their own term.
export const PHOTO_CATEGORIES = [
  { id: "girls", label: "Girls", q: "woman portrait" },
  { id: "boys", label: "Boys", q: "man portrait" },
  { id: "couples", label: "Couples", q: "couple" },
  { id: "group", label: "Group", q: "group of friends" },
  { id: "family", label: "Family", q: "family" },
  { id: "hands", label: "Human hands", q: "hand holding phone" },
  { id: "marketing", label: "Marketing", q: "business person presenting" },
  { id: "devices", label: "Device variations", q: "smartphone mockup" },
  { id: "bags", label: "Bags", q: "bag" },
  { id: "illustrations", label: "Illustrations", q: "flat illustration" },
  { id: "education", label: "Education", q: "education learning" },
  { id: "entertainment", label: "Entertainment", q: "entertainment" },
  { id: "food", label: "Food & Drink", q: "food drink" },
  { id: "health", label: "Health & Fitness", q: "fitness workout" },
  { id: "productivity", label: "Productivity", q: "workspace laptop" },
  { id: "sports", label: "Sports", q: "sports" },
  { id: "travel", label: "Travel", q: "travel landscape" },
  { id: "finance", label: "Finance", q: "finance money" },
  { id: "games", label: "Games", q: "video game" },
  { id: "music", label: "Music", q: "music headphones" },
  { id: "shopping", label: "Shopping", q: "shopping" },
  { id: "social", label: "Social network", q: "people social media" },
  { id: "vehicles", label: "Vehicles", q: "car vehicle" },
  { id: "photo-video", label: "Photo & Video", q: "camera video" },
];

/* ----------------------------- factory ----------------------------- */

function freshId() {
  return "el_" + Math.random().toString(36).slice(2, 9);
}

// Base width of an element as a fraction of the canvas width, per kind.
const BASE_WIDTH = {
  badge: 0.42,
  shape: 0.3,
  arrow: 0.28,
  emoji: 0.18,
  icon: 0.16,
  image: 0.4,
};

/** Build a placed element from a library item (or an image result). */
export function makeElement(item, { x = 0.5, y = 0.4 } = {}) {
  return {
    id: freshId(),
    kind: item.kind,
    x,
    y,
    scale: 1,
    rotation: 0,
    opacity: 1,
    baseWidth: BASE_WIDTH[item.kind] || 0.3,
    // kind-specific props (only the relevant ones are used by the renderer)
    badge: item.badge,
    variant: item.variant,
    text: item.text,
    stars: item.stars,
    emoji: item.emoji,
    icon: item.icon,
    color: item.color,
    bg: item.bg,
    fg: item.fg,
    image: item.image,
  };
}

export function makeEmojiElement(emoji, opts) {
  return makeElement({ kind: "emoji", emoji }, opts);
}

export function makeIconElement(icon, opts) {
  return makeElement({ kind: "icon", icon, color: "#111827" }, opts);
}

export function makeImageElement(image, opts) {
  return makeElement({ kind: "image", image }, opts);
}

/** Copy an element with a fresh id, nudged slightly so it's visible on top. */
export function duplicateElement(el, offset = 0.04) {
  return { ...el, id: freshId(), x: clamp01((el.x ?? 0.5) + offset), y: clamp01((el.y ?? 0.4) + offset) };
}

/* ----------------------------- twemoji ----------------------------- */
// Optional cross-platform emoji via the Twemoji CDN (jdecked fork). Off by
// default; the project sets `twemoji: true` to opt in.

/** Codepoint sequence for a Twemoji filename (matches twemoji's FE0F/ZWJ rule). */
export function twemojiCodepoints(str) {
  const hasZwj = str.includes("‍"); // zero-width joiner
  const src = hasZwj ? str : str.replace(/️/g, ""); // variation selector
  const cps = [];
  for (const ch of src) cps.push(ch.codePointAt(0).toString(16));
  return cps.join("-");
}

export function twemojiUrl(emoji) {
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${twemojiCodepoints(emoji)}.svg`;
}

/** Return the SVG data-URI for shape/arrow elements (used by the renderer). */
export function elementSvg(el) {
  if (el.kind === "shape") return shapeSvg(el.variant, el.color);
  if (el.kind === "arrow") return arrowSvg(el.variant, el.color);
  return null;
}

/* ----------------------------- z-order ----------------------------- */
// Elements stack by array order (later = on top, via DOM order). Reordering the
// array is what changes layering.

/** Returns a NEW array with `id` moved per op: "front" | "back" | "forward" | "backward". */
export function reorderElements(list, id, op) {
  const arr = [...(list || [])];
  const i = arr.findIndex((e) => e.id === id);
  if (i === -1) return arr;
  const [el] = arr.splice(i, 1);
  if (op === "front") arr.push(el);
  else if (op === "back") arr.unshift(el);
  else if (op === "forward") arr.splice(Math.min(arr.length, i + 1), 0, el);
  else if (op === "backward") arr.splice(Math.max(0, i - 1), 0, el);
  else arr.splice(i, 0, el); // unknown op → no change
  return arr;
}
