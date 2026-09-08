# Team workspaces

One subscription, five seats, one shared workspace. This is the thing the pricing
page advertised as "coming soon" for months: seats and invites, roles, a shared
project library, shared templates, and a brand kit.

---

## The one rule everything follows

**A seat grants a paid plan, so the roster must not be client-writable.**

Everything below is a consequence of that sentence. If you change one thing in
this feature, check it against that sentence first.

```
 the truth                  what the rules read              what the app shows
┌──────────────────┐       ┌──────────────────────┐       ┌────────────────────┐
│ <DATA_DIR>/teams │──────▶│ teams/{id}/members   │──────▶│ shared projects,   │
│ *.json           │ admin │ (Firestore)          │ rules │ templates          │
│ server/teams.js  │ creds │ allow write: if false│       │                    │
└──────────────────┘       └──────────────────────┘       └────────────────────┘
        │
        │ server/entitlement.js
        ▼
   quotas · storage · /api/stripe/subscription
```

- The **roster on the volume** is the truth. It sits next to the Stripe
  entitlement records, backed up nightly with the rest of `/app/data`.
- The **Firestore mirror** exists only so the security rules can authorize a
  shared project. Clients can read it and never write it, so it can only ever say
  what the volume said first.
- **Order matters.** The volume is written first, the mirror second. A failed
  mirror costs a member their shared-project access until the next read repairs
  it. A failed volume write *after* a successful mirror would hand out access
  nobody paid for — which is why it cannot happen in that order.

The mirror is **self-healing**: each team record carries `mirrorAt`, and any read
where `mirrorAt < updatedAt` retries the push. Nobody has to notice a failure.

---

## What each file does

| File | Role |
|---|---|
| `server/teams.js` | The roster, the permissions, and every `/api/team` endpoint. |
| `server/firestoreAdmin.js` | The only writer of `teams/**` in Firestore, using the service account. |
| `server/entitlement.js` | Stripe record + seat → one effective plan. |
| `server/subscriptionStore.js` | The entitlement record layer, split out of `stripe.js` so teams can read a plan without an import cycle. |
| `firestore.rules` | Turns a mirrored membership into read/write access on a project. |
| `src/lib/team.js` | API calls and the pure "which buttons are worth rendering" helpers. |
| `src/lib/teamContext.jsx` | Loads the workspace once, shares it with every screen. |
| `src/lib/teamTemplates.js` | Style-only extraction, so a template can never carry a screenshot. |
| `src/pages/Team.jsx` | Members, invites, roles, brand kit, transfer, disband. |
| `src/pages/JoinTeam.jsx` | `/join/:token` — public, so an invitee can read it before signing up. |
| `server/waitlist-cli.js` | Reads the waitlist and mails it the launch announcement. |

---

## Roles

| | Owner | Admin | Member |
|---|:---:|:---:|:---:|
| Use the shared library, templates, brand kit | ✅ | ✅ | ✅ |
| Invite / revoke invites | ✅ | ✅ | |
| Remove a **member** | ✅ | ✅ | |
| Remove an **admin** | ✅ | | |
| Edit the brand kit and workspace name | ✅ | ✅ | |
| Change roles | ✅ | | |
| Transfer ownership, disband | ✅ | | |
| Leave | — | ✅ | ✅ |

`can(role, action, targetRole)` in `server/teams.js` is the whole matrix, pure and
tested. `src/lib/team.js` mirrors it for the UI — but the UI only decides what to
*render*; a stale page can never become an escalation.

Two rules are worth their reasons:

- **An admin cannot remove another admin.** Otherwise a disagreement between two
  admins is settled by whoever clicks first.
- **The owner cannot leave or be demoted.** They hold the subscription; a
  workspace whose payer walked out is a workspace nobody is paying for. They
  transfer it or disband it, both explicit acts.

**Transfer keeps the old owner as an admin.** The Stripe subscription is still on
their card until they change it in billing, so they keep enough access to manage
what they are paying for.

---

## Seats

Five, from `TEAM_SEATS`, matching the price in `scripts/stripe/setup.mjs`.

**A pending invite holds a seat.** Without that, five invites to a five-seat team
all succeed and the last person to accept is turned away by an error they can do
nothing about. Revoking an invite, or letting it expire, gives the seat back.

An invite is addressed to an inbox: accepting it with a different account is
refused (`invite-wrong-email`). A forwarded link must not seat a stranger.

---

## The flow

1. Someone buys Team → Stripe webhook writes their entitlement record.
2. Their next `GET /api/team` **creates the workspace automatically**, named from
   their email domain (`ada@acme.com` → "Acme"; free-mail domains fall back to
   "Ada's team"). The purchase is the intent — making them click "create a
   workspace" afterwards is a step that can only be got wrong.
3. They invite by email. The server emails a `/join/<token>` link and returns it
   too, so a mail outage never loses the seat reservation.
4. The invitee opens the link **signed out** and sees the workspace name, who
   invited them, and what they would get. "Join Acme on AppShots" is a reason to
   make an account; "sign in to see what this link is" is not.
5. They accept → seated → `server/entitlement.js` now answers `team` for them,
   with `via: "seat"`.

---

## What a seat holder sees

`GET /api/stripe/subscription` returns their **effective** plan, not their
invoice — otherwise the client would go on watermarking exports their team is
paying not to have. The response carries `via`, and the UI uses it:

- Settings shows "Through your seat in Acme — billed to the workspace owner", and
  a link to the workspace instead of "Manage billing" (the portal would answer
  `no-customer`).
- The pricing page marks Team as "Your team's plan", and still lets them buy a
  plan of their own if they ever want one.
- No renewal date, no cancel button. The card is not theirs.

---

## Shared projects

A project gains an optional `teamId`. The rules then allow:

- **read** — the author, or any member of that team
- **update** — the same, but `userId` can never change and `teamId` can only
  point at a team the caller is actually in
- **delete** — the author alone, even in a shared library. A teammate cannot
  delete the state blob hanging off the document (the blob store is owner-only),
  so letting them delete the document would orphan bytes charged to someone
  else's quota forever.

Sharing is a toggle on your own project cards in the dashboard, and the "Team
library" tab is a separate query — a teammate's project was never in your
personal list.

**Known residue:** when a teammate saves a shared project whose state is large
enough to live in the blob store, the new blob is uploaded under *their*
credentials and the author's superseded blob cannot be deleted by them. It stays,
charged to the author. Single-author saves clean up after themselves.

---

## Shared templates

Stored at `teams/{id}/templates/{id}` and written by clients — members add, the
author and managers delete. They carry **look, never content**: background, type,
layout, device. Two reasons, both load-bearing:

- nobody publishes an unreleased app design to the whole company by saving a
  template, and
- Firestore rejects any indexed value over 1500 bytes, so a pasted data-URL would
  fail the write. `storableBackground()` drops an uploaded background back to its
  gradient rather than failing the save.

---

## Brand kit

Colours, fonts and a logo on the team document, edited by owners and admins,
surfaced one click from the editor's colour pickers — the point of a brand kit is
that nobody pastes a hex code out of a doc.

`sanitizeBrand()` is strict on purpose: CSS hex is 3, 4, 6 or 8 digits (nothing in
between, so `#12345` is rejected), fonts must look like editor font ids, and the
logo must be a short URL — a data-URL would blow the indexed-field limit on the
mirror write, so the client uploads to the blob store first.

---

## Deploying it

1. **Set `FIREBASE_SERVICE_ACCOUNT`** (the branded auth emails already need it).
   Without it, seats/roles/billing/brand kit work and the Team page says shared
   projects and templates are unavailable — degraded, never half-working.
2. **Publish `firestore.rules`** — `npm run rules:deploy` (the repo pins
   `appshots-76a56` in `.firebaserc`, so it cannot publish to another project by
   accident), or Firestore Database → Rules → paste → Publish in the console.
   `npm run rules:check` compiles them without publishing. Shared projects 403
   until the rules are live, while seats, roles and billing look perfectly fine
   — which is what makes this easy to miss.
3. **Check `UNAVAILABLE_PLANS` is unset** (it defaults to empty now). Set it back
   to `team` to stop selling without a deploy.
4. **Confirm the Stripe prices exist in LIVE mode**: `npm run stripe:setup`
   creates `team_monthly` / `team_yearly`. Selling a plan whose price is missing
   answers `price-not-found-run-setup-script`.
5. **Decide `STORAGE_QUOTA_TEAM`** — see the note in DEPLOY.md; it is per seat now.
6. **Mail the waitlist**: `npm run waitlist:announce -- --dry-run` first.

## Env

| Var | Default | Notes |
|---|---|---|
| `TEAM_SEATS` | `5` | Keep in step with the pricing page and the Stripe price. |
| `TEAM_INVITE_TTL_DAYS` | `14` | |
| `TEAM_INVITE_MAX_PER_MINUTE` | `10` | Instance-wide. |
| `TEAM_DIR` | `<DATA_DIR>/teams` | Must be on the mounted volume. |
| `PUBLIC_URL` | request host | Origin for invite links. |
| `FIREBASE_SERVICE_ACCOUNT` | — | Required for shared projects and templates. |
| `SMTP_*`, `EMAIL_FROM` | — | Invite and announcement emails. |

## Tests

`server/teams.test.js` is the one to read first — it is written as the argument
for each rule, not just its behaviour. `server/entitlement.test.js` covers the
single function that can hand somebody a paid plan.

```bash
npx vitest run server/teams.test.js server/entitlement.test.js \
  server/firestoreAdmin.test.js server/waitlist-cli.test.js \
  src/lib/__tests__/team.test.js src/lib/__tests__/teamTemplates.test.js
```
