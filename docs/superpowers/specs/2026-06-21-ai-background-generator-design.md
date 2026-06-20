# AI Background Generator — Design Spec

**Date:** 2026-06-21
**Status:** Approved (design), ready for implementation

## Goal

Let a user generate **on-brand backgrounds** for the **active screen** by giving the
app a **GitHub repo URL** and/or a **free-text prompt**. An LLM (Anthropic Claude)
analyzes the project and returns **exactly 2 background concepts at a time**. Each
concept can be applied **instantly as a CSS gradient** (free, editable, exports
cleanly) or **rendered as a real image** via an optional image-generation API.

## Scope

- New "AI" view inside the existing **Background** panel of the editor.
- Output targets the **active screen only** (`screen.background`), consistent with
  the per-screen background model.
- LLM analysis via Claude, key supplied by the user in `.env.local`
  (`VITE_ANTHROPIC_API_KEY`), same pattern as the Pexels key.
- Real image generation is **optional and pluggable**: enabled only if an image-gen
  key is present (`VITE_OPENAI_API_KEY` → `gpt-image-1`, or `VITE_STABILITY_API_KEY`).
  Without one, the "Generate image" button is shown but disabled with a hint.

Out of scope (future): a serverless proxy to hide keys; saving/favoriting concepts;
multi-screen batch generation.

## Security note (carried into UI + .env.example)

`VITE_*` keys are **bundled into the client** and visible on any deployed build. A
Pexels key is low-risk; an **Anthropic key is billable and broader**. This is fine
for local dev. The `.env.example` comment and an inline UI note must warn that
production deployment should use a spend-capped key or a serverless proxy. The app
never asks the user to type the key into a web field — they place it in `.env.local`.

## User flow

1. Background tab → **AI** view.
2. Inputs:
   - **GitHub repo URL** (optional) — e.g. `https://github.com/owner/repo`.
   - **Prompt** (optional) — e.g. "dark, premium, calm".
   - At least one is required; the **Suggest** button is disabled until then.
3. Click **Suggest 2 backgrounds**:
   - If a repo URL is present, fetch brand context from `api.github.com`
     (name, description, topics, primary language, truncated README, scanned hex
     colors). If the fetch fails, show a non-blocking notice and continue using the
     prompt alone.
   - Call Claude with the brand context + prompt; receive **exactly 2 concepts**.
4. Render **2 preview cards**, each showing the live gradient, the concept **name**,
   its **rationale**, and:
   - **Use as background** → applies the gradient to the active screen.
   - **Generate image** → renders a real image (if an image-gen key exists; else
     disabled with a tooltip).
   - **Suggested text color** chip → one-click apply (reuses WCAG `suggestTextColor`).
5. **Suggest 2 more** → fresh pair (the "2 at a time" requirement).
6. Loading and typed error states throughout.

## Architecture

### New module: `src/lib/aiBackground.js`

Pure (unit-tested) helpers + thin network wrappers.

```
parseGithubUrl(url) -> { owner, repo } | null
  Accepts https/http, with/without www, trailing slash, ".git", deep paths,
  and "owner/repo" shorthand. Returns null if not parseable.

extractHexColors(text) -> string[]
  Finds #rrggbb (and #rgb) tokens, normalizes to 6-digit lowercase, dedupes,
  caps at 6.

aiGradientCss(concept) -> string
  concept.style === "mesh": layered radial-gradients over a base linear-gradient.
  otherwise: `linear-gradient(${angle}deg, ${stops.join(", ")})`.
  Pure CSS only (no SVG data-URIs) so html-to-image exports it.

parseConcepts(rawText) -> Concept[2]
  Strips ```json fences, parses JSON, validates/normalizes each concept, clamps
  to 2. Throws a typed Error("ai-parse") if it can't yield 2 valid concepts.

normalizeConcept(obj) -> Concept | null
  Coerces: name(string), rationale(string), style("linear"|"mesh"),
  angle(0-360 number, default 135), stops(>=2 valid hex, else null->reject),
  suggestedTextColor(valid hex, default "#ffffff").

aiProvider() -> "Anthropic" | null      (gated on VITE_ANTHROPIC_API_KEY)
imageProvider() -> "OpenAI" | "Stability" | null

async fetchRepoContext(url) -> RepoContext   (throws typed errors)
async suggestBackgrounds({ repoContext, prompt, model }) -> Concept[2]
async generateImage({ concept, prompt }) -> dataURL  (throws if no provider)
```

`Concept = { name, rationale, style, angle, stops: string[], suggestedTextColor }`
`RepoContext = { name, description, topics: string[], language, readme, hexColors: string[] }`

**Anthropic call:** `POST https://api.anthropic.com/v1/messages` with headers
`x-api-key`, `anthropic-version: 2023-06-01`, and
`anthropic-dangerous-direct-browser-access: true`. Default model
`claude-haiku-4-5-20251001`; `claude-opus-4-8` selectable. The prompt instructs:
return ONLY a JSON array of exactly 2 objects with the Concept shape, colors as
hex, gradients tasteful and on-brand, ensure the suggested text color meets WCAG
contrast against the stops.

**GitHub calls:** `GET /repos/{owner}/{repo}` (name, description, topics, language)
and `GET /repos/{owner}/{repo}/readme` with `Accept: application/vnd.github.raw`
(README, truncated to ~4000 chars). 403 → typed `Error("github-rate-limit")`,
404 → `Error("github-not-found")`. Unauthenticated (60 req/hr) is acceptable.

**Image gen:** OpenAI `POST /v1/images/generations` with `model: gpt-image-1`,
portrait size, `response_format`/`b64_json` → `data:image/png;base64,...`. Stability
analogous. Returns a data-URL so it persists and exports like other image backgrounds.

### Changed: `src/components/ScreenCanvas.jsx`

`backgroundCss(bg)` gains one branch: if `bg.type === "gradient"` and
`bg.aiGradient?.css` is a non-empty string, return `bg.aiGradient.css`. Everything
else unchanged. (The image-layer path already handles `type: "image"`.)

The `aiGradientCss` source of truth lives in `aiBackground.js`; `ScreenCanvas`
reads the pre-computed `bg.aiGradient.css` string, so it does not import the LLM
module.

### Changed: `src/pages/Editor.jsx` — `BackgroundPanel`

- Add a 4th segmented button **"AI"** next to gradient/solid/image. Track a local
  `view` state: `effectiveView = view ?? bg.type`. The three real types set both
  `view` and `onScreen({ background:{...bg, type} })`; **"AI"** sets `view="ai"` only.
- When `effectiveView === "ai"`, render the AI sub-panel:
  - URL input, prompt input, model toggle (Haiku/Opus), **Suggest** button
    (disabled when both inputs empty or while loading, or when `aiProvider()` is
    null — then show "Add VITE_ANTHROPIC_API_KEY to .env.local").
  - Repo-fetch notice (non-blocking) + typed error messages.
  - 2 result cards (gradient preview, name, rationale, Use / Generate image /
    suggested-text-color chip).
  - **Suggest 2 more** button after results.
- **Apply gradient** → `onScreen({ background: { ...bg, type: "gradient",
  gradient: null, image: null, aiGradient: { css, name, style, angle, stops } } })`.
- **Apply image** → `onScreen({ background: { ...bg, type: "image", image: dataURL } })`.
- **Picking a preset gradient** (existing grid) must clear `aiGradient`:
  `onScreen({ background: { ...bg, gradient: g.id, aiGradient: null } })`, so a
  preset overrides a prior AI gradient.

### Changed: `.env.example`

Add `VITE_ANTHROPIC_API_KEY=`, `VITE_OPENAI_API_KEY=`, `VITE_STABILITY_API_KEY=`
with the security comment.

## Data model

`screen.background` may now carry `aiGradient: { css, name, style, angle, stops }`
when `type === "gradient"`. Backward compatible: absent on all existing
projects/templates; `backgroundCss` falls back to the preset lookup.

## Error handling

| Condition | Behavior |
|---|---|
| No Anthropic key | Suggest disabled; inline hint to add the key. |
| Both inputs empty | Suggest disabled. |
| GitHub 404 / bad URL | Non-blocking notice "Couldn't read that repo — generating from your prompt." Continue with prompt only. |
| GitHub 403 rate limit | Same non-blocking notice (rate-limit wording). Continue. |
| LLM network error | Card area shows "Couldn't reach the AI — try again." |
| LLM returns unparseable / <2 concepts | One automatic retry; then the same error. |
| No image-gen key | "Generate image" disabled with tooltip. |
| Image-gen network error | Inline "Image generation failed — try again." |

## Testing (Vitest)

Unit tests for pure helpers (no network):
- `parseGithubUrl`: full URLs, `.git`, trailing slash, deep paths, shorthand,
  non-GitHub → null.
- `extractHexColors`: 6- and 3-digit, dedupe, cap, none.
- `aiGradientCss`: linear shape, mesh shape (contains radial-gradient + base),
  CSS contains every stop, no SVG data-URI.
- `normalizeConcept` / `parseConcepts`: valid array, fenced JSON, extra objects
  clamped to 2, missing fields defaulted, invalid stops rejected, <2 valid → throws.

Network wrappers (`fetchRepoContext`, `suggestBackgrounds`, `generateImage`) tested
with a stubbed global `fetch` (vi.stubGlobal): correct URL/headers, happy-path
mapping, and typed errors for 403/404/non-ok.

`backgroundCss` (via a small exported helper or component test): returns
`aiGradient.css` when present, preset otherwise.

Target: all existing tests (92) keep passing; new tests added for the above.

## Build approach

Inline TDD execution (RED → GREEN → commit per unit), frequent commits, full
suite + `npm run build` before final commit, then a self-review pass.
