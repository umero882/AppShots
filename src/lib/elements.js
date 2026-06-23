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

// A shared color palette used to generate many colored variants of each shape/arrow.
export const PALETTE = [
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#ef4444",
  "#f59e0b", "#eab308", "#84cc16", "#10b981", "#14b8a6", "#06b6d4",
  "#0ea5e9", "#3b82f6", "#111827", "#64748b", "#ffffff",
];

function polyPoints(sides, r = 46, cx = 50, cy = 50, rot = -90) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rot + (i * 360) / sides) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function starPoints(points, outer = 48, inner = 20, cx = 50, cy = 50, rot = -90) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function shapeSvg(variant, color) {
  const f = `fill='${color}'`;
  switch (variant) {
    case "circle": return svgUri(`<circle cx='50' cy='50' r='46' ${f}/>`);
    case "ring": return svgUri(`<circle cx='50' cy='50' r='42' fill='none' stroke='${color}' stroke-width='8'/>`);
    case "square": return svgUri(`<rect x='6' y='6' width='88' height='88' ${f}/>`);
    case "rounded": return svgUri(`<rect x='6' y='6' width='88' height='88' rx='18' ${f}/>`);
    case "triangle": return svgUri(`<polygon points='${polyPoints(3)}' ${f}/>`);
    case "diamond": return svgUri(`<polygon points='${polyPoints(4)}' ${f}/>`);
    case "pentagon": return svgUri(`<polygon points='${polyPoints(5)}' ${f}/>`);
    case "hexagon": return svgUri(`<polygon points='${polyPoints(6, 46, 50, 50, 0)}' ${f}/>`);
    case "heptagon": return svgUri(`<polygon points='${polyPoints(7)}' ${f}/>`);
    case "octagon": return svgUri(`<polygon points='${polyPoints(8, 46, 50, 50, 22.5)}' ${f}/>`);
    case "star5": return svgUri(`<polygon points='${starPoints(5)}' ${f}/>`);
    case "star6": return svgUri(`<polygon points='${starPoints(6)}' ${f}/>`);
    case "star4": return svgUri(`<polygon points='${starPoints(4, 48, 16)}' ${f}/>`);
    case "burst": return svgUri(`<polygon points='${starPoints(12, 48, 38)}' ${f}/>`);
    case "heart": return svgUri(`<path d='M50 86 C20 64 8 44 8 30 C8 16 20 8 32 12 C40 15 47 22 50 30 C53 22 60 15 68 12 C80 8 92 16 92 30 C92 44 80 64 50 86 Z' ${f}/>`);
    case "cross": return svgUri(`<path d='M38 8 H62 V38 H92 V62 H62 V92 H38 V62 H8 V38 H38 Z' ${f}/>`);
    case "crescent": return svgUri(`<path d='M50 6 a44 44 0 1 0 0 88 a34 34 0 1 1 0 -88 Z' ${f}/>`);
    case "oval": return svgUri(`<ellipse cx='50' cy='50' rx='46' ry='32' ${f}/>`);
    case "bubble": return svgUri(`<path d='M12 14 H88 a8 8 0 0 1 8 8 V60 a8 8 0 0 1 -8 8 H42 L24 88 V76 H12 a8 8 0 0 1 -8 -8 V22 a8 8 0 0 1 8 -8 Z' ${f}/>`);
    case "blob2": return svgUri(`<path ${f} d='M50 6 C74 6 94 24 94 48 C94 72 76 94 50 94 C26 94 8 76 8 50 C8 26 26 6 50 6 Z'/>`);
    case "orb": return svgUri(
      `<defs><radialGradient id='g' cx='38%' cy='32%' r='70%'>` +
        `<stop offset='0%' stop-color='#ffffff' stop-opacity='0.85'/>` +
        `<stop offset='45%' stop-color='${color}'/>` +
        `<stop offset='100%' stop-color='${color}'/></radialGradient></defs>` +
        `<circle cx='50' cy='50' r='46' fill='url(#g)'/>`
    );
    case "blob":
    default:
      return svgUri(`<path ${f} d='M58 8c14 4 30 14 33 30c3 16-8 28-18 38c-11 11-24 20-39 16C19 88 6 72 5 56C4 38 13 22 28 13C38 7 47 5 58 8Z'/>`);
  }
}

function arrowSvg(variant, color) {
  const st = `stroke='${color}' stroke-width='8' fill='none' stroke-linecap='round' stroke-linejoin='round'`;
  const head = (d) => `<path d='${d}' fill='${color}'/>`;
  switch (variant) {
    case "arrow-up": return svgUri(`<path d='M50 92 V30' ${st}/>${head("M32 42 L50 12 L68 42 Z")}`);
    case "arrow-down": return svgUri(`<path d='M50 8 V70' ${st}/>${head("M32 58 L50 88 L68 58 Z")}`);
    case "arrow-left": return svgUri(`<path d='M92 50 H30' ${st}/>${head("M42 32 L12 50 L42 68 Z")}`);
    case "arrow-curve": return svgUri(`<path d='M12 20 C45 10 70 30 78 60' ${st}/>${head("M64 56 L82 64 L74 46 Z")}`);
    case "pointer": return svgUri(head("M20 20 L74 50 L48 56 L58 84 L44 88 L34 60 L16 70 Z"));
    case "underline": return svgUri(`<path d='M8 60 C30 78 70 78 92 56' ${st}/>`);
    case "wavy": return svgUri(`<path d='M8 50 Q22 30 36 50 T64 50 T92 50' ${st}/>${head("M80 40 L96 50 L80 60 Z")}`);
    case "zigzag": return svgUri(`<path d='M8 62 L28 40 L48 62 L68 40 L88 62' ${st}/>`);
    case "bent": return svgUri(`<path d='M14 16 V58 a10 10 0 0 0 10 10 H72' ${st}/>${head("M60 56 L86 68 L60 80 Z")}`);
    case "loop": return svgUri(`<path d='M22 74 C8 42 42 18 62 36 C78 50 64 72 48 64' ${st}/>${head("M40 54 L48 70 L58 60 Z")}`);
    case "double": return svgUri(`<path d='M22 50 H78' ${st}/>${head("M64 32 L92 50 L64 68 Z")}${head("M36 32 L8 50 L36 68 Z")}`);
    case "arrow":
    default:
      return svgUri(`<path d='M10 50 H78' ${st}/>${head("M64 30 L90 50 L64 70 Z")}`);
  }
}

/* ----------------------------- built-in libraries ----------------------------- */

// Shapes & arrows: each base variant × the palette → ~100+ colored elements.
const SHAPE_BASES = [
  "circle", "ring", "square", "rounded", "triangle", "diamond", "pentagon",
  "hexagon", "heptagon", "octagon", "star5", "star6", "star4", "burst", "heart",
  "cross", "crescent", "oval", "bubble", "blob", "blob2", "orb",
];
export const SHAPES = SHAPE_BASES.flatMap((v) =>
  PALETTE.slice(0, 6).map((c) => ({ id: `${v}-${c}`, label: v, kind: "shape", variant: v, color: c }))
);

const ARROW_BASES = [
  "arrow", "arrow-up", "arrow-down", "arrow-left", "arrow-curve", "pointer",
  "underline", "wavy", "zigzag", "bent", "loop", "double",
];
export const ARROWS = [
  ...ARROW_BASES.flatMap((v) =>
    PALETTE.slice(0, 8).map((c) => ({ id: `${v}-${c}`, label: v, kind: "arrow", variant: v, color: c }))
  ),
  { id: "callout", label: "Callout", kind: "badge", badge: "callout", text: "Tap here!", bg: "#111827", fg: "#ffffff" },
];

// Badges: star ratings + a big set of pill texts × color schemes.
const BADGE_TEXTS = [
  "New", "Featured", "Popular", "Trending", "Best Seller", "#1 App", "Top Rated",
  "Editor's Choice", "Pro", "Premium", "Free", "Sale", "50% Off", "Limited Time",
  "Hot", "Award Winning", "As Seen In", "Exclusive", "Just Updated", "Beta",
  "Verified", "Recommended", "Must Have", "Staff Pick", "Coming Soon",
];
const BADGE_SCHEMES = [
  { bg: "#111827", fg: "#ffffff" },
  { bg: "#4f46e5", fg: "#ffffff" },
  { bg: "#10b981", fg: "#ffffff" },
  { bg: "#f59e0b", fg: "#111827" },
  { bg: "#ef4444", fg: "#ffffff" },
  { bg: "#ffffff", fg: "#111827" },
];
export const BADGES = [
  ...[5, 4].flatMap((stars) =>
    ["4.9", "4.8", "5.0"].map((text) => ({
      id: `rating-${stars}-${text}`, label: "★ Rating", kind: "badge", badge: "rating",
      text, stars, color: "#f59e0b", bg: "#111827", fg: "#ffffff",
    }))
  ),
  ...BADGE_TEXTS.flatMap((text) =>
    BADGE_SCHEMES.map((s, i) => ({
      id: `pill-${text}-${i}`, label: text, kind: "badge", badge: "pill", text, bg: s.bg, fg: s.fg,
    }))
  ),
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
  { e: "😀", k: "grin happy smile" }, { e: "😁", k: "beaming smile" },
  { e: "😂", k: "laugh tears joy" }, { e: "🤣", k: "rofl laugh" },
  { e: "😊", k: "smile blush" }, { e: "😎", k: "cool sunglasses" },
  { e: "🥳", k: "party face celebrate" }, { e: "😇", k: "angel innocent" },
  { e: "🤔", k: "thinking hmm" }, { e: "😴", k: "sleep tired" },
  { e: "😅", k: "sweat smile nervous" }, { e: "🥰", k: "love hearts" },
  { e: "😉", k: "wink" }, { e: "🤗", k: "hug" },
  { e: "🙏", k: "pray thanks please" }, { e: "👏", k: "clap applause" },
  { e: "🤝", k: "handshake deal" }, { e: "✌️", k: "peace victory" },
  { e: "👌", k: "ok perfect" }, { e: "🤘", k: "rock on" },
  { e: "🫶", k: "heart hands love" }, { e: "👇", k: "point down" },
  { e: "👉", k: "point right" }, { e: "👆", k: "point up" },
  { e: "🤳", k: "selfie" }, { e: "🧠", k: "brain smart ai" },
  { e: "👑", k: "crown king premium" }, { e: "💖", k: "sparkling heart" },
  { e: "💕", k: "two hearts love" }, { e: "💝", k: "heart gift" },
  { e: "💔", k: "broken heart" }, { e: "🩷", k: "pink heart" },
  { e: "🧡", k: "orange heart" }, { e: "💛", k: "yellow heart" },
  { e: "💚", k: "green heart" }, { e: "💙", k: "blue heart" },
  { e: "💜", k: "purple heart" }, { e: "🖤", k: "black heart" },
  { e: "🤍", k: "white heart" }, { e: "🌈", k: "rainbow" },
  { e: "☀️", k: "sun sunny weather" }, { e: "🌙", k: "moon night" },
  { e: "⛅", k: "cloud weather" }, { e: "❄️", k: "snow cold" },
  { e: "🌸", k: "flower blossom spring" }, { e: "🌿", k: "leaf plant nature" },
  { e: "🍀", k: "clover luck" }, { e: "🌹", k: "rose flower" },
  { e: "🎨", k: "art paint design" }, { e: "📸", k: "camera photo flash" },
  { e: "🎬", k: "movie film clapper" }, { e: "🎧", k: "headphones music" },
  { e: "🎤", k: "mic sing podcast" }, { e: "📚", k: "books read learn" },
  { e: "✏️", k: "pencil write edit" }, { e: "📝", k: "memo note" },
  { e: "📊", k: "bar chart data" }, { e: "📉", k: "chart down" },
  { e: "💸", k: "money fly spend" }, { e: "💳", k: "card pay" },
  { e: "🏦", k: "bank finance" }, { e: "🪙", k: "coin crypto" },
  { e: "🛍️", k: "shopping bags" }, { e: "🎀", k: "ribbon bow" },
  { e: "🔔", k: "bell notify" }, { e: "📌", k: "pin location" },
  { e: "📍", k: "pin map" }, { e: "🗺️", k: "map travel" },
  { e: "🌍", k: "earth globe world" }, { e: "🏠", k: "home house" },
  { e: "🏥", k: "hospital health" }, { e: "🍕", k: "pizza food" },
  { e: "🍎", k: "apple fruit health" }, { e: "🥗", k: "salad healthy food" },
  { e: "🍰", k: "cake dessert" }, { e: "🍩", k: "donut" },
  { e: "🥤", k: "drink soda" }, { e: "🚴", k: "cycling bike sport" },
  { e: "⚽", k: "soccer football sport" }, { e: "🏀", k: "basketball sport" },
  { e: "🎾", k: "tennis sport" }, { e: "🏈", k: "football sport" },
  { e: "🎲", k: "dice game" }, { e: "🕹️", k: "joystick game" },
  { e: "🐶", k: "dog pet animal" }, { e: "🐱", k: "cat pet animal" },
  { e: "🦄", k: "unicorn magic" }, { e: "🐾", k: "paw pet" },
  { e: "🌊", k: "wave ocean" }, { e: "⛰️", k: "mountain" },
  { e: "🔑", k: "key access" }, { e: "🛡️", k: "shield secure" },
  { e: "⏰", k: "alarm clock time" }, { e: "📅", k: "calendar date" },
  { e: "🔋", k: "battery power" }, { e: "📶", k: "signal wifi" },
];

// lucide icon names (resolved to components via lib/elementIcons.jsx, which
// imports only this curated set so the bundle stays tree-shaken).
export const ICONS = [
  "Star", "Heart", "Check", "CheckCircle", "CheckCircle2", "Zap", "Bell", "BellRing",
  "Award", "Trophy", "Shield", "ShieldCheck", "Lock", "Unlock", "Key", "Sparkles",
  "Flame", "ThumbsUp", "ThumbsDown", "Rocket", "TrendingUp", "TrendingDown", "Gift",
  "Crown", "Target", "Smartphone", "Tablet", "Laptop", "Monitor", "Camera", "Music",
  "Music2", "Headphones", "Mic", "Video", "Image", "Film", "Tv", "Radio", "Speaker",
  "Volume2", "ShoppingCart", "ShoppingBag", "CreditCard", "Wallet", "DollarSign",
  "Percent", "Plane", "Car", "Bike", "Truck", "Bus", "Dumbbell", "Activity", "Users",
  "User", "UserPlus", "MessageCircle", "MessageSquare", "Mail", "Phone", "Send",
  "Share2", "Link", "Play", "Pause", "Download", "Upload", "Search", "Settings",
  "Sliders", "Filter", "Bookmark", "Tag", "Tags", "Gem", "Home", "Building2", "Store",
  "Briefcase", "Package", "Box", "Calendar", "Clock", "MapPin", "Map", "Globe", "Compass",
  "Navigation", "Flag", "Wifi", "Battery", "Cloud", "Sun", "Moon", "Umbrella", "Snowflake",
  "Coffee", "Pizza", "Eye", "EyeOff", "Lightbulb", "Megaphone", "Bookmark", "Palette",
  "Brush", "Droplet", "Feather", "Leaf", "Flower2", "Trees", "Mountain", "Waves", "Anchor",
  "Code", "Terminal", "Cpu", "Database", "Server", "Github", "Smile", "Laugh", "Hand",
  "Plus", "Minus", "X", "ArrowRight", "ArrowUp", "RefreshCw", "Power", "Layers", "Grid3x3",
  "BarChart3", "PieChart", "LineChart",
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

/**
 * A free-positioned text block — a first-class element so it can be dragged,
 * resized, rotated and layered like any other. `size` is a fraction of the
 * canvas width; the renderer multiplies by the element scale.
 */
export function makeTextElement(opts = {}) {
  const {
    x = 0.5, y = 0.4, text = "Add your text", font = "inter",
    size = 0.06, color = "#ffffff", weight = 700, align = "center", effect = "none",
  } = opts;
  return {
    id: freshId(),
    kind: "text",
    x, y, scale: 1, rotation: 0, opacity: 1,
    baseWidth: 0.6,
    text, font, size, color, weight, align, effect,
  };
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
