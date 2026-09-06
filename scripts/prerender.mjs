/**
 * Renders every public route to its own HTML file, so a crawler is handed the
 * page instead of an empty shell.
 *
 * WHAT WAS WRONG
 * --------------
 * The build produced one index.html and the server returned it for every path.
 * Two consequences, both invisible in a browser:
 *   1. The response carried 9 readable words and one script tag. Google's first
 *      look at /pricing found nothing to index.
 *   2. Every page carried the homepage's <title> and, worse, its canonical —
 *      which tells Google to index the homepage INSTEAD of this page. Five
 *      real pages were asking to be dropped.
 *
 * WHAT THIS DOES
 * --------------
 * For each route in src/lib/seo.js it renders the React tree in Node, drops the
 * markup into the built shell, and rewrites the head to that page's own title,
 * description and canonical. The client bundle then hydrates the same tree, so
 * nothing about the app changes for a person with JavaScript.
 *
 * It also renders the blog. Articles are not in the page map — they arrive in
 * the database between deploys — so they are fetched here and each one becomes
 * its own directory, with the article's data written into the page as JSON so
 * hydration matches, and a copy on disk for client-side navigation.
 *
 * It runs as part of `npm run build`, after the client and SSR builds. It FAILS
 * the build rather than writing a page that would be worse than none: an empty
 * body, a canonical that did not change, or two pages sharing a title all stop
 * it. A prerender that silently produced shells again would look exactly like a
 * successful build, which is how this went unnoticed the first time.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fetchPosts } from "./blog/posts.mjs";
import { buildSitemap } from "./sitemap.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const SSR = path.join(ROOT, "dist-ssr", "entry-server.js");

/** The shortest body we will accept. A shell is ~0; a real page is thousands. */
const MIN_MARKUP = 500;

function fail(message) {
  console.error(`\n[prerender] ${message}\n`);
  process.exit(1);
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Replace a meta tag's content, or add the tag when the shell has none.
 * `[^>]*` spans newlines, which matters: index.html formats these tags across
 * several lines.
 */
function setMeta(html, attr, name, value) {
  if (!value) return html;
  const tag = `<meta ${attr}="${name}" content="${escapeAttr(value)}" />`;
  const existing = new RegExp(`<meta[^>]*\\b${attr}="${name}"[^>]*>`, "i");
  return existing.test(html) ? html.replace(existing, tag) : html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function setTitle(html, title) {
  const tag = `<title>${escapeAttr(title)}</title>`;
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, tag)
    : html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function setCanonical(html, href) {
  const tag = `<link rel="canonical" href="${escapeAttr(href)}" />`;
  const existing = /<link[^>]*rel="canonical"[^>]*>/i;
  return existing.test(html) ? html.replace(existing, tag) : html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

/**
 * Embed JSON in the page.
 *
 * `<` is escaped rather than the string being dropped in raw: a body
 * containing the characters `</script>` would otherwise end the tag early and
 * spill the rest of the article into the document as markup. Articles are
 * machine-written prose about app stores, so this is unlikely and it is also
 * the entire reason the escape exists.
 */
function jsonScript(id, type, data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script id="${id}" type="${type}">${json}</script>`;
}

function beforeBodyEnd(html, snippet) {
  return html.replace(/<\/body>/i, `    ${snippet}\n  </body>`);
}

function beforeHeadEnd(html, snippet) {
  return html.replace(/<\/head>/i, `    ${snippet}\n  </head>`);
}

/** "/" -> dist/index.html, "/pricing" -> dist/pricing/index.html */
function outputFor(route) {
  return route === "/" ? path.join(DIST, "index.html") : path.join(DIST, route.replace(/^\//, ""), "index.html");
}

/** What the index page and the cards need — everything except the body. */
function listEntry(post) {
  const { html, ...rest } = post;
  return rest;
}

/**
 * Structured data for an article. Google uses it to show the headline and date
 * in a result; without it an article is just another page.
 */
function articleLd(post, seo, siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": seo.canonical },
    image: seo.ogImage,
    author: { "@type": "Organization", name: "Next Tech Labs", url: siteUrl },
    publisher: {
      "@type": "Organization",
      name: "AppShots",
      url: siteUrl,
    },
  };
}

async function main() {
  if (!existsSync(path.join(DIST, "index.html"))) {
    fail("dist/index.html is missing — run the client build first (`vite build`).");
  }
  if (!existsSync(SSR)) {
    fail(`the server build is missing at ${path.relative(ROOT, SSR)} — run \`vite build --ssr\` first.`);
  }

  const [{ render }, seoModule, template] = await Promise.all([
    import(pathToFileURL(SSR).href),
    import(pathToFileURL(path.join(ROOT, "src", "lib", "seo.js")).href),
    readFile(path.join(DIST, "index.html"), "utf8"),
  ]);
  const { PUBLIC_ROUTES, SITE_URL, seoFor, seoForPost } = seoModule;

  if (!/<div id="root"><\/div>/.test(template)) {
    fail('dist/index.html has no empty <div id="root"></div> to render into.');
  }

  // Articles first: the page count, the sitemap and the nav link all depend on
  // how many there are, and a failure here should stop the build before it has
  // written anything.
  let posts = [];
  try {
    const result = await fetchPosts();
    posts = result.posts;
    if (result.skipped) {
      console.warn(`\n[prerender] BLOG SKIPPED — ${result.skipped}`);
      console.warn("[prerender] BLOG_OPTIONAL=1 is set, so the site ships without the blog.\n");
    } else {
      console.log(`\n[prerender] ${posts.length} published article(s) from ${result.endpoint}`);
    }
  } catch (error) {
    fail(error.message);
  }

  const index = posts.map(listEntry);
  const count = posts.length;

  // The untouched shell, kept for the SPA fallback. Signed-in routes
  // (/dashboard, /editor) are not prerendered, and falling back to the
  // prerendered HOMEPAGE would hand them the landing page's markup and
  // canonical - a flash of the wrong page, and a hydration mismatch React
  // has to throw away and re-render. They get an empty root instead, which
  // is what they had before any of this. It still carries the article count,
  // so a signed-in person sees the same navigation as everyone else.
  await writeFile(
    path.join(DIST, "app-shell.html"),
    beforeBodyEnd(template, jsonScript("blog-data", "application/json", { count })),
    "utf8"
  );

  const seenTitles = new Map();
  const written = [];

  const routes = [
    ...PUBLIC_ROUTES.map((route) => ({ route, kind: "page" })),
    ...posts.map((post) => ({ route: post.path, kind: "article", post })),
  ];

  for (const item of routes) {
    const { route, kind, post } = item;
    const meta = kind === "article" ? seoForPost(post) : seoFor(route);
    if (!meta) fail(`${route} has no metadata — seoFor/seoForPost returned nothing.`);

    // What this page was rendered from. The same object is written into the
    // HTML below, which is what lets React hydrate the article the server
    // rendered instead of replacing it with a loading state.
    const pageData =
      kind === "article"
        ? { count, post }
        : route === "/blog"
          ? { count, index }
          : { count };
    globalThis.__BLOG__ = pageData;

    let markup;
    try {
      markup = render(route);
    } catch (error) {
      fail(`${route} could not be rendered: ${error?.stack || error}`);
    }
    if (!markup || markup.length < MIN_MARKUP) {
      fail(`${route} rendered ${markup ? markup.length : 0} characters, which is a shell, not a page.`);
    }

    let html = template.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
    html = setTitle(html, meta.title);
    html = setMeta(html, "name", "description", meta.description);
    html = setCanonical(html, meta.canonical);
    html = setMeta(html, "property", "og:url", meta.canonical);
    html = setMeta(html, "property", "og:title", meta.ogTitle);
    html = setMeta(html, "property", "og:description", meta.ogDescription);
    html = setMeta(html, "name", "twitter:title", meta.ogTitle);
    html = setMeta(html, "name", "twitter:description", meta.ogDescription);
    if (kind === "article") {
      html = setMeta(html, "property", "og:type", "article");
      html = setMeta(html, "property", "og:image", meta.ogImage);
      html = setMeta(html, "name", "twitter:image", meta.ogImage);
      html = setMeta(html, "property", "article:published_time", meta.publishedAt || "");
      html = setMeta(html, "property", "article:modified_time", meta.updatedAt || meta.publishedAt || "");
      html = beforeHeadEnd(
        html,
        jsonScript("article-ld", "application/ld+json", articleLd(post, meta, SITE_URL))
      );
    }
    html = beforeBodyEnd(html, jsonScript("blog-data", "application/json", pageData));

    // Prove the rewrite landed, rather than trusting the regexes.
    const wroteCanonical = (html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i) || [])[1];
    if (wroteCanonical !== meta.canonical) {
      fail(`${route} kept the canonical ${wroteCanonical} instead of ${meta.canonical} — the rewrite missed.`);
    }
    const wroteTitle = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
    if (wroteTitle !== escapeAttr(meta.title)) {
      fail(`${route} kept the title ${JSON.stringify(wroteTitle)} — the rewrite missed.`);
    }
    if (seenTitles.has(wroteTitle)) {
      const other = seenTitles.get(wroteTitle);
      // A duplicate title between two of OUR pages is a build bug and stops
      // everything. Between two articles it is an editorial problem — the
      // writer produced two headlines that will compete for one result — and
      // blocking a deploy over the wording of a blog post is the wrong lever.
      // It is said loudly instead, and blog-retitle in PyRunner is the fix.
      if (kind === "article") {
        console.warn(`[prerender] WARNING: ${route} shares a title with ${other} — they will compete.`);
      } else {
        fail(`${route} shares a title with ${other} — two pages competing for one result.`);
      }
    }
    seenTitles.set(wroteTitle, route);

    const out = outputFor(route);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, html, "utf8");
    written.push({ route, file: path.relative(ROOT, out), bytes: html.length, words: countWords(markup) });
  }
  globalThis.__BLOG__ = undefined;

  // The article data as files, for a reader who arrives by clicking rather than
  // by loading a URL. Never needed on a first paint — the page they land on
  // already contains its own article.
  if (posts.length) {
    await mkdir(path.join(DIST, "blog", "posts"), { recursive: true });
    await writeFile(path.join(DIST, "blog", "index.json"), JSON.stringify(index), "utf8");
    for (const post of posts) {
      await writeFile(
        path.join(DIST, "blog", "posts", `${post.slug}.json`),
        JSON.stringify(post),
        "utf8"
      );
    }
  }

  const sitemap = buildSitemap(posts);
  await writeFile(path.join(DIST, "sitemap.xml"), sitemap, "utf8");
  const sitemapCount = (sitemap.match(/<loc>/g) || []).length;

  const width = Math.max(...written.map((w) => w.route.length));
  console.log("\n[prerender] every public page now ships its own HTML:\n");
  for (const w of written) {
    console.log(`  ${w.route.padEnd(width)}  ${String(w.words).padStart(5)} words  ${(w.bytes / 1024).toFixed(1).padStart(6)} KB  ${w.file}`);
  }
  console.log(
    `\n[prerender] ${written.length} page(s), each with its own title and canonical, ` +
      `plus app-shell.html for the signed-in routes.`
  );
  console.log(`[prerender] sitemap.xml lists ${sitemapCount} URL(s).\n`);
}

function countWords(markup) {
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}

main().catch((error) => fail(error?.stack || String(error)));
