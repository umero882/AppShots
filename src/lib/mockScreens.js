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

  // Header: greeting + avatar with a notification dot.
  let s = bar(28, 56, 70, 9, p.sub, 5, 0.6);
  s += bar(28, 70, 128, 17, p.text);
  s += circ(336, 74, 18, accent) + circ(336, 74, 8, "#ffffff", 0.9);
  s += circ(349, 63, 4, "#ef4444");

  // Hero metric card (accent) with a big value, a pill, and a mini sparkline.
  s += bar(28, 108, 334, 122, accent, 20);
  s += bar(46, 128, 84, 10, "#ffffff", 5, 0.7);
  s += bar(46, 148, 156, 24, "#ffffff", 6, 0.95);
  s += bar(46, 186, 74, 16, "#ffffff", 8, 0.22) + bar(56, 191, 40, 6, "#ffffff", 3, 0.8);
  const spx = (i) => 250 + Math.round(i * (96 / 5));
  const spv = [0.4, 0.55, 0.35, 0.7, 0.6, 0.85];
  const spts = spv.map((v, i) => `${spx(i)},${Math.round(206 - v * 44)}`).join(" ");
  s += `<polyline points='${spts}' fill='none' stroke='#ffffff' stroke-width='3' stroke-linejoin='round' stroke-linecap='round' opacity='.9'/>`;

  // Three KPI tiles.
  const tw = 103;
  for (let i = 0; i < 3; i++) {
    const x = 28 + i * (tw + 12.5);
    s += bar(x, 244, tw, 76, p.card, 16);
    s += circ(x + 22, 268, 9, accent, 0.9);
    s += bar(x + 16, 285, 52, 14, p.text, 6, 0.9);
    s += bar(x + 16, 304, 64, 8, p.sub, 4, 0.65);
  }

  // Analytics card with gridlines, an area + line chart, and a marked point.
  s += bar(28, 332, 334, 182, p.card, 20);
  s += bar(46, 352, 96, 12, p.text, 6, 0.9);
  s += circ(322, 358, 5, accent) + circ(300, 358, 5, accent, 0.4);
  for (let g = 0; g < 3; g++) {
    const gy = 402 + g * 43;
    s += `<line x1='46' y1='${gy}' x2='344' y2='${gy}' stroke='${p.line}' stroke-width='1' opacity='.8'/>`;
  }
  const cx = (i) => 46 + Math.round(i * (298 / 6));
  const cy = (v) => Math.round(488 - v * 118);
  const cv = [0.3, 0.46, 0.38, 0.6, 0.5, 0.74, 0.9];
  const cpts = cv.map((v, i) => `${cx(i)},${cy(v)}`).join(" ");
  s += `<polygon points='${cx(0)},488 ${cpts} ${cx(6)},488' fill='${accent}' opacity='.14'/>`;
  s += `<polyline points='${cpts}' fill='none' stroke='${accent}' stroke-width='4' stroke-linejoin='round' stroke-linecap='round'/>`;
  s += circ(cx(6), cy(0.9), 6, accent) + circ(cx(6), cy(0.9), 3, "#ffffff");

  // "Recent activity" list header + rows (leading icon, title/subtitle, amount).
  s += bar(28, 532, 112, 12, p.text, 6, 0.9) + bar(302, 534, 60, 8, p.sub, 4, 0.6);
  for (let i = 0; i < 3; i++) {
    const y = 556 + i * 62;
    s += bar(28, y, 334, 52, p.card, 14);
    s += circ(58, y + 26, 15, accent, 0.9) + circ(58, y + 26, 6, "#ffffff", 0.85);
    s += bar(88, y + 16, 150, 11, p.text, 6, 0.9);
    s += bar(88, y + 33, 92, 8, p.sub, 4, 0.6);
    s += bar(300, y + 20, 44, 12, p.text, 6, 0.85);
  }

  // Bottom tab bar (first tab active).
  s += bar(28, 782, 334, 56, p.card, 26);
  for (let i = 0; i < 4; i++) {
    const x = 72 + i * 83;
    s += circ(x, 810, 6, i === 0 ? accent : p.sub, i === 0 ? 1 : 0.5);
    if (i === 0) s += bar(x - 12, 824, 24, 4, accent, 2);
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
    s += bar(x + 18, y + 30, w - 110, 8, right ? "#ffffff" : p.sub, 4, 0.6);
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
