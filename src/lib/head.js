/**
 * Writes a page's metadata into the live document.
 *
 * The prerender puts all of this in the HTML already, which is what a crawler
 * reads. This is for everything after that: a client-side navigation swaps the
 * page without touching <head>, so without it the tab, the bookmark, and
 * anything reading the canonical would still describe the page someone came
 * from.
 *
 * Shared by SeoSync (which knows the static pages) and BlogPost (which is the
 * only thing that knows an article's title until it has loaded it), so the two
 * cannot drift on which tags matter.
 */

export function applySeo(seo) {
  if (!seo || typeof document === "undefined") return;

  document.title = seo.title;
  setMeta("name", "description", seo.description);
  setMeta("property", "og:title", seo.ogTitle);
  setMeta("property", "og:description", seo.ogDescription);
  setMeta("property", "og:url", seo.canonical);
  setMeta("name", "twitter:title", seo.ogTitle);
  setMeta("name", "twitter:description", seo.ogDescription);
  if (seo.ogImage) {
    setMeta("property", "og:image", seo.ogImage);
    setMeta("name", "twitter:image", seo.ogImage);
  }
  setCanonical(seo.canonical);
}

export function setMeta(attr, name, content) {
  if (!content) return;
  let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

export function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}
