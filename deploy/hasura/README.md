# AppShots blog backend — Hasura + Postgres

The blog pipeline that writes AppShots articles runs in PyRunner, and every
script in it speaks Hasura GraphQL. AppShots itself has no SQL database: the app
runs on Firebase (Firestore for projects, Firebase Auth for sign-in), and the
`VITE_SUPABASE_*` path in `src/lib/backend.js` is an unconfigured fallback, not
the live backend. So the blog needed a database of its own, and this is it.

**It is deliberately its own stack.** Its own Postgres, its own admin secret,
its own volume, in the AppShots project in Coolify. It is not the First Bite
Hasura at `hasura.nextechlabs.tech`, not the Ethiopian Maids Hasura at
`api.ethiopianmaids.com`, and not attached to any Supabase. Two products sharing
one database means one blast radius for every migration, restore and permission
mistake, and this is the cheap moment to avoid that.

## Where it actually lives

Coolify → project **AppShots** → service **appshots-hasura**, server
`localhost` (the same box as the AppShots app and PyRunner). The compose file
in this directory is the reviewable copy of what is pasted there — Coolify
stores the running version, so **change it here, regenerate, and paste it back**
rather than editing only one of the two.

```
node deploy/hasura/build-compose.mjs > deploy/hasura/docker-compose.yml
```

## What deploying does

Three containers:

| container  | what it is                                                    |
|------------|---------------------------------------------------------------|
| `postgres` | Postgres 16, one named volume, nothing else uses it           |
| `hasura`   | Hasura CE v2.49, the GraphQL endpoint and console             |
| `schema`   | runs once per deploy, applies the tables and the permissions   |

The `schema` container is the part worth understanding. It POSTs two payloads to
Hasura: the DDL, and then the **entire** metadata via `replace_metadata`. That
second call is declarative — it states what the tracked tables and permissions
should be rather than adding to whatever is there — so it is idempotent, and a
redeploy is also how you put the permissions back if someone changes them by
hand in the console.

It reads the admin secret from its own environment. The secret is a Coolify
`SERVICE_PASSWORD_*` variable: Coolify generates it, Coolify stores it, and it
is never typed, committed or pasted anywhere.

## The three roles

| role          | can                                                                 |
|---------------|---------------------------------------------------------------------|
| `anonymous`   | read **published** articles and the public settings. Nothing else.   |
| `content_bot` | insert and update articles, pinned to `draft` / `pending_review`     |
| `site_admin`  | everything, including publishing                                     |

`anonymous` is also Hasura's unauthorized role, which is the point: the AppShots
build can fetch published posts with no secret at all, so no credential has to
travel into a build environment to render the blog.

`content_bot` is what PyRunner's `blog-publisher` authenticates as. It cannot
publish — the insert and update checks pin it to drafts, so the pipeline files
articles and a person decides what goes live. Its `SELECT` allowlist is six
columns, which is not stinginess: Hasura refuses to return a column a role
cannot read, and the publisher's upsert returns `{ id slug }`, so without the
narrow select the *write* fails.

Two details that have cost time before and are load-bearing here:

- **`status` is in the anonymous column list.** Hasura only lets a role
  reference columns it can `SELECT` inside a `where` clause, and any query for
  published posts filters on `status`. Leave it out and the query is rejected
  outright. It leaks nothing — the row filter already pins every visible row to
  published.
- **`content_bot` has an update permission at all.** Hasura only puts the
  `on_conflict` argument in the schema when the role can update, and
  `on_conflict` is what makes the publisher's upsert idempotent.

## Things that will look odd and are correct

- **`audience` allows `sponsor`, `maid`, `agency`, `general`.** That vocabulary
  belongs to the other product this pipeline was built for, and PyRunner's
  `blog-publisher` has it hardcoded — it validates its own `BLOG_AUDIENCE`
  against exactly those four before sending anything. Narrowing the CHECK to
  AppShots' own words would make the publisher's rows fail the constraint. Run
  it with `BLOG_AUDIENCE=general`.
- **No `$` anywhere in the SQL.** Docker Compose interpolates `${...}`, and
  Coolify re-renders the file before Compose sees it, so a literal `$` has an
  ambiguous number of escapes. The slug and category CHECKs anchor with `\A`
  and `\Z` instead of `^` and `$`, and the two trigger functions use
  single-quoted bodies instead of `$$` dollar quoting. Same meaning, no
  character anything downstream wants to eat.
- **`ios_url` and `android_url` exist and stay NULL.** The columns come from the
  shared schema; AppShots is a web app with no store listing, and its CTA points
  at signup.

## The domain

Currently `https://hasura-appshots.76.13.240.144.sslip.io` — sslip.io resolves
any `<label>.<ip>.sslip.io` to that IP, so the endpoint worked the moment it
deployed with no DNS work.

That is a starting point, not the destination. It depends on a third-party
resolver and it hardcodes the server's IP into every consumer. Add an A record
for `hasura-appshots.nextechlabs.tech` → `76.13.240.144`, then change the
domain on the Hasura container in Coolify and redeploy.
