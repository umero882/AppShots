# Template Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a brand-grade template gallery to AppShots — a new-project picker and an in-editor Templates tab — so users can start from or apply ~24 ready-made designs.

**Architecture:** Pure data + helpers in `src/lib` (contrast util, SVG mock-screen generators, a `TEMPLATES` catalog built by a compact factory, and `templateToProjectState` / `applyTemplateStyle` / `filterTemplates` helpers). UI is a shared `TemplateGrid` (chips + search + live `ScreenCanvas` thumbnails) consumed by a `TemplatePicker` modal (Dashboard) and a `TemplatesPanel` (Editor). Sample app screens are inline SVG data-URIs that slot into the existing `screen.image` `<img>` path — no changes to `ScreenCanvas`.

**Tech Stack:** React 18, Vite 5, React Router 6, TailwindCSS 3, lucide-react, html-to-image. Tests: **Vitest** (added in Task 1).

## Global Constraints

- **Do not modify** `src/lib/templates.js` primitives (`GRADIENTS`, `SOLIDS`, `FONTS`, `LAYOUTS`, `defaultScreen`, `defaultProjectState`) or `src/components/ScreenCanvas.jsx`. New code imports from them.
- **Project state shape** (must be produced exactly): `{ deviceId, layoutId, deviceScale, background: { type, gradient, solid }, text: { font, color, size, weight, align }, screens: [{ id, heading, subheading, image }] }`.
- **Contrast gate:** captions are large text (≥36px bold) → WCAG **large-text AA = 3:1**. Every template's `text.color` must reach ≥ 3:1 against the worst-case background color. Enforced by a catalog test.
- **Categories (exact, 6):** `["Minimal", "Bold", "Playful", "Dark", "Editorial", "Vibrant"]`. ~24 templates, ~4 per category, each visually distinct.
- **Screen ids:** clone with `Math.random().toString(36).slice(2, 9)` (matches existing code in `Editor.jsx`/`templates.js`).
- **Mock SVG data-URIs:** `data:image/svg+xml,` + `encodeURIComponent(svg)` (no base64).
- **Styling:** reuse existing utility classes (`card`, `btn-primary`, `btn-ghost`, `btn-soft`, `chip`, `input`, `label`, `bg-ink-900/950`, `border-white/5`, `text-brand-300`).
- **Env note (this machine):** Avast TLS interception can break `npm install`; if installs fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, set `NODE_EXTRA_CA_CERTS` to the exported Avast root before retrying.

---

### Task 1: Vitest setup + WCAG contrast util

**Files:**
- Modify: `package.json` (add `vitest` devDependency + `test` script)
- Create: `src/lib/contrast.js`
- Test: `src/lib/__tests__/contrast.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `contrastRatio(hexA, hexB) => number`, `passesAA(fg, bg) => boolean` (≥4.5), `passesLargeAA(fg, bg) => boolean` (≥3.0).

- [ ] **Step 1: Install Vitest and add the test script**

Run: `npm install -D vitest@^2.1.8`

Then edit `package.json` `scripts` to add (keep existing `dev`/`build`/`preview`):

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/__tests__/contrast.test.js`:

```js
import { describe, it, expect } from "vitest";
import { contrastRatio, passesAA, passesLargeAA } from "../contrast.js";

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
  it("returns 1 for identical colors", () => {
    expect(contrastRatio("#6366f1", "#6366f1")).toBeCloseTo(1, 2);
  });
  it("is order-independent", () => {
    expect(contrastRatio("#111827", "#f3f4f6")).toBeCloseTo(
      contrastRatio("#f3f4f6", "#111827"),
      5
    );
  });
  it("supports 3-digit hex", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 0);
  });
});

describe("thresholds", () => {
  it("passesAA true for white on dark navy", () => {
    expect(passesAA("#ffffff", "#0b1020")).toBe(true);
  });
  it("passesAA false for white on a light gray", () => {
    expect(passesAA("#ffffff", "#e5e7eb")).toBe(false);
  });
  it("passesLargeAA uses the 3:1 threshold", () => {
    // ratio between ~3 and 4.5 passes large but not normal
    const ratio = contrastRatio("#ffffff", "#6366f1");
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);
    expect(passesLargeAA("#ffffff", "#6366f1")).toBe(true);
    expect(passesAA("#ffffff", "#6366f1")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../contrast.js"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/contrast.js`:

```js
/**
 * WCAG 2.1 relative-luminance contrast helpers. Accepts 3- or 6-digit hex.
 */
function normalize(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return h;
}

function luminance(hex) {
  const h = normalize(hex);
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const la = luminance(hexA);
  const lb = luminance(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export function passesAA(fg, bg) {
  return contrastRatio(fg, bg) >= 4.5;
}

export function passesLargeAA(fg, bg) {
  return contrastRatio(fg, bg) >= 3;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `contrast.test.js` tests green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/contrast.js src/lib/__tests__/contrast.test.js
git commit -m "feat: add Vitest + WCAG contrast util"
```

---

### Task 2: SVG mock-screen generators

**Files:**
- Create: `src/lib/mockScreens.js`
- Test: `src/lib/__tests__/mockScreens.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: eight generators, each `(accent: string, opts?: { dark?: boolean }) => string` returning a `data:image/svg+xml,...` URI:
  `mockDashboard`, `mockFeed`, `mockProfile`, `mockOnboarding`, `mockStats`, `mockChat`, `mockMusic`, `mockMap`.
  Also exports `MOCKS` — an array of all eight functions (for tests/iteration).

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/mockScreens.test.js`:

```js
import { describe, it, expect } from "vitest";
import * as M from "../mockScreens.js";

const gens = [
  M.mockDashboard, M.mockFeed, M.mockProfile, M.mockOnboarding,
  M.mockStats, M.mockChat, M.mockMusic, M.mockMap,
];

describe("mock screen generators", () => {
  it("MOCKS exports all eight generators", () => {
    expect(M.MOCKS).toHaveLength(8);
  });

  for (const gen of gens) {
    it(`${gen.name} returns a valid svg data-uri embedding the accent`, () => {
      const uri = gen("#ff0066");
      expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
      const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
      expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
      expect(svg).toContain("#ff0066");
    });

    it(`${gen.name} honors the dark option`, () => {
      const light = gen("#ff0066", { dark: false });
      const dark = gen("#ff0066", { dark: true });
      expect(light).not.toEqual(dark);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/__tests__/mockScreens.test.js`
Expected: FAIL — cannot resolve `../mockScreens.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/mockScreens.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/__tests__/mockScreens.test.js`
Expected: PASS — all generators return valid accent-embedding data-URIs and differ between light/dark.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mockScreens.js src/lib/__tests__/mockScreens.test.js
git commit -m "feat: add SVG mock-screen generators"
```

---

### Task 3: Gallery helpers (state transforms + filter)

**Files:**
- Create: `src/lib/galleryTemplates.js` (helpers only in this task; catalog added in Task 4)
- Test: `src/lib/__tests__/galleryHelpers.test.js`

**Interfaces:**
- Consumes: `LAYOUTS` from `./templates`.
- Produces:
  - `textPosFor(layoutId) => "top" | "bottom" | "none"`
  - `templateToProjectState(template) => projectState` (full state, screens cloned with fresh ids)
  - `applyTemplateStyle(prevState, template) => state` (style replaced, `screens` preserved)
  - `filterTemplates(templates, { category, query }) => template[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/galleryHelpers.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  templateToProjectState, applyTemplateStyle, filterTemplates, textPosFor,
} from "../galleryTemplates.js";

const fixture = {
  id: "fx", name: "Fixture One", category: "Minimal", accent: "#6366f1",
  style: {
    deviceId: "ipad-13", layoutId: "centered", deviceScale: 0.68,
    background: { type: "solid", gradient: "indigo", solid: "#f3f4f6" },
    text: { font: "inter", color: "#111827", size: 60, weight: 800, align: "center" },
  },
  screens: [
    { heading: "A", subheading: "a", image: "data:image/svg+xml,X" },
    { heading: "B", subheading: "", image: "data:image/svg+xml,Y" },
  ],
};

describe("textPosFor", () => {
  it("maps known layouts", () => {
    expect(textPosFor("text-top")).toBe("top");
    expect(textPosFor("text-bottom")).toBe("bottom");
    expect(textPosFor("device-only")).toBe("none");
    expect(textPosFor("centered")).toBe("top");
  });
  it("falls back for unknown", () => {
    expect(textPosFor("nope")).toBe("top");
  });
});

describe("templateToProjectState", () => {
  it("produces the full project shape", () => {
    const s = templateToProjectState(fixture);
    expect(s.deviceId).toBe("ipad-13");
    expect(s.layoutId).toBe("centered");
    expect(s.deviceScale).toBe(0.68);
    expect(s.background).toEqual(fixture.style.background);
    expect(s.text).toEqual(fixture.style.text);
    expect(s.screens).toHaveLength(2);
    expect(s.screens[0]).toMatchObject({ heading: "A", subheading: "a", image: "data:image/svg+xml,X" });
    expect(typeof s.screens[0].id).toBe("string");
    expect(s.screens[0].id).not.toBe(s.screens[1].id);
  });
  it("deep-clones so mutating the result never touches the template", () => {
    const s = templateToProjectState(fixture);
    s.background.solid = "#000000";
    s.screens[0].heading = "changed";
    expect(fixture.style.background.solid).toBe("#f3f4f6");
    expect(fixture.screens[0].heading).toBe("A");
  });
  it("defaults a missing subheading to empty string and missing image to null", () => {
    const t = { ...fixture, screens: [{ heading: "X" }] };
    const s = templateToProjectState(t);
    expect(s.screens[0].subheading).toBe("");
    expect(s.screens[0].image).toBeNull();
  });
});

describe("applyTemplateStyle", () => {
  it("replaces style but preserves the user's screens unchanged", () => {
    const prev = {
      deviceId: "iphone-69", layoutId: "text-top", deviceScale: 0.78,
      background: { type: "gradient", gradient: "ocean", solid: "#0ea5e9" },
      text: { font: "mono", color: "#fff", size: 70, weight: 900, align: "left" },
      screens: [{ id: "keep1", heading: "mine", subheading: "", image: "data:img" }],
    };
    const next = applyTemplateStyle(prev, fixture);
    expect(next.deviceId).toBe("ipad-13");
    expect(next.layoutId).toBe("centered");
    expect(next.background).toEqual(fixture.style.background);
    expect(next.text).toEqual(fixture.style.text);
    expect(next.screens).toBe(prev.screens); // same reference, untouched
  });
});

describe("filterTemplates", () => {
  const list = [
    { name: "Indigo Bold", category: "Bold" },
    { name: "Paper", category: "Minimal" },
    { name: "Sunset Pop", category: "Playful" },
  ];
  it("returns all for category All and empty query", () => {
    expect(filterTemplates(list, { category: "All", query: "" })).toHaveLength(3);
  });
  it("filters by category", () => {
    expect(filterTemplates(list, { category: "Bold", query: "" })).toHaveLength(1);
  });
  it("matches query against name and category (case-insensitive)", () => {
    expect(filterTemplates(list, { category: "All", query: "pop" })[0].name).toBe("Sunset Pop");
    expect(filterTemplates(list, { category: "All", query: "minimal" })[0].name).toBe("Paper");
  });
  it("uses sane defaults when opts omitted", () => {
    expect(filterTemplates(list)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/__tests__/galleryHelpers.test.js`
Expected: FAIL — cannot resolve `../galleryTemplates.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/galleryTemplates.js`:

```js
import { LAYOUTS } from "./templates";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/__tests__/galleryHelpers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/galleryTemplates.js src/lib/__tests__/galleryHelpers.test.js
git commit -m "feat: add gallery state helpers (templateToProjectState/applyTemplateStyle/filterTemplates)"
```

---

### Task 4: Template catalog + contrast-gate test

**Files:**
- Modify: `src/lib/galleryTemplates.js` (append catalog + `TEMPLATE_CATEGORIES`, `TEMPLATES`, `backgroundColors`, `worstContrast`)
- Test: `src/lib/__tests__/catalog.test.js`

**Interfaces:**
- Consumes: `GRADIENTS` from `./templates`, `passesLargeAA`/`contrastRatio` from `./contrast`, all eight `mockScreens` generators.
- Produces:
  - `TEMPLATE_CATEGORIES: string[]` (the 6 categories)
  - `TEMPLATES: Template[]` (~24)
  - `backgroundColors(background) => string[]`
  - `worstContrast(textColor, background) => number`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/catalog.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  TEMPLATES, TEMPLATE_CATEGORIES, worstContrast, backgroundColors,
} from "../galleryTemplates.js";
import { DEVICES } from "../devices.js";
import { LAYOUTS, FONTS } from "../templates.js";

const deviceIds = new Set(DEVICES.map((d) => d.id));
const layoutIds = new Set(LAYOUTS.map((l) => l.id));
const fontIds = new Set(FONTS.map((f) => f.id));

describe("template catalog", () => {
  it("has the six categories", () => {
    expect(TEMPLATE_CATEGORIES).toEqual([
      "Minimal", "Bold", "Playful", "Dark", "Editorial", "Vibrant",
    ]);
  });

  it("ships at least 24 templates with unique ids", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(24);
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has roughly even coverage (>=3 per category)", () => {
    for (const cat of TEMPLATE_CATEGORIES) {
      const n = TEMPLATES.filter((t) => t.category === cat).length;
      expect(n, `category ${cat}`).toBeGreaterThanOrEqual(3);
    }
  });

  for (const t of TEMPLATES) {
    it(`${t.id} is well-formed`, () => {
      expect(TEMPLATE_CATEGORIES).toContain(t.category);
      expect(deviceIds.has(t.style.deviceId)).toBe(true);
      expect(layoutIds.has(t.style.layoutId)).toBe(true);
      expect(fontIds.has(t.style.text.font)).toBe(true);
      expect(t.screens.length).toBeGreaterThanOrEqual(2);
      expect(t.screens.length).toBeLessThanOrEqual(3);
      for (const s of t.screens) {
        expect(typeof s.heading).toBe("string");
        expect(s.image.startsWith("data:image/svg+xml,")).toBe(true);
      }
    });

    it(`${t.id} passes large-text AA contrast (>=3:1)`, () => {
      const ratio = worstContrast(t.style.text.color, t.style.background);
      expect(ratio, `${t.id} ratio`).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("backgroundColors", () => {
  it("returns the solid for solid backgrounds", () => {
    expect(backgroundColors({ type: "solid", solid: "#abcdef" })).toEqual(["#abcdef"]);
  });
  it("returns both gradient stops for gradient backgrounds", () => {
    const colors = backgroundColors({ type: "gradient", gradient: "indigo" });
    expect(colors).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/__tests__/catalog.test.js`
Expected: FAIL — `TEMPLATES`/`worstContrast`/`backgroundColors` are undefined.

- [ ] **Step 3: Write the implementation (append to `src/lib/galleryTemplates.js`)**

Add these imports at the top of `src/lib/galleryTemplates.js` (merge with the existing `LAYOUTS` import line):

```js
import { LAYOUTS, GRADIENTS } from "./templates";
import { contrastRatio } from "./contrast";
import {
  mockDashboard, mockFeed, mockProfile, mockOnboarding,
  mockStats, mockChat, mockMusic, mockMap,
} from "./mockScreens";
```

Then append to the end of the file:

```js
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

// mk(id, name, category, accent, background, textColor, font, layoutId, deviceId, screens)
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
  mk("minimal-mist", "Mist", "Minimal", "#6366f1", solidBg("#eef2ff"), "#1e1b4b", "centered", "ipad-13", [
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/__tests__/catalog.test.js`
Expected: PASS — 24 templates, even coverage, all well-formed, all pass ≥3:1 contrast.
If any `passes large-text AA` assertion fails, darken/lighten that template's `background` or flip its `color` until `worstContrast` ≥ 3, then re-run.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — contrast, mockScreens, galleryHelpers, catalog all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/galleryTemplates.js src/lib/__tests__/catalog.test.js
git commit -m "feat: add 24-template catalog with WCAG contrast gate"
```

---

### Task 5: Shared `TemplateGrid` component

**Files:**
- Create: `src/components/TemplateGrid.jsx`
- Manual verification (no DOM unit test; logic is covered by `filterTemplates` in Task 3)

**Interfaces:**
- Consumes: `TEMPLATES`, `TEMPLATE_CATEGORIES`, `filterTemplates`, `textPosFor` from `../lib/galleryTemplates`; `ScreenCanvas` from `./ScreenCanvas`.
- Produces: default-exported `<TemplateGrid templates? onSelect compact? thumbWidth? />`.
  - `onSelect(template)` fires when a card is clicked.
  - `compact` (bool) → tighter grid for the editor sidebar.
  - `thumbWidth` (number, default 150) → thumbnail width.

- [ ] **Step 1: Write the component**

Create `src/components/TemplateGrid.jsx`:

```jsx
import { useMemo, useState, memo } from "react";
import { Search } from "lucide-react";
import ScreenCanvas from "./ScreenCanvas";
import {
  TEMPLATES, TEMPLATE_CATEGORIES, filterTemplates, textPosFor,
} from "../lib/galleryTemplates";

const Thumb = memo(function Thumb({ template, width }) {
  const state = {
    ...template.style,
    _textPos: textPosFor(template.style.layoutId),
  };
  return <ScreenCanvas state={state} screen={template.screens[0]} width={width} />;
});

export default function TemplateGrid({
  templates = TEMPLATES,
  onSelect,
  compact = false,
  thumbWidth = 150,
}) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => filterTemplates(templates, { category, query }),
    [templates, category, query]
  );

  const chips = ["All", ...TEMPLATE_CATEGORIES];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          aria-label="Search templates"
          className="input pl-9"
        />
      </div>

      <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              category === c
                ? "bg-brand-600 text-white"
                : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No templates match “{query}”.</p>
      ) : (
        <div
          className={`grid gap-3 ${
            compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          }`}
        >
          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect?.(t)}
              aria-label={`Use template ${t.name}`}
              className="card group flex flex-col items-center gap-2 p-2 text-center transition hover:border-brand-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <div className="grid w-full place-items-center overflow-hidden rounded-lg bg-ink-900 p-2">
                <Thumb template={t} width={thumbWidth} />
              </div>
              <div className="w-full">
                <p className="truncate text-xs font-semibold text-white">{t.name}</p>
                <p className="text-[10px] text-slate-500">{t.category}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds with no import/JSX errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TemplateGrid.jsx
git commit -m "feat: add shared TemplateGrid (search + category chips + live thumbnails)"
```

---

### Task 6: `TemplatePicker` modal

**Files:**
- Create: `src/components/TemplatePicker.jsx`
- Manual verification in the dev server.

**Interfaces:**
- Consumes: `TemplateGrid` from `./TemplateGrid`.
- Produces: default-exported `<TemplatePicker open onClose onPick />`.
  - `onPick(template)` for a chosen template; `onPick(null)` for the **Blank** card.
  - Closes on `Esc`, backdrop click, and the × button.

- [ ] **Step 1: Write the component**

Create `src/components/TemplatePicker.jsx`:

```jsx
import { useEffect } from "react";
import { X, FilePlus2 } from "lucide-react";
import TemplateGrid from "./TemplateGrid";

export default function TemplatePicker({ open, onClose, onPick }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a template"
    >
      <div
        className="card my-auto w-full max-w-5xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Start with a template</h2>
            <p className="text-sm text-slate-400">Pick a design — you can customize everything later.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn-ghost px-2.5 py-2">
            <X size={18} />
          </button>
        </div>

        <button
          onClick={() => onPick?.(null)}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-white/15 p-4 text-left transition hover:border-brand-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/5 text-brand-300">
            <FilePlus2 size={18} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-white">Blank project</span>
            <span className="block text-xs text-slate-500">Start from a clean canvas.</span>
          </span>
        </button>

        <TemplateGrid onSelect={(t) => onPick?.(t)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/TemplatePicker.jsx
git commit -m "feat: add TemplatePicker modal with Blank option + Esc/backdrop close"
```

---

### Task 7: Wire the picker into the Dashboard

**Files:**
- Modify: `src/pages/Dashboard.jsx`
- Manual verification in the dev server.

**Interfaces:**
- Consumes: `TemplatePicker`, `templateToProjectState`.
- Produces: New-project flow that opens the picker, then creates a project from the chosen template (or blank).

- [ ] **Step 1: Add imports**

In `src/pages/Dashboard.jsx`, update the imports. Add `useState` is already imported. Add:

```jsx
import TemplatePicker from "../components/TemplatePicker";
import { defaultProjectState } from "../lib/templates";
import { templateToProjectState } from "../lib/galleryTemplates";
```

(The existing `import { defaultProjectState } from "../lib/templates";` line stays — just add the `templateToProjectState` import. Do not duplicate `defaultProjectState`.)

- [ ] **Step 2: Add picker state and replace the create handler**

Add a `pickerOpen` state next to the existing `creating` state:

```jsx
  const [creating, setCreating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
```

Replace the existing `createProject` function with a picker-driven version:

```jsx
  async function createFrom(template) {
    setPickerOpen(false);
    setCreating(true);
    try {
      const project = await backend.createProject(user.id, {
        name: template ? template.name : "Untitled project",
        state: template ? templateToProjectState(template) : defaultProjectState(),
      });
      navigate(`/editor/${project.id}`);
    } finally {
      setCreating(false);
    }
  }
```

- [ ] **Step 3: Point the buttons at the picker**

Change the header "New project" button's handler from `onClick={createProject}` to `onClick={() => setPickerOpen(true)}`.

Change `<EmptyState onCreate={createProject} ... />` to `<EmptyState onCreate={() => setPickerOpen(true)} ... />`.

- [ ] **Step 4: Render the picker**

Just before the closing `</main>` tag (after the projects grid block), add:

```jsx
        <TemplatePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={createFrom}
        />
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev` (if not already running) and open http://localhost:5173.
- Log in / sign up (localStorage backend).
- Click **New project** → modal opens with search, chips, Blank card, and a grid of template thumbnails.
- Click a template → lands in the editor with that template's background, layout, typography, and 2–3 starter screens (each device shows a mock UI).
- Back to Dashboard → **New project** → **Blank project** → editor opens with the default empty single screen.
- Press **Esc** and click the backdrop → both close the modal.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.jsx
git commit -m "feat: open template picker from Dashboard new-project flow"
```

---

### Task 8: In-editor Templates tab

**Files:**
- Modify: `src/pages/Editor.jsx`
- Manual verification in the dev server.

**Interfaces:**
- Consumes: `TemplateGrid`, `applyTemplateStyle`, `Sparkles` icon.
- Produces: a "Templates" tab whose panel restyles the current project (preserving the user's screens/images) via `update(prev => applyTemplateStyle(prev, t))`.

- [ ] **Step 1: Add imports**

In `src/pages/Editor.jsx`, add `Sparkles` to the existing lucide-react import, and add the two new imports:

```jsx
import {
  ArrowLeft, Plus, Download, Trash2, Copy, Check, Loader2,
  Image as ImageIcon, Upload, Smartphone, Palette, Type, LayoutTemplate, Sparkles,
} from "lucide-react";
import TemplateGrid from "../components/TemplateGrid";
import { applyTemplateStyle } from "../lib/galleryTemplates";
```

- [ ] **Step 2: Add the tab to the `TABS` array**

Make Templates the first tab:

```jsx
const TABS = [
  { id: "templates", label: "Templates", icon: Sparkles },
  { id: "device", label: "Device", icon: Smartphone },
  { id: "background", label: "Background", icon: Palette },
  { id: "text", label: "Text", icon: Type },
  { id: "layout", label: "Layout", icon: LayoutTemplate },
];
```

- [ ] **Step 3: Render the panel**

In the panel-switch block (where `{tab === "device" && ...}` etc. are rendered), add as the first entry:

```jsx
            {tab === "templates" && <TemplatesPanel update={update} />}
```

- [ ] **Step 4: Add the `TemplatesPanel` component**

Add this near the other panel components (e.g. after `LayoutPanel`):

```jsx
function TemplatesPanel({ update }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Applies style to all screens · keeps your images.
      </p>
      <TemplateGrid
        compact
        thumbWidth={120}
        onSelect={(t) => update((prev) => applyTemplateStyle(prev, t))}
      />
    </div>
  );
}
```

- [ ] **Step 5: Manual verification**

With the dev server running:
- Open an existing project (or create one) in the editor.
- Upload a screenshot to screen 1 so you can confirm it's preserved.
- Open the **Templates** tab → click a template.
- Confirm: background, device, layout, and typography change across **all** screens, but your uploaded image **stays**.
- Confirm search + chips filter the in-sidebar grid.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Editor.jsx
git commit -m "feat: add in-editor Templates tab (restyle, preserve screens)"
```

---

### Task 9: Export verification + full regression

**Files:**
- No code changes expected (verification task; small fix only if export fails).
- Manual verification in the dev server.

**Interfaces:**
- Consumes: everything above.
- Produces: confidence that SVG sample images export correctly and nothing regressed.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all four test files green.

- [ ] **Step 2: Verify production build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Export a templated screen to PNG**

With the dev server running, create a project from any template, then click **Export PNG** (and **Export all**).
Expected: the downloaded PNG(s) show the gradient/solid background, caption, device frame, **and the mock SVG screen inside the device** at full store resolution.

- [ ] **Step 4: If the SVG screen is blank in the export**

`html-to-image` occasionally drops `encodeURIComponent` SVG `<img>` srcs during rasterization. If the device interior is blank in the exported PNG (but fine on screen), change `uri()` in `src/lib/mockScreens.js` to base64:

```js
function uri(svg) {
  // base64 is more reliably inlined by html-to-image during export
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}
```

Then update the two assertions in `src/lib/__tests__/mockScreens.test.js` and `src/lib/__tests__/catalog.test.js` that check the prefix:
- `mockScreens.test.js`: change `uri.startsWith("data:image/svg+xml,")` to `uri.startsWith("data:image/svg+xml")`, and decode via base64 (`atob(uri.split(",")[1])`) before the `<svg>` regex + accent check.
- `catalog.test.js`: change `s.image.startsWith("data:image/svg+xml,")` to `s.image.startsWith("data:image/svg+xml")`.

Re-run `npm test` (expect PASS) and re-export (expect the screen to render).

- [ ] **Step 5: Commit (only if Step 4 changed code)**

```bash
git add src/lib/mockScreens.js src/lib/__tests__/mockScreens.test.js src/lib/__tests__/catalog.test.js
git commit -m "fix: use base64 SVG data-uris for reliable PNG export"
```

- [ ] **Step 6: Final regression sweep**

Confirm, in the running app:
- Dashboard thumbnails still render for existing projects.
- Autosave badge still cycles saving → saved after edits.
- Watermark still shows on the free plan.
- Device/Background/Text/Layout tabs all still work.

---

## Self-Review

**Spec coverage:**
- Both entry points (new-project picker + in-editor tab) → Tasks 7, 8. ✓
- Style + starter screens + sample SVG images data model → Tasks 2, 3, 4. ✓
- `mockScreens.js` + `contrast.js` → Tasks 2, 1. ✓
- `galleryTemplates.js` (categories, TEMPLATES, helpers) → Tasks 3, 4. ✓
- `TemplatePicker.jsx` (search, a11y, Esc, lazy) → Task 6. ✓
- Dashboard/Editor wiring → Tasks 7, 8. ✓
- Thumbnails via existing `ScreenCanvas` → Task 5 (`Thumb`). ✓
- Quality bar: ~24 templates / 6 categories → Task 4; WCAG contrast gate (3:1 large text) → Tasks 1, 4; keyboard/Esc + memoized + lazy → Tasks 5, 6. ✓
- Testing (Vitest + pure units + catalog integrity + export check) → Tasks 1–4, 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; the only conditional code (Task 9 Step 4) is a concrete, complete alternative. ✓

**Type consistency:** State shape `{ deviceId, layoutId, deviceScale, background, text, screens }` consistent across `templateToProjectState`/`applyTemplateStyle` (Task 3) and consumers (Tasks 7, 8). Helper names — `templateToProjectState`, `applyTemplateStyle`, `filterTemplates`, `textPosFor`, `worstContrast`, `backgroundColors`, `TEMPLATES`, `TEMPLATE_CATEGORIES` — used identically in tests and components. Mock generator names match between `mockScreens.js`, its test, and the catalog. ✓
