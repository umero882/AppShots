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

/** "/" -> dist/index.html, "/pricing" -> dist/pricing/index.html */
function outputFor(route) {
  return route === "/" ? path.join(DIST, "index.html") : path.join(DIST, route.replace(/^\//, ""), "index.html");
}

async function main() {
  if (!existsSync(path.join(DIST, "index.html"))) {
    fail("dist/index.html is missing — run the client build first (`vite build`).");
  }
  if (!existsSync(SSR)) {
    fail(`the server build is missing at ${path.relative(ROOT, SSR)} — run \`vite build --ssr\` first.`);
  }

  const [{ render }, seo, template] = await Promise.all([
    import(pathToFileURL(SSR).href),
    import(pathToFileURL(path.join(ROOT, "src", "lib", "seo.js")).href),
    readFile(path.join(DIST, "index.html"), "utf8"),
  ]);

  if (!/<div id="root"><\/div>/.test(template)) {
    fail('dist/index.html has no empty <div id="root"></div> to render into.');
  }

  // The untouched shell, kept for the SPA fallback. Signed-in routes
  // (/dashboard, /editor) are not prerendered, and falling back to the
  // prerendered HOMEPAGE would hand them the landing page's markup and
  // canonical - a flash of the wrong page, and a hydration mismatch React
  // has to throw away and re-render. They get an empty root instead, which
  // is what they had before any of this.
  await writeFile(path.join(DIST, "app-shell.html"), template, "utf8");

  const seenTitles = new Map();
  const written = [];

  for (const route of seo.PUBLIC_ROUTES) {
    const meta = seo.seoFor(route);
    if (!meta) fail(`${route} is in PUBLIC_ROUTES but seoFor() returned nothing.`);

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
      fail(`${route} shares a title with ${seenTitles.get(wroteTitle)} — two pages competing for one result.`);
    }
    seenTitles.set(wroteTitle, route);

    const out = outputFor(route);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, html, "utf8");
    written.push({ route, file: path.relative(ROOT, out), bytes: html.length, words: countWords(markup) });
  }

  const width = Math.max(...written.map((w) => w.route.length));
  console.log("\n[prerender] every public page now ships its own HTML:\n");
  for (const w of written) {
    console.log(`  ${w.route.padEnd(width)}  ${String(w.words).padStart(5)} words  ${(w.bytes / 1024).toFixed(1).padStart(6)} KB  ${w.file}`);
  }
  console.log(`\n[prerender] ${written.length} page(s), each with its own title and canonical, plus app-shell.html for the signed-in routes.\n`);
}

function countWords(markup) {
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}

main().catch((error) => fail(error?.stack || String(error)));
