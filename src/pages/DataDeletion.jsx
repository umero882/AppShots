import LegalPage from "../components/LegalPage";

const CONTACT = "nextechlabs.dev@gmail.com";

/**
 * The "data deletion instructions URL" the app platforms ask for.
 *
 * Meta, Google Play and Apple all require a page that anyone can open — no
 * account, no sign-in — that says how to have your data deleted and what
 * happens when you do. /privacy already covers deletion in a clause, but a
 * reviewer needs one address that is only about this, and a person who cannot
 * sign in needs a route that does not start with "sign in".
 *
 * Everything below is written from what the code actually does — the cascade in
 * server/account.js and the client half in src/lib/backend.js — because this is
 * a promise a platform will hold us to. If that flow changes, this changes.
 */
const sections = [
  {
    id: "delete-it-yourself",
    title: "Delete your account yourself",
    body: (
      <>
        <p>
          This is the fastest route and it needs nobody's help. It is permanent and takes effect immediately.
        </p>
        <ol>
          <li>
            Sign in at <a href="https://appshots.nextechlabs.tech/login">appshots.nextechlabs.tech/login</a>.
          </li>
          <li>
            Open <b>Settings</b> from the menu under your avatar.
          </li>
          <li>
            Scroll to <b>Delete account</b> at the bottom of the page.
          </li>
          <li>
            Confirm it is you — enter your password, or re-approve with Google if that is how you sign in. This step
            exists so that nobody else can close your account from a session you left open.
          </li>
        </ol>
        <p>
          Your subscription is cancelled first. If that fails, nothing else is deleted and you are told — an account
          you can no longer reach that is still being billed is the one outcome worth refusing.
        </p>
      </>
    ),
  },
  {
    id: "what-is-deleted",
    title: "What is deleted",
    body: (
      <>
        <p>Deleting your account removes all of the following:</p>
        <ul>
          <li>
            <b>Your projects and designs</b> — every screenshot set, layout and piece of text you created.
          </li>
          <li>
            <b>Everything you uploaded</b> — app screenshots, brand assets, logos, and your profile picture.
          </li>
          <li>
            <b>Your account record</b> — name, email address and profile details.
          </li>
          <li>
            <b>Your sign-in</b> — the authentication record itself, so the email address can be used to register
            again from scratch.
          </li>
          <li>
            <b>Your subscription</b> — cancelled at once, and your customer record at Stripe is deleted, which
            removes your name, email and card details from it.
          </li>
          <li>
            <b>Usage counters</b> — the per-day tallies behind your plan's limits.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "what-is-kept",
    title: "What is kept, and why",
    body: (
      <>
        <p>Two things outlive the deletion, and neither is content you made:</p>
        <ul>
          <li>
            <b>Invoices and payment records</b>, if you ever paid. Tax and accounting law requires keeping the
            transaction itself, typically for several years. Deleting the Stripe customer strips the personal details
            from around it — what remains is the record of a payment, not a profile of you.
          </li>
          <li>
            <b>Backups and server logs</b>, briefly. Deleted data can persist in encrypted backups for up to 30 days
            and in server logs for up to 30 days, after which both are overwritten in the ordinary cycle. Nothing is
            restored from a backup to bring an account back.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-long",
    title: "How long it takes",
    body: (
      <>
        <ul>
          <li>
            <b>Immediately</b> — your projects, uploads, account and sign-in are gone as soon as the deletion
            finishes, and the subscription is already cancelled.
          </li>
          <li>
            <b>Within 30 days</b> — copies in backups and logs age out.
          </li>
          <li>
            <b>Within 30 days</b> — a request sent by email, from the point we can confirm it is you.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "cannot-sign-in",
    title: "If you cannot sign in",
    body: (
      <>
        <p>
          You do not need access to your account to have it deleted. Email{" "}
          <a href={`mailto:${CONTACT}?subject=Data%20deletion%20request`}>{CONTACT}</a> with the subject{" "}
          <b>Data deletion request</b>, and tell us the email address the account uses.
        </p>
        <p>
          Send it from that address if you still can — it is the quickest way for us to be sure the request is yours.
          If you cannot, say so and we will find another way to confirm it. We will not delete an account on an
          unverified request, because that would make deletion a way to attack someone else's account.
        </p>
        <p>We confirm in writing when it is done, and always within 30 days.</p>
      </>
    ),
  },
  {
    id: "part-of-your-data",
    title: "Deleting some of your data, but keeping your account",
    body: (
      <>
        <p>
          You do not have to close your account to remove things from it. In the app you can delete any individual
          project, which removes its designs and the images uploaded into it, and you can replace or remove your
          profile picture and brand assets in Settings. Your account, plan and remaining projects are untouched.
        </p>
      </>
    ),
  },
  {
    id: "who-to-contact",
    title: "Who to contact",
    body: (
      <>
        <p>
          AppShots is operated by <b>Next Tech Labs</b>, Sharjah Media City, Sharjah, United Arab Emirates, which is
          the data controller for the data described here.
        </p>
        <p>
          Anything about deletion, or about the data we hold:{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. The{" "}
          <a href="https://appshots.nextechlabs.tech/privacy">Privacy Policy</a> covers the rest — what is collected,
          why, and the other rights you have over it.
        </p>
      </>
    ),
  },
];

export default function DataDeletion() {
  return (
    <LegalPage
      title="Data Deletion Instructions"
      updated="8 September 2026"
      intro={
        <p>
          How to delete your AppShots account and the data in it — yourself in under a minute, or by asking us if you
          cannot sign in. This page also says exactly what is removed, what has to be kept, and how long each takes.
        </p>
      }
      sections={sections}
      related={[
        { to: "/privacy", label: "Privacy Policy" },
        { to: "/terms", label: "Terms of Service" },
      ]}
    />
  );
}
