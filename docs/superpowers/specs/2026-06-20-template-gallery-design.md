# Template Gallery — Design Spec

**Date:** 2026-06-20
**Status:** Approved (design), pending implementation plan
**Feature area:** AppShots editor — reference: appscreens.com (150+ starter templates)

## Goal

Add a **template gallery**: a browsable set of ready-made screenshot designs that
users can start a project from or apply inside the editor. This is appscreens.com's
headline feature and the biggest UX gap in AppShots today.

A template bundles **style + starter screens + sample device images** so it looks
complete out of the box (chosen scope).

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

- `mockChat(accent)`, `mockDashboard(accent)`, `mockMusic(accent)`,
  `mockMap(accent)`, `mockFeed(accent)`, `mockProfile(accent)`

Each returns a string like `data:image/svg+xml,<encoded svg>`. These populate
`screen.image` and render through the **existing** `<img src>` path in
`ScreenCanvas` / `DeviceFrame` — **no render-code changes**. SVG aspect should be
tall (phone-like) so `object-cover` looks right across devices.

Implementation note: build the SVG as a string, then
`encodeURIComponent` it into a `data:image/svg+xml,...` URI (avoids base64 and
keeps it readable). Confirm html-to-image export renders these during impl.

### `src/lib/galleryTemplates.js`

```js
export const TEMPLATE_CATEGORIES = ["Minimal", "Bold", "Playful", "Dark", "Editorial"];

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

Target: **~15 templates across the 5 categories** (~3 each). Each ships **2–3
starter screens**.

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
- Category filter chips (All + 5 categories).
- Grid of cards; each card renders a live `ScreenCanvas` thumbnail from the
  template's `style` + first screen (reuse `_textPos` mapping), with the template
  name + category.
- A **Blank** card at the front.
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

## Out of scope (this spec)

- Localization, more device/store presets, mockup styles (clay/3D), bulk import,
  ZIP export, AI captions, App Store Connect upload. (Tracked as future features.)

## Testing

- Add **Vitest** (dev dependency) for the pure units:
  - `templateToProjectState` — returns correct shape, fresh screen ids, style copied.
  - `applyTemplateStyle` — style replaced, `screens` reference/content preserved.
  - `mockScreens` generators — return valid `data:image/svg+xml,` URIs.
- UI (picker modal, editor panel, apply behavior, export of SVG sample images)
  verified manually in the running dev server (`npm run dev`, localhost:5173).

## Risks / notes

- **SVG data-URI export**: confirm `html-to-image` rasterizes the inline SVG
  sample images on export; if not, fall back to base64-encoding the data URI or
  pre-flattening. Verify early in implementation.
- Keep `defaultProjectState()` and `templates.js` primitives stable — other code
  (Dashboard thumbnail, Editor) depends on the existing state shape.
