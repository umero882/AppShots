/**
 * Turns an article's markdown into the HTML the blog ships.
 *
 * This runs at BUILD TIME only — `marked` is a devDependency and never reaches
 * the browser. Each article is rendered once, written into its page's HTML, and
 * served as a static file.
 *
 * WHY RAW HTML IS DROPPED RATHER THAN ESCAPED OR ALLOWED
 * -----------------------------------------------------
 * Article bodies are written by an AI in PyRunner, filed as drafts, and
 * published by a person. That is a good pipeline and still not a reason to run
 * whatever markup arrives: a compromised `content_bot` credential would
 * otherwise be stored XSS on our own domain, executing with our origin. The
 * bodies have no legitimate need for markup — every element a blog post uses
 * has markdown syntax — so `renderer.html` returns nothing and the attack
 * surface goes away instead of being filtered.
 *
 * Escaping instead of dropping was the other option. It leaves `<script>` on
 * the page as visible text, which is louder but uglier, and either way the
 * markup was a mistake. Dropping keeps a stray tag from disfiguring an article.
 */

import { marked } from "marked";

/** Schemes a link or image may use. Everything else is dropped. */
const SAFE_SCHEME = /^(https?:|mailto:)/i;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Everything up to and including the space, plus DEL. Browsers ignore these
 * characters inside a URL, so "java<tab>script:alert(1)" runs — and a check
 * that only trims the ends reads that as a relative URL and waves it through.
 * Written as a code-point test rather than a regex escape because this file
 * has been mangled once already by a shell rewriting \u sequences.
 */
function stripInvisible(value) {
  let out = "";
  for (const ch of String(value ?? "")) {
    const code = ch.codePointAt(0);
    if (code > 32 && code !== 127) out += ch;
  }
  return out;
}

/**
 * True for a href we are willing to emit. Relative and anchor links are fine;
 * an absolute URL has to carry a scheme we recognise, so `javascript:`,
 * `data:` and `vbscript:` all fail — including their obfuscated spellings.
 */
export function isSafeHref(href) {
  const value = stripInvisible(href);
  if (!value) return false;
  if (value.startsWith("/") || value.startsWith("#")) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true; // relative
  return SAFE_SCHEME.test(value);
}

/** The hostname of an absolute http(s) URL, or "" for anything else. */
export function hostOf(href) {
  try {
    const url = new URL(String(href));
    return /^https?:$/i.test(url.protocol) ? url.hostname : "";
  } catch {
    return "";
  }
}

/** A heading's anchor id, so a section can be linked to directly. */
export function headingId(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function buildRenderer(siteHost) {
  const renderer = new marked.Renderer();

  renderer.html = () => "";

  renderer.link = (href, title, text) => {
    if (!isSafeHref(href)) return text;
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    // Outbound links open in a new tab and carry nofollow; our own keep their
    // link equity and navigate in place.
    const host = hostOf(href);
    const external = host && host !== siteHost && !host.endsWith(`.${siteHost}`);
    const rel = external ? ' target="_blank" rel="nofollow noopener noreferrer"' : "";
    return `<a href="${escapeHtml(href)}"${titleAttr}${rel}>${text}</a>`;
  };

  renderer.image = (href, title, text) => {
    if (!isSafeHref(href)) return escapeHtml(text || "");
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return (
      `<img src="${escapeHtml(href)}" alt="${escapeHtml(text || "")}"${titleAttr}` +
      ` loading="lazy" decoding="async" />`
    );
  };

  renderer.heading = (text, level) => {
    const id = headingId(text);
    return id ? `<h${level} id="${id}">${text}</h${level}>` : `<h${level}>${text}</h${level}>`;
  };

  return renderer;
}

/**
 * @param {string} md the article body
 * @param {{siteHost?: string}} [options] host treated as internal for link rel
 * @returns {string} HTML safe to place in the page
 */
export function renderMarkdown(md, { siteHost = "appshots.nextechlabs.tech" } = {}) {
  if (!md) return "";
  return marked.parse(String(md), {
    renderer: buildRenderer(siteHost),
    async: false,
    gfm: true,
    breaks: false,
  });
}

/** Words in the body, counted on the text a person actually reads. */
export function wordCount(md) {
  const text = String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

/** Minutes, rounded up, at the 220 wpm people actually read web prose. */
export function readingMinutes(md) {
  return Math.max(1, Math.ceil(wordCount(md) / 220));
}
