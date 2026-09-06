/**
 * One description of every public page, used twice.
 *
 * The build prerenders each route from this map (scripts/prerender.mjs), so the
 * HTML a crawler is handed already carries that page's own title, description
 * and canonical. The running app re-applies the same values on client-side
 * navigation (components/SeoSync.jsx), so what a person sees in their tab and
 * what Google reads can never disagree.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every route used to serve the one index.html: the same title on all six
 * pages, and a canonical pointing at the homepage from every one of them. A
 * canonical is not a hint — it names the page Google should index instead. So
 * /pricing, /inspiration, /privacy, /signup and /terms were each asking to be
 * dropped in favour of "/", and they were. Distinct metadata per route is the
 * whole fix; the prerendered body is what makes each page worth indexing once
 * it stops pointing elsewhere.
 *
 * Adding a public page means adding it HERE and to public/sitemap.xml. The
 * prerender walks this map, so a page missing from it silently keeps the old
 * behaviour — a test in src/__tests__ holds the two lists together.
 */

export const SITE_URL = "https://appshots.nextechlabs.tech";
export const SITE_NAME = "AppShots";
export const OG_IMAGE = `${SITE_URL}/og-cover.png`;

const DEFAULT_OG_ALT = "AppShots — store screenshots, done in minutes";

/**
 * path -> { title, description, ogTitle?, ogDescription? }
 *
 * `title` is the whole <title>, not a fragment: a suffix rule ("… — AppShots")
 * reads well on a subpage and badly on the homepage, and the homepage is the
 * one that has to carry the head term.
 *
 * Descriptions are written to be the search result, not a summary of the file:
 * under about 155 characters, saying what the page lets you do.
 */
export const PAGES = {
  "/": {
    title: "AppShots — App Store & Google Play Screenshot Generator",
    description:
      "Create store-ready App Store and Google Play screenshots in minutes — device frames, templates, gradients and pixel-exact PNG exports, in your browser.",
  },
  "/pricing": {
    title: "Pricing — AppShots Screenshot Generator",
    description:
      "Free, Pro and Team plans for the AppShots screenshot generator. Start free with no card, and pay only when you need every store size and larger exports.",
  },
  "/inspiration": {
    title: "App Store Screenshot Examples — AppShots",
    description:
      "Browse finished app store screenshot designs across eight styles, then open any one as the starting point for your own — no blank canvas to fill.",
  },
  "/signup": {
    title: "Create your free AppShots account",
    description:
      "Sign up free and make your first set of App Store and Google Play screenshots today. No card required, and your projects save as you work.",
  },
  "/privacy": {
    title: "Privacy Policy — AppShots",
    description:
      "What AppShots collects, why it collects it, how long it is kept, and how to have it deleted.",
  },
  "/terms": {
    title: "Terms of Service — AppShots",
    description: "The terms you agree to when you use AppShots, in plain language.",
  },
};

/** Every public route, in sitemap order. */
export const PUBLIC_ROUTES = Object.keys(PAGES);

/** Trailing slashes and query strings are the same page; "" is the homepage. */
export function normalisePath(pathname = "/") {
  const path = String(pathname).split("?")[0].split("#")[0];
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * The metadata for a path, or null when the path is not a public page — a
 * signed-in screen has nothing to say to a crawler, and robots.txt already
 * keeps them out. Callers leave the document alone in that case rather than
 * inventing a title for it.
 */
export function seoFor(pathname) {
  const page = PAGES[normalisePath(pathname)];
  if (!page) return null;
  const path = normalisePath(pathname);
  return {
    ...page,
    path,
    canonical: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`,
    ogTitle: page.ogTitle || page.title,
    ogDescription: page.ogDescription || page.description,
    ogImage: OG_IMAGE,
    ogImageAlt: DEFAULT_OG_ALT,
    siteName: SITE_NAME,
  };
}
