import LegalPage from "../components/LegalPage";

const CONTACT = "nextechlabs.dev@gmail.com";

const sections = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          AppShots (<a href="https://appshots.nextechlabs.tech">appshots.nextechlabs.tech</a>) is operated by{" "}
          <strong>Next Tech Labs</strong>, Sharjah Media City, Sharjah, United Arab Emirates ("we", "us"). We are the
          data controller for the personal data described in this policy.
        </p>
        <p>
          Questions or requests about your data: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <p>We collect only what the service needs to work:</p>
        <ul>
          <li>
            <strong>Account details</strong> — your name, email address, and password. Passwords are handled by Google
            Firebase Authentication and are never visible to us in plain text. You may also upload a profile picture.
          </li>
          <li>
            <strong>Your content</strong> — the projects you create, the app screenshots and images you upload, brand
            assets, and the text you type into your designs. This is stored so you can come back to it.
          </li>
          <li>
            <strong>Billing information</strong> — handled entirely by Stripe. We receive your Stripe customer ID,
            subscription status, plan, and billing country. We never see or store your full card number.
          </li>
          <li>
            <strong>Usage and device data</strong> — pages visited, features used, browser and device type, approximate
            location derived from your IP address, and analytics identifiers, collected through Google Analytics for
            Firebase.
          </li>
          <li>
            <strong>Server logs</strong> — IP address, user agent, timestamps, and error details, kept briefly for
            security and debugging.
          </li>
          <li>
            <strong>AI feature inputs</strong> — when you use the AI background or copy features, the prompt, app
            description, or public repository URL you provide is sent to our AI providers to generate a result.
          </li>
          <li>
            <strong>Search terms</strong> — image search queries are sent to Pexels or Openverse to fetch results.
          </li>
          <li>
            <strong>Support messages</strong> — anything you send us by email.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: (
      <>
        <ul>
          <li>To provide and maintain AppShots: sign you in, save your projects, render and export your screenshots.</li>
          <li>To run subscriptions: process payments, calculate tax, send receipts, and prevent fraud.</li>
          <li>To keep the service secure and to investigate abuse.</li>
          <li>To answer support requests and send transactional emails such as password resets.</li>
          <li>To understand how the product is used so we can improve it.</li>
          <li>To meet legal, tax, and accounting obligations.</li>
        </ul>
        <p>
          Where data-protection law requires a legal basis (for example under the GDPR or UK GDPR), we rely on:
          performance of our contract with you (providing the service and billing), our legitimate interests (security,
          product improvement, support), your consent (analytics cookies where consent is required), and compliance
          with legal obligations.
        </p>
        <p>We do not sell your personal data and we do not use it for third-party advertising.</p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>We use a small number of service providers who process data on our behalf:</p>
        <ul>
          <li>
            <strong>Google Firebase / Google Cloud</strong> — authentication, project storage (Firestore), and
            analytics. Data may be stored on Google servers in the United States or other regions.
          </li>
          <li>
            <strong>Stripe</strong> — payments, invoicing, tax calculation, and fraud prevention (Stripe Radar). See{" "}
            <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">
              Stripe's privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Anthropic, OpenAI, and Stability AI</strong> — only when you use an AI feature, and only the input
            needed for that request. We do not send your account details to them.
          </li>
          <li>
            <strong>Pexels and Openverse</strong> — image search queries.
          </li>
          <li>
            <strong>Hostinger</strong> — delivery of transactional emails such as password resets.
          </li>
          <li>
            <strong>Our hosting provider</strong> — the servers that run the AppShots application and store uploaded
            files.
          </li>
        </ul>
        <p>
          We may also disclose data when required by law, to protect our rights or users, or as part of a merger or
          acquisition (in which case this policy continues to apply to your data).
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: (
      <>
        <ul>
          <li>
            <strong>Essential</strong> — Firebase keeps your sign-in session in your browser's storage, and we store
            preferences such as your editor settings locally. The service does not work without these.
          </li>
          <li>
            <strong>Analytics</strong> — Google Analytics for Firebase sets cookies and identifiers to measure usage.
            You can block these with your browser settings, a content blocker, or Google's{" "}
            <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">
              opt-out add-on
            </a>
            ; AppShots keeps working without them.
          </li>
        </ul>
        <p>We do not use advertising or cross-site tracking cookies.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <>
        <ul>
          <li>Account and content data: for as long as your account exists. Delete your account and we delete it.</li>
          <li>Backups: removed data may persist in backups for up to 30 days.</li>
          <li>Billing records: as long as tax and accounting law requires, typically several years.</li>
          <li>Server logs: up to 30 days.</li>
          <li>AI feature inputs: not stored by us beyond the request; providers apply their own retention.</li>
        </ul>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <>
        <p>
          All traffic is encrypted with TLS. Authentication is handled by Firebase. API keys and secrets live only on
          our servers and are never shipped to your browser. Card details go straight to Stripe and never touch our
          systems. No method is perfectly secure, so please use a strong, unique password and tell us right away if you
          suspect a problem.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li>access the personal data we hold about you and receive a copy;</li>
          <li>correct inaccurate data (most of it can be edited in Settings);</li>
          <li>delete your account and data;</li>
          <li>receive your data in a portable format (your projects can be exported from the app);</li>
          <li>object to or restrict certain processing, and withdraw consent where processing is based on consent;</li>
          <li>complain to a data-protection authority, for example your local authority in the EEA or the UK.</li>
        </ul>
        <p>
          To exercise any of these, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from the address on your account.
          We respond within 30 days. Residents of California and similar jurisdictions: we do not sell or share
          personal information for cross-context behavioural advertising.
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International transfers",
    body: (
      <p>
        We are based in the United Arab Emirates and our providers operate globally, including in the United States. Where
        we transfer personal data out of the EEA, the UK, or similar jurisdictions, we rely on our providers' standard
        contractual clauses and equivalent safeguards.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        AppShots is not directed at children under 16, and we do not knowingly collect their data. If you believe a
        child has created an account, contact us and we will remove it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We will post any changes here and update the date at the top. For significant changes we will notify you by
        email or in the app before they take effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Next Tech Labs, Sharjah Media City, Sharjah, United Arab Emirates ·{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> ·{" "}
        <a href="https://nextechlabs.org" target="_blank" rel="noreferrer">
          nextechlabs.org
        </a>
      </p>
    ),
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="6 September 2026"
      intro={
        <p>
          This policy explains what personal data AppShots collects, why, and what you can do about it. The short
          version: we collect what is needed to run your account and billing, we use trusted providers to do it, we
          don't sell your data, and you can delete everything by deleting your account.
        </p>
      }
      sections={sections}
      related={[{ to: "/terms", label: "Terms of Service" }]}
    />
  );
}
