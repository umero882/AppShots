import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { seoFor } from "../lib/seo";

/**
 * Keeps the document's title, description and canonical in step with the route
 * the person is actually on.
 *
 * The prerender writes these into each page's HTML, which is what a crawler
 * reads. This is for everything after that: a client-side navigation from the
 * homepage to /pricing swaps the whole page without touching <head>, so
 * without this the tab, the bookmark and anything reading the canonical would
 * all still say "homepage" while the reader is on pricing.
 *
 * A route with no entry in the map (the dashboard, the editor) is left alone —
 * those are signed-in screens that robots.txt already excludes, and inventing
 * a title for them would only put a wrong one in someone's history.
 */
export default function SeoSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = seoFor(pathname);
    if (!seo) return;

    document.title = seo.title;
    setMeta("name", "description", seo.description);
    setMeta("property", "og:title", seo.ogTitle);
    setMeta("property", "og:description", seo.ogDescription);
    setMeta("property", "og:url", seo.canonical);
    setMeta("name", "twitter:title", seo.ogTitle);
    setMeta("name", "twitter:description", seo.ogDescription);
    setCanonical(seo.canonical);
  }, [pathname]);

  return null;
}

function setMeta(attr, name, content) {
  if (!content) return;
  let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}
