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
description and canonical. Adding a public page means adding it there — the
sitemap is generated from the same list (`scripts/sitemap.mjs`), so the two can
no longer disagree. The prerender fails the build if a page renders empty, if a
canonical did not change, or if two pages share a title — a prerender that
quietly emitted shells again would look exactly like a successful build.

Signed-in routes (`/dashboard`, `/editor`) are deliberately NOT prerendered.
They fall back to `dist/app-shell.html`, an empty root, so the dashboard is
never handed the landing page's markup and canonical.

## The blog

Articles live in the AppShots blog Hasura (`deploy/hasura/`) and are written
there by the PyRunner pipeline. Step 3 above fetches the **published** ones —
anonymously, no credential — renders each one's markdown to HTML, and gives it
its own page at `/blog/<slug>`, with its own title, canonical and `BlogPosting`
structured data. The article data is also written into the page as JSON so
React hydrates the article the server rendered rather than replacing it, and to
`dist/blog/posts/<slug>.json` for readers who arrive by clicking rather than by
loading a URL.

**An article goes live on the next deploy, not the moment it is published.** The
blog is static files: Hasura being down cannot take it offline, and no reader
ever waits on a database. The cost is that publishing needs a rebuild, and
PyRunner's `blog-deploy` script is what asks for it — every ten minutes it
compares the published articles against `/blog/index.json`, which is this build
saying what it shipped, and calls Coolify's deploy API when the two differ. So
an approved article appears within about ten minutes, and a build that failed
is noticed and retried rather than leaving the site quietly behind.

That deploy URL **must** carry `force=true`. Nothing in the repository changed
between one article and the next, so every layer of the image is a cache hit
including the one that fetches the articles: the deploy would finish green
having shipped the articles it already had. `blog-deploy` says so on every run
if the URL is missing it.

Two behaviours worth knowing before they surprise you:

- **A failed fetch stops the build.** The tempting alternative is to warn and
  carry on, which is how the same blog silently vanished from a sibling
  project: the fetch failed, the build passed, the deploy went out, and every
  article 404'd until a person noticed. Set `BLOG_OPTIONAL=1` to ship without
  the blog on purpose. Zero published articles is not a failure — it is where
  the blog starts, and `/blog` stays out of the sitemap until there is
  something on it.
- **Raw HTML in an article body is dropped, not escaped or rendered.**
  `scripts/blog/markdown.mjs` is the only thing standing between a compromised
  publishing credential and stored XSS on our own origin, and article bodies
  have no legitimate use for markup. Unsafe link and image URLs go the same way.

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

**Failures are emailed.** A snapshot that has been failing quietly for a month is
discovered on the day it is needed, so `server/backup-cli.js` mails `ALERT_EMAIL_TO`
(with the `SMTP_*` block) when a run fails — failures only, because an alert that
arrives every night gets filtered and then is not an alert. Unset, a failure is just a
non-zero exit and a line in a task log. Set it with `npm run coolify:env` below.

**Schedule:** Coolify → application → *Scheduled Tasks* → add
`nightly-backup`, command `node server/backup-cli.js backup`, frequency `0 3 * * *`
(03:00 UTC daily). It runs inside the app container, so it sees the volume and the
`BACKUP_*` env vars.

**Restore drill:** `npm run backup:list`, pick a key, then
`npm run backup:restore -- appshots/appshots-….tar.gz --into /tmp/restore` to inspect,
or without `--into` to overwrite the live data dir (stop writes first: Coolify → Stop).

**Last drill — 2026-09-06, passed.** `appshots-2026-09-06T15-15-16Z.tar.gz` (83.56 MB
compressed) restored to a scratch directory: 431 files, **214 blobs / 127.79 MB
uncompressed**, 214 metadata files, **zero orphans** (no blob without its metadata and
none the other way), every metadata file parseable, 1 entitlement record and 2 customer
links, all valid JSON. An untested backup is not a backup; re-run this after any change
to `server/tarball.js` or `server/backup-cli.js`.

That snapshot predates the first live purchase by four minutes, so its entitlement
record reads `plan=free` for an account that is now Pro — which is the system working as
designed, not a gap: Stripe is the source of truth and `GET /api/stripe/subscription?sync=1`
rebuilds the record from it. The blobs are the part that only exists here.

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
   upstream request, using the plan from `server/entitlement.js` — their own Stripe
   record or a Team seat, never a plan claimed by the client. Defaults per day (`server/usage.js`):

   | | suggest | image | translate | search | appStore |
   |---|---|---|---|---|---|
   | free | 20 | 5 | — | 100 | 100 |
   | pro | 200 | 60 | 400 | 600 | 600 |
   | team | 600 | 200 | 1200 | 2000 | 2000 |

   Since Team shipped, `team` is the plan of **every seat holder**, not one account —
   a five-seat workspace can spend five times the row above. `GLOBAL_DAILY` in the
   same file is the instance-wide backstop that keeps that bounded.

3. **Paid-only features.** The pricing page sells "Localization sets" under Pro, so
   `/api/ai/translate` answers `403 plan-required` on the free plan — a different
   answer from "you ran out", because waiting will never fix it. `PAID_ONLY` in
   `server/usage.js` is the list; keep it in step with `src/pages/Pricing.jsx`. The
   editor shows the control locked with an upgrade link rather than hiding it, and
   locale sets already saved in a free user's project keep working — only new
   translation requests are gated.
4. **Verified email.** A **free** account must have a verified address to use
   `suggest`, `image` or `translate` → `403 email-verification-required`. Per-user
   quotas assume the user is a person, and nothing else stopped one person signing up
   with twenty made-up addresses for twenty free allowances. Scoped to the free plan
   deliberately: the gate exists to stop throwaway accounts farming free AI, and
   someone who has paid is not that — blocking a paying customer over an unclicked
   link would be a worse bug than the one it prevents. The cheap proxies (`search`,
   `appStore`) stay open so a new account feels alive immediately, and only an
   explicit `email_verified: false` blocks, never a missing claim.
5. **Burst.** 20 metered requests per user per rolling minute → `429 rate-limited`.
6. **Instance ceiling.** A whole-app daily cap per kind (images default 300) →
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

## Setting environment variables

Env vars are the one part of this deployment that is not in the repo, so they drift
silently — `ALERT_EMAIL_TO` was simply never set on the app, which is why a failed
backup or a waitlist signup would have gone unreported with nothing to notice.

```bash
npm run coolify:env -- --dry-run ALERT_EMAIL_TO=you@example.com   # show the change
npm run coolify:env -- ALERT_EMAIL_TO=you@example.com             # set it
npm run coolify:env -- --restart ALERT_EMAIL_TO=you@example.com   # set + restart
```

Needs `COOLIFY_API_TOKEN` in `.env.local` (Coolify → Keys & Tokens → API tokens).
Several products share this Coolify, so the script **refuses to act unless exactly one
application matches** and prints which one it picked; set `COOLIFY_APP_UUID` to be
explicit. A running container keeps the old environment until it restarts, which is
opt-in — the script says so rather than letting you find out an hour later.

The API is IP-allowlisted and the office IP is dynamic; a 401/403 usually means the
current IP needs re-adding, not that the token is wrong.

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
`server/blob.js` now enforces a total per plan: **100 MB free, 5 GB Pro, 5 GB per Team seat**
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

## Team workspaces

Team was on the pricing page — and purchasable at $29/month — while none of what it
promised existed, so it became a waitlist. It is now built and sold: `UNAVAILABLE_PLANS`
defaults to empty, and the Pricing card is an ordinary Checkout card.

The full design is in **[TEAM-SETUP.md](TEAM-SETUP.md)**. The parts that matter for a
deploy:

- **Membership is server-owned.** The roster is a JSON file per team under
  `<DATA_DIR>/teams/` (`server/teams.js`), beside the Stripe records — because a seat
  grants a paid plan, and anything that grants a plan must not be client-writable.
- **The Firestore mirror is what the rules read.** Every roster change is written to
  `teams/{id}/members/{uid}` with the service account (`server/firestoreAdmin.js`);
  `firestore.rules` makes those documents read-only to every client. **Requires
  `FIREBASE_SERVICE_ACCOUNT`** — without it seats, roles, billing and the brand kit
  still work, but shared projects and templates are reported as unavailable rather
  than half-working. The volume is written first and the mirror second, so a failed
  mirror costs shared access until the next read repairs it, never the other way round.
- **Publish `firestore.rules` after deploying**, or shared projects 403.
- **Entitlement is resolved in one place.** `server/entitlement.js` combines the
  caller's own Stripe record with any seat they hold, and quotas, storage and the
  `/api/stripe/subscription` response all read it. Grep that one file to answer "how
  could someone get a paid plan?".

| Env | Default | What it does |
|---|---|---|
| `TEAM_SEATS` | `5` | Seats sold with the plan. Match the pricing page. |
| `TEAM_INVITE_TTL_DAYS` | `14` | How long an invite link lives. |
| `TEAM_INVITE_MAX_PER_MINUTE` | `10` | Instance-wide invite-send budget. |
| `TEAM_DIR` | `<DATA_DIR>/teams` | Roster storage. Must be on the volume. |
| `PUBLIC_URL` | request host | Origin used to build invite links. |
| `UNAVAILABLE_PLANS` | *(empty)* | Kill switch — set to `team` to stop selling it. |

**Storage is per seat.** `STORAGE_QUOTA_TEAM` is charged against each member's own
counter, not once per workspace, so the real ceiling is that number times the seat
count. It was 20 GB — set when "team" meant one account — which five seats turned
into 100 GB of volume and nightly R2 backup for $29/month, against 5 GB for a $9 Pro
user. It is now **5 GB per seat**, the same as Pro and exactly what the pricing card
sells ("Everything in Pro, for all 5 seats"), so a full workspace holds 25 GB. Raise
`STORAGE_QUOTA_TEAM` if that proves tight — it is an env var, no deploy needed.

The daily AI quotas are per seat too, but `USAGE_GLOBAL_IMAGE_CAP` (300/day) already
backstops the expensive one instance-wide.

### The waitlist, and telling it

**`POST /api/waitlist` is retired.** It collected intent for Team while Team did not
exist; Team exists, so an open public write path for it collects nothing anybody would
act on. `server/waitlist.js` is now a read-only archive — the JSONL files stay on the
volume because the pricing page promised those people an email, and deleting the list
would quietly break that promise. The intake side (rate limiting, idempotency, the
owner notification) is in git history if a future unbuilt plan needs it back.

```bash
npm run waitlist                 # who is on it, and who has been told
npm run waitlist:export          # → team-waitlist.csv
npm run waitlist:announce -- --dry-run     # print the recipients, send nothing
npm run waitlist:announce -- --limit 5     # a first batch to watch
npm run waitlist:announce                  # the rest
```

Every delivered address is recorded in `team.announced.json` **as it sends**, so a
crash halfway through resumes rather than mailing anyone twice.

## Analytics consent

GA4 sets cookies, `/privacy` said consent was obtained "where required", and nothing
ever asked. That gap is closed with **opt-in for everyone**, not opt-in for visitors we
guess are in the EEA: browser-side geolocation is a guess (timezone, language, a VPN),
and a wrong guess means tracking someone who never agreed. Asking everyone costs some
analytics volume and is defensible in every jurisdiction.

- `src/lib/consent.js` — the stored answer (`granted` / `denied` / unanswered) plus a
  subscription so the change takes effect without a reload. Every failure path answers
  **no**: unreadable storage, a value we did not write, no storage at all (the Node
  prerender). Consent is never inferred.
- `src/components/CookieBanner.jsx` — Accept and Decline identical in size and weight.
  A "reject" that is harder to find than "accept" is not consent, and regulators treat
  it as a dark pattern. There is no "manage vendors" screen because there is one
  vendor and no ad tech. It renders only after mount, so no banner is baked into the
  prerendered HTML and none flashes at someone who already chose.
- **`initAnalytics()` in `src/lib/analytics.js` is the only place GA4 starts**, and it
  checks consent first. It used to start inside `getFirebase()`, which is exactly wrong:
  the SDK sets its cookies the moment it loads, so "load now, decide later" is not a
  thing. `track()` also re-checks, so nothing can slip out through a stale instance.
- Footer → **Cookie preferences** clears the answer and brings the banner back.
  Consent has to be as easy to withdraw as it was to give.

Essential storage — the sign-in session, editor preferences — is out of scope and not
optional: the product does not function without it, and it is disclosed as such.
