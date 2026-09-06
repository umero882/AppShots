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

## Account deletion

`/privacy` promises "delete your account and we delete it", so `DELETE /api/account`
is real and self-service (Settings → Delete account). The work is split by who holds
the credentials:

| Step | Who | What |
|---|---|---|
| 1 | client | Re-authenticate (password, or a Google popup) |
| 2 | server | Cancel every live Stripe subscription, then delete the customer |
| 3 | server | Delete the user's blobs, entitlement record and usage counters |
| 4 | client | Delete the user's Firestore projects + `users/{uid}` doc |
| 5 | client | Delete the Firebase Auth user |

The order is the design. Identity is confirmed **before** anything is deleted, because
Firebase refuses to delete a stale session and finding that out afterwards would leave
a working login for an emptied account. **Billing is cancelled before any storage** —
an account that is gone but still charging is the worst possible half-failure — and if
that step fails the call aborts with `502 billing-cleanup-failed` having deleted
nothing. The auth record goes last: it is what signs every other call. Each step is
idempotent, so a retry after a partial failure finishes the job.

**Retained on purpose:** Stripe invoices and charges. Deleting the customer strips the
name, email and card while the transaction records stay, because tax law requires
keeping them — `/privacy` → *How long we keep it* says so, and the confirm dialog
repeats it. Removed data may also sit in the nightly backup for up to 30 days.

The endpoint is never metered: nobody should be rate-limited out of leaving.

## Error reporting and uptime

Two different questions: *did something break for a user?* (Sentry) and *is the site
answering at all?* (the uptime check). One cannot answer the other — a dead container
sends no error reports.

### Errors → Sentry

`server/sentry.js` speaks Sentry's HTTP envelope API directly. There is no SDK because
the runtime image ships **no node_modules** (see the Dockerfile), and the same reason
rules out `@sentry/react` bloating the browser bundle — the client posts to our own
`/api/client-error`, which forwards server-side with the signed-in user attached.

Reporting is off until `SENTRY_DSN` is set, so dev and tests stay silent. What gets
reported:

| Source | Wired in |
|---|---|
| Any unhandled throw in the HTTP server | `server/index.js` outer catch |
| API errors that map to 5xx (never 4xx — those are the caller's) | `server/router.js` |
| `uncaughtException` / `unhandledRejection` | `installProcessHandlers()` |
| React render crashes | `src/components/ErrorBoundary.jsx` |
| `window.onerror`, unhandled promise rejections | `src/lib/errorReporter.js` |

The rules it lives by: never throw, never block a response, never queue without bound
(30 events/minute, then it drops and reports the count), and strip credentials —
`authorization`, `cookie`, `stripe-signature` are redacted and query strings are cut
off entirely, because that is where `oobCode` and emails live. Browser reports are
deduped and capped at 5 per session; the server caps the endpoint at 60/minute.

### Uptime

`npm run uptime` (`scripts/ops/uptime-check.mjs`) — **run it somewhere other than the
app's own server.** A monitor that dies with the thing it monitors reports nothing.

It probes liveness (`/healthz`), readiness (`/readyz`), the app shell (`/`) and the API
gate (`/api/ai/suggest` must answer 401 — an API that started serving anonymous AI
calls is an outage of a different kind). It emails through the same Hostinger mailbox
the app already uses, so no third-party monitoring account is needed, and it alerts on
*transitions only*: one mail going down, one coming back. Alerts that arrive every five
minutes get filtered, and then they are not alerts.

Env: `ALERT_EMAIL_TO` plus the `SMTP_*` block. Exit code is 0 up / 1 down, so any
scheduler can act on it. Two sensible homes: Windows Task Scheduler on the office PC
(fine, but it only watches while that PC is on) or a cron on one of the other VPSes,
which is the real answer.

### `/healthz` vs `/readyz`

`/healthz` is liveness: dependency-free, 200 whenever the process answers. Docker's
HEALTHCHECK restarts the container on failure, so it must never go red for a reason a
restart cannot fix. `/readyz` is readiness: it writes and deletes a probe file to prove
the **persistent volume is actually mounted and writable**, which is the failure that
otherwise looks perfectly healthy while silently losing uploads and entitlements.

## Storage quotas

The 25 MB per-file cap said nothing about how many files, so any signed-in account
could fill the volume one upload at a time — and every byte is copied to R2 nightly.
`server/blob.js` now enforces a total per plan: **100 MB free, 5 GB Pro, 20 GB Team**
(`STORAGE_QUOTA_FREE` / `_PRO` / `_TEAM` to change). Over the limit answers `413
storage-quota-exceeded` with `plan`, `limit`, `used` — the client turns that into a
sentence naming the limit and what to do about it, because "Couldn't save the project"
is the worst possible message for the one failure a user can actually fix.

The running total lives in `blobs/.quota/<uid>.json` and is a **cache, not the truth**:
if it is missing (first upload after this shipped, or a restore from backup) it is
rebuilt by scanning the blob metadata. Deleting a blob returns its bytes; deleting an
account removes the counter with the blobs. The quota is checked after the body is
read, not before — browsers do not send a reliable length up front, and refusing on a
guess would reject valid uploads.

## Product analytics

Google Analytics for Firebase (`G-1M5WMT27SC`) was already initialised and already
collected page views. What was missing was the funnel — traffic without drop-off tells
you nothing about a paid product — so `src/lib/analytics.js` adds the events GA4 cannot
infer, using GA4's **recommended names** so the built-in reports work without custom
exploration:

| Event | Fired when | Where |
|---|---|---|
| `sign_up` | an account is created | `src/lib/auth.jsx` |
| `project_created` | first real act of use (blank vs template) | `src/pages/Dashboard.jsx` |
| `export_completed` | screenshots delivered (single / zip / all sizes) | `src/pages/Editor.jsx` |
| `begin_checkout` | hosted Checkout opened, with the price shown | `src/lib/auth.jsx` |
| `purchase` | **the server confirms the plan** after returning from Checkout | `src/pages/Dashboard.jsx` |

`purchase` deliberately does not fire on the Stripe redirect: that happens whether or
not the payment settled, so trusting it would inflate conversion with abandoned and
failed payments. It waits for the entitlement reconcile.

Events carry no personal data — no email, name or uid — and never throw; an ad-blocker
eating analytics is the normal case, not an error.

**Reading the funnel:** GA4 → Reports → Engagement → Events, or Explore → Funnel
exploration with `sign_up → project_created → begin_checkout → purchase`. New event
names take up to 24 hours to appear in the standard reports; DebugView shows them
immediately.
