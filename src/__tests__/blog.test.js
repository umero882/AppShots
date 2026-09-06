/**
 * The blog: the markdown that becomes an article, the metadata that describes
 * it, and the sitemap that advertises it.
 *
 * The rendering rules here are the security boundary for article bodies. They
 * are written by an AI and published by a person, and this is what stands
 * between "the pipeline wrote something odd" and "the site executes it".
 */

import { describe, expect, it } from "vitest";

import { headingId, isSafeHref, readingMinutes, renderMarkdown, wordCount } from "../../scripts/blog/markdown.mjs";
import { buildSitemap } from "../../scripts/sitemap.mjs";
import { SITE_URL, seoForPost } from "../lib/seo";
import { coverGradient, formatDate, isoDate, postPath } from "../lib/blog";

const post = (over = {}) => ({
  slug: "screenshot-sizes",
  title: "Every App Store screenshot size",
  description:
    "The exact pixel dimensions Apple and Google accept in 2026, which ones you actually need, and what happens when you skip the rest.",
  html: "<p>Body</p>",
  coverImageUrl: null,
  category: "screenshots",
  tags: ["sizes"],
  publishedAt: "2026-09-06T09:30:00+00:00",
  updatedAt: "2026-09-06T09:30:00+00:00",
  readingMinutes: 4,
  path: "/blog/screenshot-sizes",
  ...over,
});

describe("article markdown", () => {
  it("drops raw HTML instead of rendering it", () => {
    const html = renderMarkdown('Before\n\n<script>alert(1)</script>\n\nAfter');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    // The prose around it survives — dropping markup must not eat the article.
    expect(html).toContain("Before");
    expect(html).toContain("After");
  });

  it("drops an inline event handler smuggled as markup", () => {
    const html = renderMarkdown('An <img src=x onerror="alert(1)"> image');
    expect(html).not.toContain("onerror");
  });

  it("refuses a javascript: link and keeps the words", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("click me");
  });

  it("sees through whitespace and control characters in a scheme", () => {
    // Browsers ignore these inside a URL, so a check that only trims the ends
    // reads them as relative links and lets them through.
    expect(isSafeHref("java\tscript:alert(1)")).toBe(false);
    expect(isSafeHref("java\nscript:alert(1)")).toBe(false);
    expect(isSafeHref(" javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeHref("vbscript:msgbox(1)")).toBe(false);
  });

  it("allows the schemes an article legitimately uses", () => {
    expect(isSafeHref("https://apple.com")).toBe(true);
    expect(isSafeHref("http://example.com")).toBe(true);
    expect(isSafeHref("mailto:hi@appshots.dev")).toBe(true);
    expect(isSafeHref("/pricing")).toBe(true);
    expect(isSafeHref("#section")).toBe(true);
  });

  it("sends outbound links away safely and keeps our own in place", () => {
    const outbound = renderMarkdown("[Apple](https://developer.apple.com/x)");
    expect(outbound).toContain('rel="nofollow noopener noreferrer"');
    expect(outbound).toContain('target="_blank"');

    const ours = renderMarkdown("[Pricing](https://appshots.nextechlabs.tech/pricing)");
    expect(ours).not.toContain("nofollow");

    const relative = renderMarkdown("[Pricing](/pricing)");
    expect(relative).not.toContain("nofollow");
    expect(relative).toContain('href="/pricing"');
  });

  it("keeps an unsafe image's alt text and none of the image", () => {
    const html = renderMarkdown('![a diagram](javascript:alert(1))');
    expect(html).not.toContain("<img");
    expect(html).toContain("a diagram");
  });

  it("renders the markdown an article is actually made of", () => {
    const html = renderMarkdown(
      "## Sizes\n\nText with **bold** and [a link](/pricing).\n\n- one\n- two\n\n> a quote\n"
    );
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<blockquote>");
  });

  it("gives headings an id so a section can be linked to", () => {
    expect(headingId("What Apple accepts (2026)")).toBe("what-apple-accepts-2026");
    expect(renderMarkdown("## What Apple accepts")).toContain('id="what-apple-accepts"');
  });

  it("counts a reading time from the prose, not the punctuation", () => {
    expect(wordCount("# Title\n\nOne two three four five")).toBe(6);
    expect(readingMinutes("word ".repeat(10))).toBe(1);
    expect(readingMinutes("word ".repeat(660))).toBe(3);
  });
});

describe("seoForPost", () => {
  it("gives an article its own canonical", () => {
    expect(seoForPost(post()).canonical).toBe(`${SITE_URL}/blog/screenshot-sizes`);
  });

  it("adds the site name only while the headline still fits", () => {
    const short = seoForPost(post({ title: "Screenshot sizes" }));
    expect(short.title).toBe("Screenshot sizes — AppShots");

    const long = seoForPost(
      post({ title: "Every App Store and Google Play screenshot size for 2026" })
    );
    // 57 characters of headline plus the suffix is past what a result shows,
    // and the headline is the half that has to survive.
    expect(long.title).toBe("Every App Store and Google Play screenshot size for 2026");
    expect(long.title.length).toBeLessThanOrEqual(60);
  });

  it("shares the article's own cover, and falls back to the site card", () => {
    expect(seoForPost(post()).ogImage).toBe(`${SITE_URL}/og-cover.png`);
    expect(seoForPost(post({ coverImageUrl: "https://cdn.example/a.png" })).ogImage).toBe(
      "https://cdn.example/a.png"
    );
    // A relative og:image does not unfurl anywhere, so it is made absolute.
    expect(seoForPost(post({ coverImageUrl: "/covers/a.png" })).ogImage).toBe(
      `${SITE_URL}/covers/a.png`
    );
  });

  it("says nothing about something that is not an article", () => {
    expect(seoForPost(null)).toBeNull();
    expect(seoForPost({})).toBeNull();
  });
});

describe("the sitemap with articles", () => {
  const locs = (xml) => Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);

  it("leaves the blog out entirely until something is published", () => {
    const empty = locs(buildSitemap([]));
    expect(empty.some((l) => l.includes("/blog"))).toBe(false);
  });

  it("lists the index and every article once there is one", () => {
    const xml = buildSitemap([post(), post({ slug: "second", title: "Second" })]);
    const list = locs(xml);
    expect(list).toContain(`${SITE_URL}/blog`);
    expect(list).toContain(`${SITE_URL}/blog/screenshot-sizes`);
    expect(list).toContain(`${SITE_URL}/blog/second`);
    expect(new Set(list).size).toBe(list.length);
  });

  it("dates an article from the database, and dates nothing else", () => {
    const xml = buildSitemap([post()]);
    expect(xml).toContain("<lastmod>2026-09-06</lastmod>");
    // One article, one lastmod: the static pages deliberately carry none,
    // because the only date this build knows is the day it ran.
    expect((xml.match(/<lastmod>/g) || []).length).toBe(1);
  });

  it("is well-formed enough to be parsed", () => {
    const xml = buildSitemap([post()]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect((xml.match(/<url>/g) || []).length).toBe((xml.match(/<\/url>/g) || []).length);
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });
});

describe("blog helpers", () => {
  it("builds an article path from a slug", () => {
    expect(postPath("screenshot-sizes")).toBe("/blog/screenshot-sizes");
  });

  it("formats a date in UTC, so the server and the browser agree", () => {
    // Rendered on the server and hydrated in the reader's timezone. If this
    // were local, an article published near midnight would hydrate to a
    // different date than it was rendered with and visibly change.
    expect(formatDate("2026-09-06T23:45:00+00:00")).toBe("6 September 2026");
    expect(formatDate("2026-09-06T00:15:00+00:00")).toBe("6 September 2026");
    expect(formatDate(null)).toBe("");
    expect(formatDate("not a date")).toBe("");
  });

  it("gives a machine-readable date for <time> and structured data", () => {
    expect(isoDate("2026-09-06T09:30:00+00:00")).toBe("2026-09-06T09:30:00.000Z");
    expect(isoDate("")).toBe("");
  });

  it("always draws the same cover for the same article", () => {
    expect(coverGradient("screenshot-sizes")).toBe(coverGradient("screenshot-sizes"));
    expect(coverGradient("a")).not.toBe(coverGradient("b"));
    expect(coverGradient("a")).toMatch(/^linear-gradient\(/);
  });
});
