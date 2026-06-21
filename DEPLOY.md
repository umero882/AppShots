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

4. **Environment variables** (Settings → Environment Variables). These are
   **runtime, server-only** — do NOT use a `VITE_` prefix, and never commit them:

   | Variable | Purpose |
   |---|---|
   | `ANTHROPIC_API_KEY` | AI background suggestions (required for the AI tab) |
   | `OPENAI_API_KEY` | "Generate image" button (optional) |
   | `GITHUB_TOKEN` | read private repos in the AI tab (optional) |
   | `PEXELS_API_KEY` | image search (optional; falls back to Openverse) |

   Paste the values you have in `.env.local` (the same keys, minus the `VITE_`
   prefix — they're already named correctly there). Mark them as runtime
   (not build-time) variables.

5. **Domain + SSL.** Set the FQDN under Settings → Domains; Coolify provisions a
   Let's Encrypt certificate automatically via its proxy.

6. **Health check (optional but recommended).** Path `/healthz`, port `3000`.

7. **Deploy.** Click **Deploy**. Coolify builds the image and starts the
   container. Subsequent pushes to `main` auto-deploy if you enable the webhook.

## Notes

- **No database to host.** Projects currently live in the browser
  (`localStorage`). The "backend" here is the key proxy + static serving. If you
  want projects to sync across devices, that's a separate task (wire `backend.js`
  to Firebase/Supabase) — ask and I'll scope it.
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
