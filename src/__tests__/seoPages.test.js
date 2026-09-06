/**
 * The per-page metadata map (src/lib/seo.js) that the prerender renders from.
 * Sits beside seo.test.js, which guards robots.txt, the sitemap and the social
 * card in index.html — this one guards the pages themselves.
 */
import { describe, expect, it } from "vitest";

import { PAGES, PUBLIC_ROUTES, SITEMAP_ROUTES, SITE_URL, normalisePath, seoFor } from "../lib/seo";
import { buildSitemap } from "../../scripts/sitemap.mjs";

const sitemap = buildSitemap([]);
const sitemapPaths = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g))
  .map((m) => m[1].replace(SITE_URL, ""))
  .map((p) => (p === "/" ? "/" : p.replace(/\/$/, "")));

describe("the page map and the sitemap", () => {
  it("list exactly the same public pages", () => {
    // A page in one list and not the other is the failure that put the wrong
    // canonical on five pages: the sitemap invited Google in, and the page it
    // arrived at asked to be indexed as the homepage instead.
    expect([...SITEMAP_ROUTES].sort()).toEqual([...sitemapPaths].sort());
  });
});

describe("prerendered but unlisted pages", () => {
  it("still get their own canonical, so they never point at the homepage", () => {
    const unlisted = PUBLIC_ROUTES.filter((r) => !SITEMAP_ROUTES.includes(r));
    expect(unlisted).toContain("/login");
    for (const route of unlisted) {
      expect(seoFor(route).canonical).toBe(`${SITE_URL}${route}`);
    }
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
      // The lengths the site audit checks, and the reason it checks them: a
      // title past ~60 characters is cut off in the result, and a description
      // outside 50-160 is either truncated or too thin to be the sentence
      // someone reads before deciding whether to click.
      expect(seo.title.length, `${route} title is cut off in results`).toBeLessThanOrEqual(60);
      expect(seo.description.length, `${route} description too short`).toBeGreaterThanOrEqual(50);
      expect(seo.description.length, `${route} description is truncated`).toBeLessThanOrEqual(160);
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
