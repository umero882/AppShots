# Template Gallery — Design Spec

**Date:** 2026-06-20
**Status:** Approved (design), pending implementation plan
**Feature area:** AppShots editor — reference: appscreens.com (150+ starter templates)
**Milestone:** Phase 1 of the "Beat appscreens" roadmap (see below)

## Product vision & roadmap

Goal of the product: make AppShots the **best** App Store / Google Play screenshot
generator — matching appscreens.com on table stakes and beating it on editor
quality, conversion features, and baked-in industry standards.

**Differentiators (beat appscreens):** connected/panoramic screenshots, rich
backgrounds (mesh gradients / noise / patterns / image+blur), real 3D-clay-tilt
device frames, built-in **WCAG contrast checker** + **store-spec export
validation**, a pro editor (undo/redo, shortcuts, drag/snap, A/B preview, brand
kit), and a no-signup-to-try, offline-first, fast experience.

**Industry standards baked in:** exact current Apple/Google dimensions,
sRGB/flattened PNG export, accessibility (focus states, caption contrast, keyboard
nav), i18n/RTL-ready, memoized + lazy rendering, automated tests.

**Phases:** 1) Template gallery (this spec) · 2) Pro editor core (undo/redo,
shortcuts, rich backgrounds, per-screen overrides, contrast checker) · 3) Devices &
mockups (full store device set, clay/3D/tilt frames, watch, feature graphic,
connected screenshots) · 4) Localization (multi-language sets, RTL, AI translate,
per-locale overrides) · 5) Export & delivery (ZIP whole set × all sizes, spec
validation, bulk import, drag-reorder) · 6) AI & ASO (AI captions, ASO score, A/B
variants).

## Goal (Phase 1)

Add a **template gallery**: a browsable set of ready-made, brand-grade screenshot
designs users can start a project from or apply inside the editor. This is
appscreens.com's headline feature and the biggest UX gap in AppShots today.

A template bundles **style + starter screens + sample device images** so it looks
complete out of the box. Phase 1 is built to an **outstanding** bar so it doubles
as the visual showcase that sells the product: every template must look
store-ready, captions must pass contrast on their background, and the gallery must
be fast and keyboard-accessible.

### Phase 1 quality bar (definition of done)

- **~24 templates** across the category set below (~4 per category), each
  genuinely distinct (background, layout, type, mock UI) — not recolors.
- Every template's caption color **passes WCAG AA contrast (≥ 4.5:1)** against its
  background; enforced by a build-time/test assertion using a small contrast util.
- Gallery is **keyboard accessible** (focus rings, `Esc` closes the modal, arrow/
  tab navigation, `aria` labels) and **fast** (thumbnails memoized; modal content
  mounted lazily so the Dashboard isn't slowed).
- Mock screens are **brand-grade** SVG (clean spacing, realistic app chrome), not
  placeholder boxes.
- A **search box + category chips** to filter the gallery.

## Entry points (both)

1. **New-project picker** — clicking *New project* on the Dashboard opens a modal
   gallery. Selecting a template creates a project pre-filled with that template's
   style, starter screens, and sample images. A *Blank* card preserves today's
   default (`defaultProjectState()`).
2. **In-editor Templates tab** — a new sidebar tab. Applying a template **restyles
   the current project (all screens) but preserves the user's screens and images.**

Rationale for the asymmetry: on a new/empty project you want a full example; on an
existing project you've already added your own screens, so apply = style only.

## Data model

Primitives in `src/lib/templates.js` (GRADIENTS, SOLIDS, FONTS, LAYOUTS, state
shape) are **unchanged**. Two new files:

### `src/lib/mockScreens.js`

Functions returning inline **SVG data-URIs** of simple mock app UIs, each
parameterized by an accent color so the fake screen matches its template:

- `mockChat`, `mockDashboard`, `mockMusic`, `mockMap`, `mockFeed`, `mockProfile`,
  `mockOnboarding`, `mockStats` — each `(accent, { dark } = {})` so a screen can
  render light or dark to suit its template. Brand-grade: status bar, realistic
  spacing, cards/lists, not placeholder rectangles.

Also add **`src/lib/contrast.js`** — a tiny WCAG relative-luminance/contrast-ratio
util (`contrastRatio(hex1, hex2)`, `passesAA(fg, bg)`). Used by the contrast
assertion test and reusable by Phase 2's live checker.

Each returns a string like `data:image/svg+xml,<encoded svg>`. These populate
`screen.image` and render through the **existing** `<img src>` path in
`ScreenCanvas` / `DeviceFrame` — **no render-code changes**. SVG aspect should be
tall (phone-like) so `object-cover` looks right across devices.

Implementation note: build the SVG as a string, then
`encodeURIComponent` it into a `data:image/svg+xml,...` URI (avoids base64 and
keeps it readable). Confirm html-to-image export renders these during impl.

### `src/lib/galleryTemplates.js`

```js
export const TEMPLATE_CATEGORIES =
  ["Minimal", "Bold", "Playful", "Dark", "Editorial", "Vibrant"];
// ~24 templates total, ~4 per category, each visually distinct.

export const TEMPLATES = [
  {
    id: "minimal-light",
    name: "Minimal Light",
    category: "Minimal",
    accent: "#6366f1",
    style: {
      deviceId: "iphone-69",
      layoutId: "text-top",
      deviceScale: 0.78,
      background: { type: "solid", gradient: "indigo", solid: "#f3f4f6" },
      text: { font: "inter", color: "#111827", size: 64, weight: 800, align: "center" },
    },
    screens: [
      { heading: "Everything in one place", subheading: "Simple, fast, focused.", image: mockDashboard("#6366f1") },
      { heading: "Stay in flow", subheading: "", image: mockFeed("#6366f1") },
      { heading: "Built for you", subheading: "", image: mockProfile("#6366f1") },
    ],
  },
  // … ~15 total, ~3 per category
];
```

Target: **~24 templates across the 6 categories** (~4 each), each visually
distinct. Each ships **2–3 starter screens**. Every template's `text.color` must
pass `passesAA(text.color, effective background color)` — for gradients, test
against both stops (use the worst case).

### Helpers (pure, in `galleryTemplates.js`)

```js
// New-project: full project state from a template (style + cloned screens, fresh ids).
export function templateToProjectState(template) { … }

// In-editor: replace only style fields; preserve prev.screens untouched.
export function applyTemplateStyle(prevState, template) { … }
```

- `templateToProjectState` returns a state matching `defaultProjectState()`'s shape:
  `{ deviceId, layoutId, deviceScale, background, text, screens }`, screens cloned
  with **fresh ids** (`Math.random().toString(36).slice(2,9)`).
- `applyTemplateStyle` returns
  `{ ...prevState, ...template.style }` (spreads deviceId/layoutId/deviceScale/
  background/text) and **keeps `prevState.screens`**.

## UI components

### `src/components/TemplatePicker.jsx` (modal)

- Props: `open`, `onClose`, `onPick(template | null)` (null = Blank).
- Category filter chips (All + 6 categories) **+ a search box** (matches name/
  category).
- Grid of cards; each card renders a live `ScreenCanvas` thumbnail from the
  template's `style` + first screen (reuse `_textPos` mapping), with the template
  name + category. Thumbnails **memoized** (`React.memo` / `useMemo`) so filtering
  doesn't re-render the whole grid.
- A **Blank** card at the front.
- **Accessibility:** rendered as a dialog (`role="dialog"`, `aria-modal`),
  focus trapped, **`Esc` closes**, backdrop click closes, visible focus rings,
  cards are real `<button>`s with `aria-label`. Modal body mounted **only when
  open** (lazy) to keep the Dashboard fast.
- Dark theme consistent with existing UI (`card`, `btn-*`, `bg-ink-*` classes).

### Dashboard wiring (`src/pages/Dashboard.jsx`)

- `New project` button + empty-state button open the picker instead of creating
  immediately.
- `onPick(template)` →
  `createProject(user.id, { name: template ? template.name : "Untitled project",
  state: template ? templateToProjectState(template) : defaultProjectState() })`
  → navigate to `/editor/:id`. Keep the existing `creating` state for the spinner.

### Editor wiring (`src/pages/Editor.jsx`)

- Add a **Templates** tab (first in `TABS`, e.g. `Sparkles` icon).
- New `TemplatesPanel({ state, update })`: same gallery grid (compact), category
  chips. Clicking a template → `update(prev => applyTemplateStyle(prev, t))`.
- Helper text: *"Applies style to all screens · keeps your images."*

Shared grid markup between the modal and the panel can live in a small
`TemplateGrid` component to avoid duplication, or be duplicated if cleaner —
decide during planning.

## Thumbnails

Rendered live by the existing `ScreenCanvas` at small `width`. The
`layoutTextPos` mapping (already in Editor/Dashboard) supplies `_textPos`. No
thumbnail image assets.

## Out of scope (this spec — handled by later phases)

- Localization (Phase 4), more device/store presets + clay/3D/tilt mockups +
  connected screenshots (Phase 3), rich backgrounds + undo/redo + live contrast
  checker (Phase 2), ZIP export + bulk import + spec validation (Phase 5), AI
  captions + ASO + App Store Connect upload (Phase 6).

## Testing

- Add **Vitest** (dev dependency) + `"test"` script for the pure units:
  - `templateToProjectState` — correct shape, fresh screen ids, style copied,
    screens deep-cloned (mutating result doesn't touch the template).
  - `applyTemplateStyle` — style replaced, `screens` content preserved unchanged.
  - `mockScreens` generators — return valid `data:image/svg+xml,…` URIs that
    `decodeURIComponent` back to well-formed `<svg>…</svg>`.
  - `contrast` — `contrastRatio`/`passesAA` match known reference values.
  - **Catalog integrity** — every template in `TEMPLATES` has a valid category,
    2–3 screens, and **passes AA contrast** (this is the quality-bar gate).
- UI (picker modal, editor panel, apply behavior, keyboard/Esc, export of SVG
  sample images) verified in the running dev server. Optional: a Playwright spec
  (skill available) for the new-project → editor happy path.

## Risks / notes

- **SVG data-URI export**: confirm `html-to-image` rasterizes the inline SVG
  sample images on export; if not, fall back to base64-encoding the data URI or
  pre-flattening. Verify early in implementation.
- Keep `defaultProjectState()` and `templates.js` primitives stable — other code
  (Dashboard thumbnail, Editor) depends on the existing state shape.
