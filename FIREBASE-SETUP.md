# Firebase backend — setup

AppShots now persists **accounts and projects** to Firebase project
**`appshots-76a56`** (Auth + Firestore). The web config is baked into
`src/lib/firebase.js` (a public client identifier, not a secret), so the code
works with **no env vars** — but the Firebase **console** must be configured for
sign-up/save to actually work.

## One-time console setup (required)

Do these in the [Firebase console](https://console.firebase.google.com/project/appshots-76a56):

1. **Enable Email/Password auth**
   Authentication → Sign-in method → **Email/Password** → Enable → Save.
   *(Without this, sign-up fails with "Email/password sign-in isn't enabled …".)*

2. **Create the Firestore database**
   Firestore Database → Create database → Production mode → pick a region → Enable.

3. **Publish the security rules** (owner-only access — critical)
   Firestore Database → **Rules** → paste the contents of
   [`firestore.rules`](./firestore.rules) → **Publish**.
   *(The default rules either deny everything or allow everyone — both wrong.)*

That's it. No composite index is needed — projects are filtered by owner and
sorted client-side.

## Data model

| Collection        | Doc         | Fields                                                                    |
| ----------------- | ----------- | ------------------------------------------------------------------------ |
| `users/{uid}`     | per user    | `name`, `email`, `plan` (`free`/`pro`), `avatar`, `createdAt`            |
| `projects/{id}`   | per project | `userId`, `name`, `createdAt`, `updatedAt` (ms), **and** `state` inline **or** `stateBlob` URL |

## How it's wired

- `src/lib/firebase.js` — lazy Auth SDK init from baked config (`VITE_FIREBASE_*` overrides).
- `src/lib/backend.js` → `makeFirebaseBackend()` — implements the shared `backend`
  contract. **Auth** uses the SDK; **Firestore** uses the **REST API** (`/v1`) with
  the user's ID token, because the streaming Web SDK hangs behind some networks
  (see the CRITICAL note above). Selection precedence:
  **Firebase (default) → Supabase (if configured) → localStorage**.
- Disabled automatically under tests, and manually via `VITE_FIREBASE_DISABLED=1`.

## Large projects: same-origin blob store

Firestore docs cap at **1 MB**, but a project's `state` embeds full-res screenshot
data-URLs and can be much larger. So the backend stores project state **hybrid**:

- **≤ 700 KB** → inline in the Firestore `projects/{id}.state` field (as before).
- **> 700 KB** → uploaded to the app's **own server** at `POST /api/blob`, with only
  the returned same-origin URL kept in `projects/{id}.stateBlob`. Loaded back
  transparently on `getProject`/`listProjects`.

Why the app's own server and not Firebase Storage? In the affected networks,
`firebasestorage.googleapis.com` is blocked too (it hangs like Firestore
streaming did). Same-origin blob URLs are always reachable and never taint the
export canvas (images stay data-URLs inside the blob).

- `server/blob.js` — `POST /api/blob` (auth: Firebase ID token), `GET /api/blob/{id}`
  (public, unguessable id), `DELETE` (owner). Stored on disk under `BLOB_DIR`.
- `server/firebaseAuth.js` — verifies the ID token (RS256 vs Google certs) server-side.

## Production (Coolify)

1. **Client build** — nothing to set; the baked Firebase config ships in the bundle.
2. **Persistent volume (REQUIRED for large projects)** — the blob store writes to
   `BLOB_DIR` (`/app/data/blobs` in the image). **Mount a Coolify persistent volume
   at `/app/data`**, or blobs (large projects) are lost on every redeploy. Small
   projects live in Firestore and are unaffected.
   *(If you skip the volume, small projects still work; large projects save but
   don't survive a redeploy.)*
3. The server must be able to reach `www.googleapis.com` to fetch token-signing
   certs (Coolify's network can; a normal deploy is fine). Cert fetch has an 8 s
   timeout so it fails fast rather than hanging if ever unreachable.
