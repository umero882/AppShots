import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { seoFor } from "../lib/seo";
import { applySeo } from "../lib/head";

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
 * A route with no entry in the map is left alone. That covers two different
 * things and is right for both: the dashboard and the editor are signed-in
 * screens that robots.txt already excludes, and inventing a title for them
 * would only put a wrong one in someone's history; an article at /blog/<slug>
 * has a title this component cannot know, so BlogPost sets its own head once
 * it has the article. Either way, guessing here would be worse than waiting.
 */
export default function SeoSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    applySeo(seoFor(pathname));
  }, [pathname]);

  return null;
}
