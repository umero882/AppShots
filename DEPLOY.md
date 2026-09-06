# Deploying AppShots on Coolify

AppShots is a static SPA served by a tiny Node server that also hosts the
`/api/*` proxy (the only holder of the API keys). One container does both.

- **Build:** `Dockerfile` (multi-stage) → builds `dist/`, ships a dependency-free
  Node 20 runtime.
- **Runtime port:** `3000` (also `EXPOSE`d). The server honors `$PORT`.
- **Health check:** `GET /healthz` → `200 ok` (also wired into the Docker
  `HEALTHCHECK`).

## How the pages are built

`npm run build` is three steps, not one:

1. `vite build` — the client bundle and the `dist/index.html` shell.
2. `vite build --ssr src/entry-server.jsx` — the same app, built to run in Node.
3. `node scripts/prerender.mjs` — renders every public route to its own file.

Step 3 is why `/pricing` is a real page. Before it existed the server returned
one shell for every path, so a crawler saw nine readable words and every page
carried the **homepage's canonical** — which does not hint, it names the page to
index instead. Five real pages were asking to be dropped.

Each public route is listed once, in `src/lib/seo.js`, with its title,
description and canonical. Adding a public page means adding it there **and** to
`public/sitemap.xml`; a test holds the two lists together. The prerender fails
the build if a page renders empty, if a canonical did not change, or if two
pages share a title — a prerender that quietly emitted shells again would look
exactly like a successful build.

Signed-in routes (`/dashboard`, `/editor`) are deliberately NOT prerendered.
They fall back to `dist/app-shell.html`, an empty root, so the dashboard is
never handed the landing page's markup and canonical.

## One-time setup in Coolify

1. **Connect the source.** Coolify → your project → **+ New** → **Application**.
   The repo `github.com/umero882/AppShots` is **private**, so connect it via a
   **GitHub App** source (Coolify → Sources → GitHub) and select the repo. (A
   public-repo URL + deploy key also works.)

2. **Build pack: Dockerfile.** Coolify auto-detects the `Dockerfile` at the repo
   root. No build command needed.

3. **Port:** set the application port to **3000**.

4. **Environment variables.** Two groups — the distinction matters:

   **a) Build-time (`VITE_*`)** — inlined into the browser bundle, so they must be
   set as **Build Variables** in Coolify (passed to `docker build`). The Supabase
   anon key is public (protected by Row Level Security), so this is expected:

   | Build variable | Purpose |
   |---|---|
   | `VITE_SUPABASE_URL` | your Coolify Supabase URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |

   **b) Runtime, server-only** (no `VITE_` prefix) — read by the `/api` proxy in
   the container; never reach the browser:

   | Variable | Purpose |
   |---|---|
   | `ANTHROPIC_API_KEY` | AI background suggestions (required for the AI tab) |
   | `OPENAI_API_KEY` | "Generate image" button (optional) |
   | `GITHUB_TOKEN` | read private repos in the AI tab (optional) |
   | `PEXELS_API_KEY` | image search (optional; falls back to Openverse) |

   The proxy keys are the same values as in `.env.local` (minus `VITE_`).

   > Get `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from your Coolify Supabase
   > service → **API** (or its env). They configure AppShots' real backend.

5. **Domain + SSL.** Set the FQDN under Settings → Domains; Coolify provisions a
   Let's Encrypt certificate automatically via its proxy.

6. **Health check (optional but recommended).** Path `/healthz`, port `3000`.

7. **Deploy.** Click **Deploy**. Coolify builds the image and starts the
   container. Subsequent pushes to `main` auto-deploy if you enable the webhook.

## Supabase backend (one-time)

AppShots uses the Supabase running on your Coolify for auth + project storage.

1. **Create the schema.** In Supabase → **SQL Editor**, run
   [`supabase/schema.sql`](supabase/schema.sql) (creates the `projects` table +
   Row Level Security so each user only sees their own projects).
2. **Disable email confirmation** (or configure SMTP): Supabase → Authentication
   → Sign-In/Providers → turn **off** "Confirm email", so sign-up logs the user
   straight in. Otherwise new accounts can't sign in until they confirm.
3. **Allow the app origin:** Supabase → Authentication → URL Configuration → add
   your AppShots domain (and the self-hosted Supabase should allow CORS from it).
4. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as **Build Variables**
   (step 4a above). With them present, AppShots auto-switches from the
   localStorage backend to Supabase (`BACKEND_MODE === "supabase"`).

## Notes

- **Without the `VITE_SUPABASE_*` vars**, AppShots falls back to the localStorage
  backend (browser-only, no sync) — handy for a quick preview deploy.
- **Keys never ship to the browser.** The client calls same-origin `/api/*`;
  only the container's env holds the secrets. Verified: `dist/` contains no key
  strings.
- **TLS:** the container talks to Anthropic/OpenAI/GitHub/Pexels directly over
  HTTPS — no Avast interception on the Linux VPS, so no extra CA config needed
  (that was only a local-dev concern).

## Run the production build locally

```bash
npm run build
# set the keys for this shell, then:
PORT=3000 node server/index.js
# open http://localhost:3000
```

## Push-to-deploy (how it's wired)

The Coolify app pulls the repo with a **deploy key**, not a GitHub App, so GitHub has
to notify Coolify itself. A repo webhook posts `push` events (JSON) to
`https://coolify.nextechlabs.tech/webhooks/source/github/events/manual`, signed with
the secret stored on the app under **Webhooks → GitHub** (`manual_webhook_secret_github`).
With that in place `git push origin main` deploys automatically; the Coolify API
(`GET /deploy?uuid=…&force=true`) or the dashboard's **Redeploy** button remain as
manual fallbacks. If pushes stop deploying, check the webhook's recent deliveries on
GitHub (Settings → Webhooks) — a non-200 response from Coolify is the usual tell.

## Backups

Everything stateful lives on the `/app/data` volume: the blob store (`blobs/`) and the
Stripe entitlement records (`subscriptions/`). Firestore and Stripe hold their own
copies of auth/projects and billing, but losing this volume would show every paying
customer as Free until they re-sync and would 404 uploaded assets.

`server/backup-cli.js` (zero-dep: pure-Node tar+gzip and a SigV4 S3 client) snapshots
the volume to S3-compatible object storage — **Cloudflare R2** in production
(bucket `appshots-backups`, endpoint `https://<account-id>.r2.cloudflarestorage.com`,
`BACKUP_S3_REGION=auto`):

| Command | What it does |
|---|---|
| `npm run backup` | tar+gzip `/app/data` → `s3://<bucket>/appshots/appshots-<UTC>.tar.gz`, then delete snapshots older than `BACKUP_RETENTION_DAYS` (never the newest) |
| `npm run backup:list` | list snapshots |
| `npm run backup:check` | verify env + bucket access without writing |
| `npm run backup:restore -- <key> [--into <dir>]` | download and extract (default target: the data dir) |

**Schedule:** Coolify → application → *Scheduled Tasks* → add
`nightly-backup`, command `node server/backup-cli.js backup`, frequency `0 3 * * *`
(03:00 UTC daily). It runs inside the app container, so it sees the volume and the
`BACKUP_*` env vars.

**Restore drill:** `npm run backup:list`, pick a key, then
`npm run backup:restore -- appshots/appshots-….tar.gz --into /tmp/restore` to inspect,
or without `--into` to overwrite the live data dir (stop writes first: Coolify → Stop).

## SEO and social cards

Everything a crawler or link unfurler needs is a static file in `public/`, so it
ships with the normal build — no runtime work.

| File | Purpose |
|---|---|
| `public/robots.txt` | Marketing + legal pages crawlable; `/api/`, `/auth/action` and every signed-in route disallowed. Advertises the sitemap. |
| `public/sitemap.xml` | The six public URLs, absolute, on `https://appshots.nextechlabs.tech`. |
| `public/og-cover.png` | 1200×630 OpenGraph / Twitter card. |
| `public/googleeb75106204844a1b.html` | Google Search Console ownership token. |

**Do not delete `googleeb75106204844a1b.html`.** Google re-checks it periodically;
removing the file silently un-verifies the property and Search Console stops
reporting. Its body must stay byte-exact (no trailing newline, no wrapper).

**Adding a page:** put public routes in `public/sitemap.xml`; put signed-in routes
behind a `Disallow` in `public/robots.txt`. `src/__tests__/seo.test.js` reads the
`<ProtectedRoute>` list straight out of `src/App.jsx` and fails if a new protected
route is not disallowed, or if the sitemap ever advertises one.

**Regenerating the card:** `npm run og:image` (needs Chrome; `CHROME_PATH` overrides
the lookup). It renders `scripts/og/make-og-image.mjs` headless at exactly 1200×630
with Inter and the logo inlined, and overwrites `public/og-cover.png` — commit the
result. Keep the dimensions in step with the `og:image:width/height` tags; the test
checks the real PNG header against them.

**Cache policy** lives in `server/static.js`. Only Vite's content-hashed `/assets`
bundles get `immutable`; `.html/.txt/.xml/.json/.webmanifest` are `no-cache` and
named images get a day. Anything with a stable URL whose contents change on deploy
must stay out of the immutable branch.

## Metered API endpoints

`/api/ai/suggest`, `/api/ai/image`, `/api/ai/translate`, `/api/search` and
`/api/app-store` all spend money — the first three call Anthropic/OpenAI/Stability
with our keys, the last two proxy outbound requests from our IP. They are gated in
`server/router.js`:

1. **Authentication.** A valid Firebase ID token is required
   (`Authorization: Bearer …`); the browser attaches it via `src/lib/apiClient.js`.
   No token, expired token, forged token → `401 unauthorized`, and the upstream call
   is never made. `/api/capabilities` stays open (it returns booleans only).
2. **Quota.** One unit is charged against the caller's daily allowance *before* the
   upstream request, using the plan from their server-owned Stripe entitlement —
   never a plan claimed by the client. Defaults per day (`server/usage.js`):

   | | suggest | image | translate | search | appStore |
   |---|---|---|---|---|---|
   | free | 20 | 5 | — | 100 | 100 |
   | pro | 200 | 60 | 400 | 600 | 600 |
   | team | 600 | 200 | 1200 | 2000 | 2000 |

3. **Paid-only features.** The pricing page sells "Localization sets" under Pro, so
   `/api/ai/translate` answers `403 plan-required` on the free plan — a different
   answer from "you ran out", because waiting will never fix it. `PAID_ONLY` in
   `server/usage.js` is the list; keep it in step with `src/pages/Pricing.jsx`. The
   editor shows the control locked with an upgrade link rather than hiding it, and
   locale sets already saved in a free user's project keep working — only new
   translation requests are gated.
4. **Burst.** 20 metered requests per user per rolling minute → `429 rate-limited`.
5. **Instance ceiling.** A whole-app daily cap per kind (images default 300) →
   `503 capacity-reached`. This is the backstop a per-user quota cannot provide:
   throwaway signups each get their own free allowance, but not their own ceiling.

If the upstream call fails after being charged, the unit is refunded — our outage
must not eat someone's allowance.

Counters are JSON files under `USAGE_DIR` (default `<cwd>/data/usage` →
`/app/data/usage` in the container, on the persistent volume, so they survive
redeploys and land in the nightly backup). They are keyed by UTC day; a new day
starts a new bucket, so there is nothing to reset or clean up. Tuning knobs are in
`.env.example` under *Usage quotas*.

Blocked calls surface in the UI through `describeApiError()`, which names what ran
out, the limit, when it resets, and offers Pro to free users.

**Local development:** the metered endpoints need a signed-in Firebase user. That is
already true of the pages that call them (the editor and tracker are behind
`ProtectedRoute`), but running with `VITE_FIREBASE_DISABLED=1` will make them 401 —
by design; the gate fails closed.
