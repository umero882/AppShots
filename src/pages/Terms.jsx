import LegalPage from "../components/LegalPage";

const CONTACT = "nextechlabs.dev@gmail.com";

const sections = [
  {
    id: "agreement",
    title: "The agreement",
    body: (
      <>
        <p>
          These Terms of Service ("Terms") are a contract between you and <strong>Next Tech Labs</strong>, Sharjah Media
          City, Sharjah, United Arab Emirates ("we", "us"), covering your use of AppShots at{" "}
          <a href="https://appshots.nextechlabs.tech">appshots.nextechlabs.tech</a> (the "Service"). By creating an
          account or using the Service you agree to these Terms and to our{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>
        <p>
          You must be at least 16 years old. If you use the Service on behalf of a company, you confirm you have
          authority to bind it, and "you" includes that company.
        </p>
      </>
    ),
  },
  {
    id: "service",
    title: "The service",
    body: (
      <>
        <p>
          AppShots lets you design and export App Store and Google Play screenshots: device frames, backgrounds,
          captions, templates, localisation sets, and related tools. Some features use third-party AI or image
          providers.
        </p>
        <p>
          The <strong>Free</strong> plan includes a limited feature set and adds an AppShots watermark to exports. Paid
          plans remove the watermark and unlock additional features as described on the{" "}
          <a href="/pricing">pricing page</a>. We may change, add, or retire features over time; if a change materially
          reduces a paid plan, we will tell you in advance.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <ul>
        <li>Provide accurate information and keep it up to date.</li>
        <li>Keep your password confidential. You are responsible for all activity under your account.</li>
        <li>Tell us promptly at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> if you suspect unauthorised access.</li>
        <li>One person per account. Team plans provide the number of seats stated on the pricing page.</li>
      </ul>
    ),
  },
  {
    id: "billing",
    title: "Subscriptions, billing, and refunds",
    body: (
      <>
        <ul>
          <li>
            <strong>Plans and prices</strong> are shown on the <a href="/pricing">pricing page</a> in US dollars.
            Applicable taxes are calculated at checkout and added where required.
          </li>
          <li>
            <strong>Auto-renewal.</strong> Subscriptions renew automatically at the end of each monthly or yearly period
            until cancelled. Payments are processed by Stripe; by subscribing you authorise recurring charges to your
            payment method.
          </li>
          <li>
            <strong>Cancelling.</strong> Cancel any time from Settings → Manage billing. Your plan stays active until the
            end of the period you have paid for, then moves to Free. We do not refund the unused part of a period.
          </li>
          <li>
            <strong>Refunds.</strong> If something went wrong with a charge, email us within 14 days and we will sort
            it out. Beyond that, fees are non-refundable except where the law requires otherwise.
          </li>
          <li>
            <strong>Failed payments.</strong> If a renewal fails, we retry for a short grace period during which your
            plan remains active. If payment still fails, your account moves to Free. Your projects are kept.
          </li>
          <li>
            <strong>Price changes.</strong> We will give at least 30 days' notice by email before a price change affects
            an existing subscription. Continuing past that date means you accept the new price.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    body: (
      <>
        <p>
          You own the screenshots, images, text, and designs you create or upload ("Content"), and the exports you
          generate from them. You grant us a limited licence to store, process, and display your Content solely to
          provide the Service to you.
        </p>
        <p>
          You are responsible for having the rights to everything you upload and for how you use your exports,
          including compliance with Apple App Store and Google Play listing guidelines. We may remove Content that is
          illegal or violates these Terms.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>Do not:</p>
        <ul>
          <li>use the Service for anything unlawful, deceptive, or infringing;</li>
          <li>upload malware or attempt to breach, probe, or overload our systems;</li>
          <li>share accounts, resell the Service, or circumvent plan limits, watermarks, or billing;</li>
          <li>scrape or bulk-extract the Service or its templates;</li>
          <li>use AI features to generate content that is harmful, hateful, or violates our providers' policies.</li>
        </ul>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party assets and AI features",
    body: (
      <>
        <ul>
          <li>
            <strong>Stock images</strong> from Pexels and Openverse are provided under their own licences (the{" "}
            <a href="https://www.pexels.com/license/" target="_blank" rel="noreferrer">
              Pexels License
            </a>{" "}
            and the applicable Creative Commons licence). Check them before commercial use.
          </li>
          <li>
            <strong>Device frames</strong> are illustrative. Apple, iPhone, iPad, Google, Pixel, Android, and similar
            marks belong to their owners. AppShots is not affiliated with or endorsed by Apple or Google.
          </li>
          <li>
            <strong>AI-generated backgrounds and copy</strong> are produced by third-party models and may be
            inaccurate or unsuitable. Review everything before you publish it. You are responsible for AI output you
            use.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "our-ip",
    title: "Our intellectual property",
    body: (
      <p>
        The Service, including its software, templates, design system, and branding, is owned by Next Tech Labs and its
        licensors. We grant you a limited, non-exclusive, non-transferable licence to use it in line with these Terms.
        Templates may be used in your exports without attribution, but may not be redistributed as templates.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    body: (
      <p>
        You can delete your account at any time. We may suspend or terminate accounts that breach these Terms, with
        notice where practical. On termination your licence ends and we delete your Content as described in the
        Privacy Policy. Sections that by their nature should survive (payments owed, ownership, disclaimers,
        liability, governing law) do so.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers and liability",
    body: (
      <>
        <p>
          The Service is provided "as is" and "as available". To the fullest extent permitted by law we disclaim all
          warranties, express or implied, including fitness for a particular purpose and non-infringement. We do not
          guarantee that your exports will be accepted by any app store.
        </p>
        <p>
          To the fullest extent permitted by law, Next Tech Labs will not be liable for indirect, incidental, special,
          consequential, or punitive damages, or for lost profits, revenue, or data. Our total liability for any claim
          relating to the Service is limited to the amount you paid us in the 12 months before the claim (or USD 50 if
          you paid nothing). Nothing in these Terms limits liability that cannot be limited by law.
        </p>
        <p>
          You agree to indemnify us against claims arising from your Content or your breach of these Terms.
        </p>
      </>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These Terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Sharjah, and the
        courts of Sharjah have exclusive jurisdiction, without prejudice to any mandatory consumer protections you have
        where you live. Please contact us first — most issues can be resolved quickly by email.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these Terms. We will post the new version here with an updated date and, for material changes,
        notify you by email or in the app at least 14 days before they take effect. Continuing to use the Service after
        that means you accept the updated Terms.
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

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="6 September 2026"
      intro={
        <p>
          Plain-English summary: you own what you make, we own the tool, paid plans renew until you cancel, cancelling
          takes effect at the end of the paid period, and you agree to use AppShots lawfully. The full terms follow.
        </p>
      }
      sections={sections}
      related={[{ to: "/privacy", label: "Privacy Policy" }]}
    />
  );
}
