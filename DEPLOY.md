# Deploying AppShots on Coolify

AppShots is a static SPA served by a tiny Node server that also hosts the
`/api/*` proxy (the only holder of the API keys). One container does both.

- **Build:** `Dockerfile` (multi-stage) → builds `dist/`, ships a dependency-free
  Node 20 runtime.
- **Runtime port:** `3000` (also `EXPOSE`d). The server honors `$PORT`.
- **Health check:** `GET /healthz` → `200 ok` (also wired into the Docker
  `HEALTHCHECK`).

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
