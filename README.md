# AppShots — App Store & Google Play Screenshot Generator

A full-stack-ready clone of an app-store screenshot tool (inspired by appscreens.com),
built with **React 18 + Vite + TailwindCSS**. Turn raw app captures into polished,
store-ready screenshots with device frames, gradient backgrounds, headlines, and
PNG export — all in the browser.

> This is an original, "inspired-by" build. All copy, UI, and device frames are
> drawn from scratch (no assets copied from the original site).

## Features

- **Marketing site** — hero, features, how-it-works, and CTA sections.
- **Auth** — email/password sign-up, login, protected routes, session persistence.
- **Dashboard** — create, open, duplicate, and delete projects with live thumbnails, plus one-click **A/B style variants** (same content, distinct look, for store split-tests).
- **Template gallery** — 50+ curated starter templates across 8 categories (Minimal, Bold, Playful, Dark, Editorial, Vibrant, Gradient, Pattern), all passing a WCAG large-text contrast gate.
- **Inspiration gallery** (`/inspiration`) — public, browsable showcase of complete designs; start a project from any one.
- **App Store Tracker** (`/tracker`) — look up any competitor's live App Store screenshots + metadata (rating, genre, price, version) via Apple's official iTunes Search API; screenshots link back to the App Store for reference.
- **Editor**
  - iPhone / iPad / Pixel / Android device frames at exact, store-accepted dimensions
  - Backgrounds: gradient, solid, **patterns** (dots/grid/stripes/diagonal/checker/crosshatch), image (upload or search), and AI-generated
  - Headline + subheading with font, size, weight, alignment, color, and text effects
  - Elements: badges, shapes, arrows, emoji, a **searchable 250-icon library**, an **illustration library**, and photos
  - Layout presets (text top / bottom / centered / device only)
  - Multi-device / free-positioned / 3D-tilt mockups, photoreal frame overlays, and live WebGL 3D devices
  - Multi-screen sets with a filmstrip (add / duplicate / delete), connected-panorama backgrounds, and localization
  - Live autosave
  - **Exports**: PNG/JPEG at exact store resolution (no alpha channel), whole-set `.zip`, **"All sizes"** (render one design across every required App Store + Google Play size), copy-to-clipboard, and an animated video reel
- **Pricing** — Free / Pro / Team tiers with monthly–yearly toggle and a simulated upgrade.

## Quick start

Requires **Node.js 20+**.

```bash
npm install
npm run dev        # http://localhost:5173
```

Build for production:

```bash
npm run build
npm run preview
```

> If you see a partial `node_modules` from a previous attempt, just run
> `npm install` again (or delete the folder first) — it will reconcile.

## How the backend works

The app talks to a single **backend abstraction** (`src/lib/backend.js`). Out of the
box it uses a **localStorage** implementation, so everything (accounts, projects,
plan upgrades) works with zero setup.

When you're ready for a real backend, the abstraction is designed to swap to
**Supabase** without touching any UI code.

### Wiring Supabase (recommended)

1. `npm i @supabase/supabase-js`
2. Copy `.env.example` → `.env.local` and fill in:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
3. Create a `projects` table:
   ```sql
   create table projects (
     id uuid primary key default gen_random_uuid(),
     user_id uuid references auth.users not null,
     name text not null default 'Untitled project',
     state jsonb not null,
     created_at timestamptz default now(),
     updated_at timestamptz default now()
   );
   alter table projects enable row level security;
   create policy "own projects" on projects
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
4. In `src/lib/backend.js`, implement the same method surface
   (`signUp`, `signIn`, `signOut`, `getCurrentUser`, `listProjects`,
   `getProject`, `createProject`, `updateProject`, `deleteProject`, `upgradePlan`)
   using `supabase.auth` and `supabase.from("projects")`, then export it as `backend`.

### Wiring Stripe (payments)

The Pricing page currently simulates upgrades. To take real payments with
**Stripe Checkout (client-only)**:

1. Add `VITE_STRIPE_PUBLISHABLE_KEY` and `VITE_STRIPE_PRICE_PRO` to `.env.local`.
2. In `Pricing.jsx`'s `choose()`, redirect to Checkout instead of calling `upgrade()`:
   ```js
   import { loadStripe } from "@stripe/stripe-js";
   const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
   await stripe.redirectToCheckout({
     lineItems: [{ price: import.meta.env.VITE_STRIPE_PRICE_PRO, quantity: 1 }],
     mode: "subscription",
     successUrl: window.location.origin + "/dashboard",
     cancelUrl: window.location.origin + "/pricing",
   });
   ```
3. Use a Stripe webhook (Supabase Edge Function) to flip the user's `plan` to `pro`.

## Project structure

```
src/
  components/      Navbar, Footer, Logo, AuthShell, ScreenCanvas, ProtectedRoute
  lib/
    backend.js     data layer (localStorage now, Supabase-ready)
    auth.jsx       auth context/provider
    devices.js     device frame definitions (CSS-drawn, store dimensions)
    templates.js   gradients, fonts, layouts, default project state
    export.js      DOM → PNG export at store resolution
  pages/           Landing, Pricing, Login, Signup, Dashboard, Editor, NotFound
  App.jsx          routes
  main.jsx         entry
```

## Tech

React 18 · Vite 8 · React Router 6 · TailwindCSS 3 · Framer Motion ·
lucide-react · html-to-image · three.js.

The `/api/*` proxy (`server/handlers.js`) also holds the AI, image-search, and
App-Store-tracker endpoints; the App Store Tracker uses Apple's public iTunes
Search API and needs **no key**.

## Notes & next steps

- Google Play tracker (no official API — would require scraping; deliberately left out).
- Real device-frame PNG overlays are already supported; more bezel finishes could be added.
- Move passwords/secrets to the real backend — the local demo stores them in
  `localStorage` for convenience only; never do that in production.
