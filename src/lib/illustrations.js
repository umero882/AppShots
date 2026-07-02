/**
 * Original inline-SVG illustrations (flat/geometric, hand-authored — no external
 * assets, copyright-clean like ./mockScreens.js). Each returns a
 * data:image/svg+xml URI that drops onto the canvas as an image element and
 * exports through the existing <img> path.
 *
 * Kept intentionally simple and on-brand: a small shared palette, ~400×320
 * scenes recognizable at screenshot scale.
 */
const C = {
  ink: "#1f2937",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  sky: "#38bdf8",
  amber: "#fbbf24",
  rose: "#fb7185",
  emerald: "#34d399",
  paper: "#ffffff",
  cloud: "#eef2ff",
  mist: "#e0e7ff",
};

const W = 400;
const H = 320;

const enc = (inner) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>${inner}</svg>`
  );

const r = (x, y, w, h, fill, rad = 0, o = 1) =>
  `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='${rad}' fill='${fill}' opacity='${o}'/>`;
const c = (cx, cy, rad, fill, o = 1) =>
  `<circle cx='${cx}' cy='${cy}' r='${rad}' fill='${fill}' opacity='${o}'/>`;
const p = (d, fill, o = 1) => `<path d='${d}' fill='${fill}' opacity='${o}'/>`;
const line = (x1, y1, x2, y2, stroke, w = 6) =>
  `<path d='M${x1} ${y1} L${x2} ${y2}' stroke='${stroke}' stroke-width='${w}' stroke-linecap='round' fill='none'/>`;

// Soft blob backdrop shared by every scene for a consistent look.
const blob = (fill) =>
  p(
    "M60 110 C40 60 120 30 190 40 C280 52 360 40 372 120 C384 200 320 250 240 262 C150 276 80 280 56 210 C40 162 74 150 60 110 Z",
    fill,
    1
  );

function rocket() {
  return enc(
    blob(C.cloud) +
      // flame
      p("M200 250 C186 226 214 226 200 250 Z", C.amber) +
      p("M200 262 C180 224 220 224 200 262 Z", C.rose, 0.9) +
      // body
      p("M200 60 C240 96 240 170 200 214 C160 170 160 96 200 60 Z", C.indigo) +
      p("M200 60 C220 78 220 170 200 214 C200 150 200 96 200 60 Z", C.violet) +
      // window
      c(200, 128, 20, C.paper) +
      c(200, 128, 12, C.sky) +
      // fins
      p("M164 176 L142 214 L166 206 Z", C.rose) +
      p("M236 176 L258 214 L234 206 Z", C.rose) +
      // stars
      c(96, 96, 5, C.amber) +
      c(320, 120, 6, C.violet) +
      c(300, 210, 4, C.sky)
  );
}

function growth() {
  return enc(
    blob(C.mist) +
      r(70, 90, 260, 160, C.paper, 16) +
      // bars
      r(104, 190, 34, 40, C.sky, 6) +
      r(150, 160, 34, 70, C.indigo, 6) +
      r(196, 130, 34, 100, C.violet, 6) +
      r(242, 96, 34, 134, C.emerald, 6) +
      // trend line + arrow
      line(112, 200, 300, 96, C.rose, 7) +
      p("M300 96 L280 96 L300 116 Z", C.rose) +
      c(112, 200, 6, C.rose) +
      c(300, 96, 6, C.rose)
  );
}

function team() {
  const person = (x, col) =>
    c(x, 150, 26, col) + p(`M${x - 40} 250 C${x - 40} 200 ${x + 40} 200 ${x + 40} 250 Z`, col);
  return enc(
    blob(C.cloud) +
      person(140, C.indigo) +
      person(260, C.violet) +
      person(200, C.emerald) +
      c(200, 132, 30, C.emerald) // bring middle forward
      + p("M160 250 C160 196 240 196 240 250 Z", C.emerald)
  );
}

function chat() {
  return enc(
    blob(C.mist) +
      // bubble 1
      r(70, 90, 180, 90, C.indigo, 22) +
      p("M100 178 L100 210 L134 178 Z", C.indigo) +
      r(96, 118, 128, 12, C.paper, 6, 0.9) +
      r(96, 142, 90, 12, C.paper, 6, 0.7) +
      // bubble 2
      r(180, 170, 150, 78, C.emerald, 20) +
      p("M300 246 L300 274 L270 246 Z", C.emerald) +
      r(202, 194, 106, 12, C.paper, 6, 0.9) +
      r(202, 216, 70, 12, C.paper, 6, 0.7)
  );
}

function secure() {
  return enc(
    blob(C.cloud) +
      p("M200 62 L296 100 L296 168 C296 224 252 254 200 268 C148 254 104 224 104 168 L104 100 Z", C.indigo) +
      p("M200 62 L296 100 L296 168 C296 224 252 254 200 268 C200 214 200 118 200 62 Z", C.violet) +
      // check
      line(166, 166, 190, 190, C.paper, 14) +
      line(190, 190, 240, 132, C.paper, 14)
  );
}

function target() {
  return enc(
    blob(C.mist) +
      c(200, 168, 92, C.indigo) +
      c(200, 168, 62, C.paper) +
      c(200, 168, 34, C.rose) +
      c(200, 168, 12, C.paper) +
      // dart
      line(292, 76, 210, 158, C.ink, 8) +
      p("M210 158 L228 150 L220 172 Z", C.emerald) +
      p("M292 76 L306 62 L300 84 L282 90 Z", C.amber)
  );
}

function mobile() {
  return enc(
    blob(C.cloud) +
      r(150, 56, 100, 208, C.ink, 22) +
      r(158, 68, 84, 184, C.paper, 14) +
      c(200, 62, 3, C.paper) +
      // app content
      r(170, 84, 60, 40, C.indigo, 8) +
      r(170, 134, 60, 10, C.mist, 5) +
      r(170, 152, 40, 10, C.mist, 5) +
      c(184, 188, 12, C.emerald) +
      r(204, 180, 30, 8, C.mist, 4) +
      r(204, 196, 20, 8, C.mist, 4) +
      // floating spark
      c(300, 110, 8, C.amber) +
      c(112, 200, 6, C.rose)
  );
}

function rating() {
  const star = (cx, cy, s, fill) =>
    p(
      `M${cx} ${cy - s} L${cx + s * 0.31} ${cy - s * 0.31} L${cx + s} ${cy - s * 0.31} L${cx + s * 0.4} ${cy + s * 0.12} L${cx + s * 0.62} ${cy + s * 0.81} L${cx} ${cy + s * 0.38} L${cx - s * 0.62} ${cy + s * 0.81} L${cx - s * 0.4} ${cy + s * 0.12} L${cx - s} ${cy - s * 0.31} L${cx - s * 0.31} ${cy - s * 0.31} Z`,
      fill
    );
  return enc(
    blob(C.mist) +
      star(200, 150, 80, C.amber) +
      star(110, 210, 26, C.violet) +
      star(300, 120, 22, C.sky) +
      c(300, 210, 6, C.rose)
  );
}

function payment() {
  return enc(
    blob(C.cloud) +
      r(90, 108, 220, 130, C.indigo, 18) +
      r(90, 138, 220, 26, C.ink, 0, 0.85) +
      r(112, 196, 70, 14, C.paper, 4, 0.9) +
      c(276, 200, 16, C.amber) +
      c(258, 200, 16, C.rose, 0.85) +
      // coins
      c(320, 232, 22, C.amber) +
      c(320, 224, 22, C.emerald) +
      r(312, 218, 16, 6, C.paper, 3, 0.8)
  );
}

function world() {
  return enc(
    blob(C.mist) +
      c(200, 160, 92, C.sky) +
      c(200, 160, 92, C.indigo, 0.15) +
      p("M120 140 C160 150 180 120 220 132 C258 143 270 120 288 138", C.paper, 0) +
      line(120, 140, 288, 140, C.paper, 5) +
      line(130, 178, 278, 178, C.paper, 5) +
      line(160, 110, 250, 110, C.paper, 5) +
      // pin
      p("M300 96 C316 96 316 118 300 140 C284 118 284 96 300 96 Z", C.rose) +
      c(300, 110, 6, C.paper)
  );
}

function celebrate() {
  return enc(
    blob(C.cloud) +
      // trophy
      p("M150 96 L250 96 L242 168 C242 196 158 196 158 168 Z", C.amber) +
      r(184, 196, 32, 22, C.amber, 4) +
      r(160, 222, 80, 16, C.ink, 6, 0.9) +
      p("M150 104 C118 104 118 150 156 152", C.amber, 0) +
      line(150, 108, 128, 108, C.amber, 8) +
      line(128, 108, 128, 140, C.amber, 8) +
      line(128, 140, 156, 148, C.amber, 8) +
      line(250, 108, 272, 108, C.amber, 8) +
      line(272, 108, 272, 140, C.amber, 8) +
      line(272, 140, 244, 148, C.amber, 8) +
      // confetti
      r(110, 70, 12, 12, C.rose, 2) +
      r(300, 78, 12, 12, C.violet, 2) +
      c(96, 150, 6, C.sky) +
      c(320, 170, 6, C.emerald)
  );
}

function idea() {
  return enc(
    blob(C.mist) +
      c(200, 150, 66, C.amber) +
      c(200, 150, 66, C.paper, 0.25) +
      r(180, 210, 40, 16, C.ink, 4) +
      r(184, 230, 32, 12, C.ink, 4, 0.8) +
      // rays
      line(200, 60, 200, 34, C.amber, 8) +
      line(286, 96, 306, 78, C.amber, 8) +
      line(114, 96, 94, 78, C.amber, 8) +
      line(300, 168, 326, 168, C.amber, 8) +
      line(100, 168, 74, 168, C.amber, 8) +
      // filament
      line(186, 150, 200, 168, C.rose, 5) +
      line(200, 168, 214, 150, C.rose, 5)
  );
}

export const ILLUSTRATIONS = [
  { id: "rocket", label: "Launch", make: rocket },
  { id: "growth", label: "Growth", make: growth },
  { id: "team", label: "Team", make: team },
  { id: "chat", label: "Chat", make: chat },
  { id: "secure", label: "Secure", make: secure },
  { id: "target", label: "Goal", make: target },
  { id: "mobile", label: "App", make: mobile },
  { id: "rating", label: "Rating", make: rating },
  { id: "payment", label: "Payment", make: payment },
  { id: "world", label: "Global", make: world },
  { id: "celebrate", label: "Success", make: celebrate },
  { id: "idea", label: "Idea", make: idea },
];
