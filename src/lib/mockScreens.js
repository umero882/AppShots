/**
 * Inline SVG "mock app screen" generators. Each returns a data:image/svg+xml URI
 * sized to a phone aspect (390x844) that slots into screen.image and renders
 * through the existing <img> path. Parameterized by accent + light/dark.
 */
const W = 390;
const H = 844;

function palette(dark) {
  return dark
    ? { bg: "#0b0b12", card: "#181826", line: "#262638", text: "#e5e7eb", sub: "#8b8ba3" }
    : { bg: "#ffffff", card: "#f1f5f9", line: "#e2e8f0", text: "#0f172a", sub: "#64748b" };
}

function uri(svg) {
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function wrap(inner, dark) {
  const p = palette(dark);
  return uri(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>` +
      `<rect width='${W}' height='${H}' fill='${p.bg}'/>` +
      `<rect x='150' y='22' width='90' height='8' rx='4' fill='${p.sub}' opacity='.5'/>` +
      inner +
      `</svg>`
  );
}

const bar = (x, y, w, h, fill, r = 6, o = 1) =>
  `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='${r}' fill='${fill}' opacity='${o}'/>`;
const circ = (cx, cy, rad, fill, o = 1) =>
  `<circle cx='${cx}' cy='${cy}' r='${rad}' fill='${fill}' opacity='${o}'/>`;

export function mockDashboard(accent, { dark } = {}) {
  const p = palette(dark);
  let s = bar(28, 70, 150, 16, p.text);
  s += bar(28, 96, 90, 10, p.sub, 5, 0.6);
  s += bar(28, 130, 150, 110, accent, 18);
  s += bar(212, 130, 150, 110, p.card, 18);
  s += circ(70, 175, 16, "#ffffff", 0.85) + bar(100, 165, 60, 10, "#ffffff", 5, 0.85);
  for (let i = 0; i < 4; i++) {
    const y = 270 + i * 78;
    s += bar(28, y, 334, 60, p.card, 16);
    s += circ(58, y + 30, 18, accent);
    s += bar(92, y + 16, 180, 12, p.text, 6, 0.9);
    s += bar(92, y + 36, 110, 9, p.sub, 5, 0.7);
  }
  return wrap(s, dark);
}

export function mockFeed(accent, { dark } = {}) {
  const p = palette(dark);
  let s = bar(28, 70, 120, 16, p.text);
  for (let i = 0; i < 3; i++) {
    const y = 110 + i * 230;
    s += bar(28, y, 334, 210, p.card, 20);
    s += circ(58, y + 36, 16, accent) + bar(86, y + 28, 120, 11, p.text, 5, 0.9);
    s += bar(86, y + 46, 70, 8, p.sub, 4, 0.7);
    s += bar(48, y + 72, 294, 96, accent, 14, 0.18);
    s += circ(310, y + 36, 10, accent, 0.5);
  }
  return wrap(s, dark);
}

export function mockProfile(accent, { dark } = {}) {
  const p = palette(dark);
  let s = bar(0, 60, W, 200, accent, 0, 0.18);
  s += circ(W / 2, 150, 48, accent);
  s += circ(W / 2, 150, 44, p.bg, 0.0);
  s += bar(W / 2 - 70, 215, 140, 16, p.text);
  s += bar(W / 2 - 45, 240, 90, 10, p.sub, 5, 0.7);
  for (let i = 0; i < 3; i++) {
    const x = 28 + i * 114;
    s += bar(x, 290, 102, 70, p.card, 16);
    s += bar(x + 20, 312, 62, 12, accent, 6);
    s += bar(x + 26, 334, 50, 8, p.sub, 4, 0.7);
  }
  for (let i = 0; i < 3; i++) {
    const y = 390 + i * 70;
    s += bar(28, y, 334, 56, p.card, 14);
    s += circ(58, y + 28, 14, accent, 0.8);
    s += bar(86, y + 22, 160, 12, p.text, 6, 0.85);
  }
  return wrap(s, dark);
}

export function mockOnboarding(accent, { dark } = {}) {
  const p = palette(dark);
  let s = bar(0, 60, W, 380, accent, 0, 0.16);
  s += circ(W / 2, 240, 96, accent, 0.9);
  s += circ(W / 2, 240, 50, "#ffffff", 0.9);
  s += bar(W / 2 - 110, 480, 220, 20, p.text);
  s += bar(W / 2 - 80, 514, 160, 12, p.sub, 6, 0.7);
  s += bar(W / 2 - 60, 536, 120, 12, p.sub, 6, 0.7);
  s += bar(48, 700, 294, 56, accent, 28);
  for (let i = 0; i < 3; i++)
    s += circ(W / 2 - 20 + i * 20, 620, 5, i === 0 ? accent : p.sub, i === 0 ? 1 : 0.5);
  return wrap(s, dark);
}

export function mockStats(accent, { dark } = {}) {
  const p = palette(dark);
  let s = bar(28, 70, 140, 16, p.text);
  s += bar(28, 120, 334, 170, p.card, 20);
  const base = 250;
  for (let i = 0; i < 7; i++) {
    const h = 30 + ((i * 37) % 110);
    s += bar(52 + i * 44, base - h, 22, h, accent, 6, 0.9);
  }
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const x = 28 + j * 174;
      const y = 320 + i * 120;
      s += bar(x, y, 160, 104, p.card, 18);
      s += bar(x + 18, y + 20, 70, 22, accent, 6);
      s += bar(x + 18, y + 54, 100, 10, p.sub, 5, 0.7);
      s += bar(x + 18, y + 74, 80, 10, p.sub, 5, 0.5);
    }
  }
  return wrap(s, dark);
}

export function mockChat(accent, { dark } = {}) {
  const p = palette(dark);
  let s = bar(28, 66, 140, 16, p.text) + circ(338, 74, 16, accent, 0.85);
  const rows = [
    [40, 120, 200, 0], [120, 188, 230, 1], [40, 256, 150, 0],
    [90, 312, 260, 1], [40, 388, 220, 0], [140, 452, 210, 1],
  ];
  for (const [x, y, w, right] of rows) {
    s += bar(x, y, w, 52, right ? accent : p.card, 18, right ? 0.9 : 1);
    s += bar(x + 18, y + 14, w - 60, 10, right ? "#ffffff" : p.text, 5, right ? 0.85 : 0.8);
    s += bar(x + 18, y + 30, w - 110, 8, right ? "#ffffff" : p.sub, 4, right ? 0.6 : 0.6);
  }
  s += bar(28, 700, 334, 52, p.card, 26);
  s += circ(338, 726, 18, accent);
  return wrap(s, dark);
}

export function mockMusic(accent, { dark } = {}) {
  const p = palette(dark);
  let s = bar(48, 90, 294, 294, accent, 28, 0.95);
  s += circ(W / 2, 237, 40, p.bg, 0.9) + circ(W / 2, 237, 12, accent);
  s += bar(W / 2 - 100, 430, 200, 18, p.text);
  s += bar(W / 2 - 60, 460, 120, 12, p.sub, 6, 0.7);
  s += bar(48, 540, 294, 6, p.card, 3) + bar(48, 540, 180, 6, accent, 3);
  for (let i = 0; i < 3; i++) s += circ(120 + i * 75, 620, i === 1 ? 26 : 18, accent, i === 1 ? 1 : 0.7);
  return wrap(s, dark);
}

export function mockMap(accent, { dark } = {}) {
  const p = palette(dark);
  let s = bar(0, 60, W, H - 60, p.card, 0);
  s += `<path d='M0 300 L160 360 L260 280 L390 340' stroke='${accent}' stroke-width='10' fill='none' opacity='.55'/>`;
  s += `<path d='M60 60 L120 300 L90 600 L200 844' stroke='${p.line}' stroke-width='14' fill='none'/>`;
  s += circ(160, 360, 14, accent) + circ(160, 360, 28, accent, 0.25);
  s += circ(260, 280, 10, p.text, 0.7);
  s += bar(28, 690, 334, 96, p.bg, 20);
  s += circ(64, 738, 18, accent) + bar(96, 716, 180, 12, p.text, 6, 0.9) + bar(96, 740, 120, 9, p.sub, 5, 0.7);
  return wrap(s, dark);
}

export const MOCKS = [
  mockDashboard, mockFeed, mockProfile, mockOnboarding,
  mockStats, mockChat, mockMusic, mockMap,
];
