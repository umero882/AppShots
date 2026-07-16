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

| Collection        | Doc         | Fields                                                     |
| ----------------- | ----------- | ---------------------------------------------------------- |
| `users/{uid}`     | per user    | `name`, `email`, `plan` (`free`/`pro`), `createdAt`        |
| `projects/{id}`   | per project | `userId`, `name`, `state`, `createdAt`, `updatedAt` (ms)   |

## How it's wired

- `src/lib/firebase.js` — lazy SDK init from baked config (`VITE_FIREBASE_*` overrides).
- `src/lib/backend.js` → `makeFirebaseBackend()` — implements the shared `backend`
  contract (auth + projects). Selection precedence:
  **Firebase (default) → Supabase (if configured) → localStorage**.
- Disabled automatically under tests, and manually via `VITE_FIREBASE_DISABLED=1`.

## Production (Coolify)

Nothing to set — the baked config ships in the client bundle, so a normal deploy
of `main` is enough. (If you ever move to a different Firebase project, set the
`VITE_FIREBASE_*` build args in Coolify instead of editing code.)
