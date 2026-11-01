/**
 * Pricing-page questions. One list drives both the visible accordion and the
 * FAQPage structured data, so what a search result shows can never differ from
 * what the page says. Every answer restates something the plans or the Terms
 * already state; none introduces a promise of its own.
 */
export const PRICING_FAQ = [
  {
    q: "Is AppShots really free?",
    a: "Yes. The Free plan has unlimited projects, every device frame and gradient or solid backgrounds, and needs no credit card. Free exports carry a small “Made with AppShots” badge.",
  },
  {
    q: "What does Pro add?",
    a: "Pro removes the badge and adds full-resolution exports, localization sets, priority rendering and bulk .zip export. It is $9 a month, or $84 a year (22% less).",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes. Cancel from Settings → Manage billing. Your plan stays active until the end of the period you have paid for, then moves to Free. The unused part of a period is not refunded.",
  },
  {
    q: "What if I was charged by mistake?",
    a: "Email us within 14 days and we will sort it out. The Terms of Service have the details.",
  },
  {
    q: "How does the Team plan work?",
    a: "One workspace with five seats and one bill, $29 a month. Teammates join by email invite at no extra cost, and share projects, templates and a brand kit.",
  },
  {
    q: "Which screenshot sizes can I export?",
    a: "Every current App Store and Google Play size, plus the iOS 27 product page header, search card and In-App Event art. The full list, with a checker for your own screenshot, is on the screenshot sizes page.",
  },
];

export function faqJsonLd(items = PRICING_FAQ) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
}
