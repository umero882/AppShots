/**
 * Preset "image" backgrounds for the editor's Explore gallery. All are generated
 * inline SVG data-URIs (mesh gradients + patterns) so they work offline and
 * export cleanly — no binary assets, no external/CORS dependencies.
 */
const W = 480;
const H = 960;

const uri = (svg) => "data:image/svg+xml," + encodeURIComponent(svg);
const wrap = (inner) =>
  uri(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMidYMid slice'>${inner}</svg>`
  );

// Soft multi-blob "mesh gradient" over a base color.
function mesh(base, blobs) {
  const defs = blobs
    .map(
      (b, i) =>
        `<radialGradient id='m${i}' cx='${b.x}%' cy='${b.y}%' r='${b.r}%'>` +
        `<stop offset='0%' stop-color='${b.c}'/>` +
        `<stop offset='100%' stop-color='${b.c}' stop-opacity='0'/></radialGradient>`
    )
    .join("");
  const fills = blobs
    .map((_, i) => `<rect width='${W}' height='${H}' fill='url(#m${i})'/>`)
    .join("");
  return wrap(`<defs>${defs}</defs><rect width='${W}' height='${H}' fill='${base}'/>${fills}`);
}

function dots(base, dot) {
  return wrap(
    `<rect width='${W}' height='${H}' fill='${base}'/>` +
      `<defs><pattern id='p' width='40' height='40' patternUnits='userSpaceOnUse'>` +
      `<circle cx='8' cy='8' r='3' fill='${dot}'/></pattern></defs>` +
      `<rect width='${W}' height='${H}' fill='url(#p)'/>`
  );
}

function grid(base, line) {
  return wrap(
    `<rect width='${W}' height='${H}' fill='${base}'/>` +
      `<defs><pattern id='p' width='48' height='48' patternUnits='userSpaceOnUse'>` +
      `<path d='M48 0H0V48' fill='none' stroke='${line}' stroke-width='1.5'/></pattern></defs>` +
      `<rect width='${W}' height='${H}' fill='url(#p)'/>`
  );
}

function twill(c1, c2) {
  return wrap(
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
      `<stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient>` +
      `<pattern id='s' width='28' height='28' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>` +
      `<rect width='14' height='28' fill='rgba(255,255,255,0.06)'/></pattern></defs>` +
      `<rect width='${W}' height='${H}' fill='url(#g)'/>` +
      `<rect width='${W}' height='${H}' fill='url(#s)'/>`
  );
}

// Royalty-free photos (Flickr Creative Commons via LoremFlickr), 16 per
// category, served from public/backgrounds/{key}-{n}.jpg.
const PHOTO_CATS = [
  ["Nature", "nature"], ["Beach", "beach"], ["City", "city"],
  ["Abstract", "abstract"], ["Minimal", "minimal"], ["Tech", "tech"], ["Food", "food"],
];
const PER_CAT = 16;
const PHOTOS = PHOTO_CATS.flatMap(([category, key]) =>
  Array.from({ length: PER_CAT }, (_, i) => ({
    id: `photo-${key}-${i + 1}`,
    name: `${category} ${i + 1}`,
    category,
    image: `/backgrounds/${key}-${i + 1}.jpg`,
  }))
);

export const BG_CATEGORIES = [
  "Gradient", "Pattern", "Nature", "Beach", "City", "Abstract", "Minimal", "Tech", "Food",
];

export const BG_PRESETS = [
  // --- Generated gradients ---
  { id: "mesh-aurora", name: "Aurora", category: "Gradient", image: mesh("#0b1020", [{ x: 18, y: 14, r: 60, c: "#6366f1" }, { x: 86, y: 24, r: 55, c: "#db2777" }, { x: 58, y: 92, r: 70, c: "#0ea5e9" }]) },
  { id: "mesh-sunset", name: "Sunset", category: "Gradient", image: mesh("#1a1025", [{ x: 14, y: 82, r: 65, c: "#f97316" }, { x: 82, y: 70, r: 60, c: "#ec4899" }, { x: 50, y: 8, r: 55, c: "#8b5cf6" }]) },
  { id: "mesh-ocean", name: "Ocean", category: "Gradient", image: mesh("#06182a", [{ x: 24, y: 18, r: 60, c: "#22d3ee" }, { x: 82, y: 58, r: 65, c: "#0ea5e9" }, { x: 40, y: 95, r: 60, c: "#10b981" }]) },
  { id: "mesh-grape", name: "Grape", category: "Gradient", image: mesh("#140a24", [{ x: 30, y: 24, r: 60, c: "#7c3aed" }, { x: 82, y: 30, r: 55, c: "#db2777" }, { x: 54, y: 88, r: 65, c: "#6366f1" }]) },
  { id: "mesh-citrus", name: "Citrus", category: "Gradient", image: mesh("#1c1403", [{ x: 22, y: 20, r: 62, c: "#f59e0b" }, { x: 80, y: 40, r: 58, c: "#84cc16" }, { x: 50, y: 92, r: 60, c: "#10b981" }]) },
  { id: "spot-indigo", name: "Spotlight", category: "Gradient", image: mesh("#0b1020", [{ x: 50, y: 16, r: 78, c: "#6366f1" }]) },
  { id: "spot-emerald", name: "Emerald Glow", category: "Gradient", image: mesh("#04140e", [{ x: 50, y: 20, r: 78, c: "#10b981" }]) },
  { id: "spot-rose", name: "Rose Glow", category: "Gradient", image: mesh("#1a0712", [{ x: 50, y: 20, r: 78, c: "#fb7185" }]) },
  // --- Generated patterns ---
  { id: "dots-indigo", name: "Indigo Dots", category: "Pattern", image: dots("#1e1b4b", "rgba(255,255,255,0.12)") },
  { id: "dots-slate", name: "Slate Dots", category: "Pattern", image: dots("#0f172a", "rgba(255,255,255,0.10)") },
  { id: "grid-violet", name: "Violet Grid", category: "Pattern", image: grid("#1e1b4b", "rgba(255,255,255,0.08)") },
  { id: "grid-ink", name: "Ink Grid", category: "Pattern", image: grid("#111827", "rgba(255,255,255,0.07)") },
  { id: "twill-indigo", name: "Indigo Twill", category: "Pattern", image: twill("#4338ca", "#7c3aed") },
  { id: "twill-sunset", name: "Sunset Twill", category: "Pattern", image: twill("#be123c", "#f97316") },
  // --- Royalty-free photos (16 per category) ---
  ...PHOTOS,
];
