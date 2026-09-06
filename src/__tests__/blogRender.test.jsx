/**
 * Renders the blog the way the build does.
 *
 * This is the test that would have caught the original fault on the rest of the
 * site: every page served the same empty shell, and nothing failed. Asserting
 * that the article's words are in the server's output is the difference between
 * "the route exists" and "a crawler can read it".
 */

import { afterEach, describe, expect, it } from "vitest";

import { render } from "../entry-server.jsx";

const article = {
  slug: "screenshot-sizes",
  title: "Every App Store screenshot size",
  description: "The exact pixel dimensions Apple and Google accept, and which ones you need.",
  html: "<p>Apple accepts a 6.9 inch screenshot at 1290 by 2796 pixels.</p>",
  coverImageUrl: null,
  category: "screenshots",
  tags: ["sizes", "ios"],
  publishedAt: "2026-09-06T09:30:00+00:00",
  updatedAt: "2026-09-06T09:30:00+00:00",
  readingMinutes: 4,
  path: "/blog/screenshot-sizes",
};

const listed = (over) => {
  const { html, ...rest } = { ...article, ...over };
  return rest;
};

afterEach(() => {
  globalThis.__BLOG__ = undefined;
});

describe("server-rendered blog", () => {
  it("puts the whole article in the HTML, not a loading state", () => {
    globalThis.__BLOG__ = { count: 1, post: article };
    const markup = render("/blog/screenshot-sizes");

    expect(markup).toContain("Every App Store screenshot size");
    expect(markup).toContain("1290 by 2796 pixels");
    expect(markup).toContain("6 September 2026");
    expect(markup).not.toContain("Loading");
    // A shell is a few hundred characters. A page is not.
    expect(markup.length).toBeGreaterThan(2000);
  });

  it("links every article from the index, so they can be found at all", () => {
    globalThis.__BLOG__ = {
      count: 2,
      index: [listed(), listed({ slug: "aso-basics", title: "ASO basics" })],
    };
    const markup = render("/blog");

    expect(markup).toContain('href="/blog/screenshot-sizes"');
    expect(markup).toContain('href="/blog/aso-basics"');
    expect(markup).toContain("ASO basics");
    expect(markup).not.toContain("Nothing published yet");
  });

  it("says so plainly when there is nothing published", () => {
    globalThis.__BLOG__ = { count: 0, index: [] };
    const markup = render("/blog");

    expect(markup).toContain("Nothing published yet");
    expect(markup).not.toContain("Loading");
  });

  it("keeps the blog out of the navigation until an article exists", () => {
    // A link in the footer of every page, pointing at an empty index, is a
    // worse first impression than no link. It appears with the first article.
    globalThis.__BLOG__ = { count: 0 };
    expect(render("/pricing")).not.toContain('"/blog"');

    globalThis.__BLOG__ = { count: 1 };
    expect(render("/pricing")).toContain("/blog");
  });
});
