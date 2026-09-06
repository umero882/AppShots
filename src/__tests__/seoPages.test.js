/**
 * The per-page metadata map (src/lib/seo.js) that the prerender renders from.
 * Sits beside seo.test.js, which guards robots.txt, the sitemap and the social
 * card in index.html — this one guards the pages themselves.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PAGES, PUBLIC_ROUTES, SITE_URL, normalisePath, seoFor } from "../lib/seo";

const sitemap = readFileSync(path.resolve(process.cwd(), "public/sitemap.xml"), "utf8");
const sitemapPaths = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g))
  .map((m) => m[1].replace(SITE_URL, ""))
  .map((p) => (p === "/" ? "/" : p.replace(/\/$/, "")));

describe("the page map and the sitemap", () => {
  it("list exactly the same public pages", () => {
    // A page in one list and not the other is the failure that put the wrong
    // canonical on five pages: the sitemap invited Google in, and the page it
    // arrived at asked to be indexed as the homepage instead.
    expect([...PUBLIC_ROUTES].sort()).toEqual([...sitemapPaths].sort());
  });
});

describe("seoFor", () => {
  it("gives every public page its own canonical, title and description", () => {
    const canonicals = new Set();
    const titles = new Set();
    const descriptions = new Set();

    for (const route of PUBLIC_ROUTES) {
      const seo = seoFor(route);
      expect(seo, route).toBeTruthy();
      expect(seo.canonical, route).toBe(route === "/" ? `${SITE_URL}/` : `${SITE_URL}${route}`);
      expect(seo.title.length, route).toBeGreaterThan(10);
      // Google truncates a description past roughly 160 characters; a longer
      // one is not wrong, but it is not the sentence that gets read.
      expect(seo.description.length, route).toBeLessThanOrEqual(200);
      canonicals.add(seo.canonical);
      titles.add(seo.title);
      descriptions.add(seo.description);
    }

    expect(canonicals.size).toBe(PUBLIC_ROUTES.length);
    expect(titles.size).toBe(PUBLIC_ROUTES.length);
    expect(descriptions.size).toBe(PUBLIC_ROUTES.length);
  });

  it("treats a trailing slash, a query and a hash as the same page", () => {
    for (const variant of ["/pricing/", "/pricing?utm_source=x", "/pricing#plans"]) {
      expect(normalisePath(variant)).toBe("/pricing");
      expect(seoFor(variant).canonical).toBe(`${SITE_URL}/pricing`);
    }
  });

  it("says nothing about a signed-in screen, rather than inventing a title", () => {
    for (const route of ["/dashboard", "/editor/abc", "/settings", "/auth/action"]) {
      expect(seoFor(route), route).toBeNull();
      expect(PAGES[route], route).toBeUndefined();
    }
  });
});
