/**
 * Everything the blog pages need to find their content, on the server and in
 * the browser.
 *
 * HOW AN ARTICLE REACHES THE PAGE
 * ------------------------------
 * Articles live in the AppShots blog Hasura and are baked in at build time, so
 * a reader (and a crawler) gets complete HTML with no request for data. The
 * data a page was rendered from is also written into that page as a JSON script
 * tag, which is what makes hydration match: React renders the same article the
 * server did, instead of a loading state that replaces it a moment later.
 *
 * The only asynchronous path is a client-side navigation — clicking from the
 * index to an article the current page's JSON does not contain. That fetches
 * one small file. It never runs on first load, so it cannot affect what a
 * crawler sees or how fast the page paints.
 *
 * Nothing here imports the article corpus. That matters: a static import would
 * put every article in the main bundle and make the landing page pay for the
 * blog.
 */

export const BLOG_ROOT = "/blog";

const EMPTY = { count: 0 };

/** Where an article lives. Slugs are kebab-case, enforced in the database. */
export function postPath(slug) {
  return `${BLOG_ROOT}/${slug}`;
}

/**
 * The data this page was rendered from.
 *
 * On the server the prerender assigns it per route. In the browser it is parsed
 * once out of the script tag the prerender wrote, then kept on globalThis so
 * every component sees the same object.
 */
export function blogData() {
  if (typeof globalThis !== "undefined" && globalThis.__BLOG__) return globalThis.__BLOG__;
  if (typeof document !== "undefined") {
    const el = document.getElementById("blog-data");
    if (el) {
      try {
        globalThis.__BLOG__ = JSON.parse(el.textContent || "{}");
      } catch {
        globalThis.__BLOG__ = EMPTY;
      }
      return globalThis.__BLOG__;
    }
  }
  return EMPTY;
}

/** How many articles are published. Used to decide whether to link the blog. */
export function publishedCount() {
  return blogData().count || 0;
}

/**
 * The article list. Present already on /blog; fetched once anywhere else.
 * @returns {{ready: object[]|null, load: () => Promise<object[]>}}
 */
export function indexSource() {
  const data = blogData();
  return {
    ready: Array.isArray(data.index) ? data.index : null,
    load: async () => {
      const res = await fetch(`${BLOG_ROOT}/index.json`);
      if (!res.ok) throw new Error(`blog index: ${res.status}`);
      return res.json();
    },
  };
}

/**
 * One article. Present already when this page IS that article — which is every
 * first load — and fetched only when arriving by client-side navigation.
 */
export function postSource(slug) {
  const data = blogData();
  const injected = data.post && data.post.slug === slug ? data.post : null;
  return {
    ready: injected,
    load: async () => {
      const res = await fetch(`${BLOG_ROOT}/posts/${encodeURIComponent(slug)}.json`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`blog post ${slug}: ${res.status}`);
      return res.json();
    },
  };
}

/**
 * A date a reader recognises.
 *
 * Fixed to UTC on purpose. The server renders in UTC and the browser would
 * render in the reader's zone, so an article published near midnight would
 * hydrate to a different date than it was rendered with — React throws that
 * render away and the date visibly changes. A published date does not need to
 * be local to be useful.
 */
export function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Machine-readable date for <time datetime> and structured data. */
export function isoDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * The two hues an article's cover is built from, derived from its slug so a
 * given article always looks the same and a list of them reads as composed
 * rather than random.
 *
 * Shared on purpose: scripts/blog/cover.mjs paints the real cover image from
 * these same numbers, so the gradient below — which is what a reader sees while
 * the image is still arriving — is the same two colours the image opens on.
 * Change the maths here and both move together.
 */
const HUE_START = 205; // deep cyan-blue
const HUE_SPAN = 95; // ...through the brand indigo (#6366f1, ~239°) to violet

export function coverHues(slug) {
  let hash = 0;
  for (const ch of String(slug)) hash = (hash * 31 + ch.codePointAt(0)) % 360;
  // Confined to a band around the brand hue rather than the whole wheel. The
  // whole wheel is what it used to be, and it put articles on olive and brown —
  // colours that read as a muddy photograph rather than as this product, and
  // that a hash lands on roughly a third of the time.
  const base = hash % HUE_SPAN;
  return { from: HUE_START + base, to: HUE_START + ((base + 38) % HUE_SPAN) };
}

/** The CSS behind a cover image while it loads, and for anything without one. */
export function coverGradient(slug) {
  const { from, to } = coverHues(slug);
  return `linear-gradient(135deg, hsl(${from} 70% 24%), hsl(${to} 65% 14%))`;
}
