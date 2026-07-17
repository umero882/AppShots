# Stripe subscription billing — AppShots

Real subscription billing for the **Pro** and **Team** plans, using Stripe hosted
Checkout + the Customer Portal. Built with **only Node built-ins** (fetch + crypto)
to match the zero-dependency backend — there is no `stripe` npm package.

- **Checkout** (hosted, subscription mode) — the purchase flow
- **Customer Portal** (hosted) — self-service upgrade / downgrade / cancel / card update
- **Billing** — Pro `$9/mo · $84/yr`, Team `$29/mo · $276/yr` (flat rate; Team bundles 5 seats)
- **Stripe Tax** — `automatic_tax` on Checkout (auto-on, degrades gracefully)
- **Radar** — fraud protection (automatic on every charge; nothing to wire)
- **Smart Retries** — Stripe-managed dunning for failed renewals (Dashboard-configured)

## How entitlement works (important)

The user's plan is **server-owned**, not read from the client-writable Firestore
`plan` field. Stripe is the source of truth:

1. The client calls `POST /api/stripe/create-checkout-session` → server creates a
   Checkout Session for the user's Stripe customer and returns the hosted URL.
2. After payment, Stripe redirects to `/dashboard?checkout=success&session_id=…`.
   The dashboard calls `GET /api/stripe/subscription?session_id=…`, which
   **live-reconciles** from Stripe (so the upgrade shows instantly, without waiting
   for the webhook) and writes a small record under `SUB_DIR`.
3. `POST /api/stripe/webhook` keeps that record in sync for renewals, cancellations,
   and payment failures.
4. Every auth resolution reads `GET /api/stripe/subscription` and sets `user.plan`
   from it. A client can no longer grant itself a paid plan.

Records live on the **persistent `data/` volume** (`SUB_DIR=/app/data/subscriptions`,
next to the blob store). Mount that volume in Coolify or entitlements vanish on redeploy.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/stripe/create-checkout-session` | Firebase ID token | Start hosted Checkout → `{ url }` |
| POST | `/api/stripe/create-portal-session` | Firebase ID token | Open billing portal → `{ url }` |
| GET | `/api/stripe/subscription` | Firebase ID token | Entitlement; `?sync=1` / `?session_id=` to reconcile live |
| POST | `/api/stripe/webhook` | Stripe signature | Lifecycle sync |

## One-time setup

### 1. Environment variables

Local: put these in `.env.local` (gitignored). Production: set them as **runtime**
env vars on the Coolify service (never build args — the secret must not enter the bundle).

```
STRIPE_SECRET_KEY=sk_test_...          # test key for now; sk_live_... to go live
STRIPE_WEBHOOK_SECRET=whsec_...        # from `stripe listen` (local) or the Dashboard (prod)
STRIPE_AUTOMATIC_TAX=true              # set "false" to disable Stripe Tax
APP_URL=https://appshots.nextechlabs.tech   # required in prod; optional locally
```

### 2. Create the products & prices (idempotent)

```
npm run stripe:setup        # reads STRIPE_SECRET_KEY from .env.local
```

Creates **AppShots Pro** / **AppShots Team** and four prices with stable
`lookup_key`s (`pro_monthly`, `pro_yearly`, `team_monthly`, `team_yearly`). Safe to
re-run; run it again with a `sk_live_` key to build the same catalog in live mode.
The app references prices by lookup_key, so no price IDs need copying.

### 3. Webhook endpoint

**Local** — forward events with the Stripe CLI and paste the printed secret into `.env.local`:

```
stripe listen --forward-to localhost:5173/api/stripe/webhook
# prints: whsec_...  → STRIPE_WEBHOOK_SECRET
```

**Production** — Dashboard → Developers → Webhooks → Add endpoint:
`https://appshots.nextechlabs.tech/api/stripe/webhook`, subscribe to at least:
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.paid`, `invoice.payment_failed`. Reveal the signing secret → set it as
`STRIPE_WEBHOOK_SECRET`. (Until this is set, the webhook rejects everything —
fail-closed — but the post-checkout `?sync=1` reconcile still upgrades users.)

### 4. Dashboard toggles

- **Customer Portal** — Settings → Billing → Customer portal → **Activate** (already active on this account).
- **Stripe Tax** — Settings → Tax: set your origin address + registrations. Checkout
  still works if Tax isn't finished — it retries once without tax.
- **Radar** — on by default. Tune rules under Radar if desired.
- **Smart Retries / dunning** — Settings → Billing → Revenue recovery.

## Testing (test mode)

Use Stripe test cards on the hosted Checkout page:

- `4242 4242 4242 4242` — succeeds
- `4000 0000 0000 9995` — declined (insufficient funds)
- `4000 0025 0000 3155` — requires 3-D Secure authentication

Any future expiry, any CVC/ZIP. After paying you land back on the dashboard with the
plan unlocked; verify self-service in **Settings → Manage billing**.

## Going live

1. Swap `STRIPE_SECRET_KEY` to `sk_live_...` and re-run `npm run stripe:setup`.
2. Add a **live** webhook endpoint and set the live `STRIPE_WEBHOOK_SECRET`.
3. Confirm `APP_URL` and the persistent `/app/data` volume are set in Coolify.
