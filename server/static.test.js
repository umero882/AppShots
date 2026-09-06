import { describe, it, expect } from "vitest";
import path from "path";
import { contentTypeFor, cacheControlFor } from "./static.js";

const DIST = path.join("/app", "dist");
const inDist = (...p) => path.join(DIST, ...p);

describe("contentTypeFor", () => {
  it("serves the SEO files with the types crawlers expect", () => {
    expect(contentTypeFor(inDist("robots.txt"))).toBe("text/plain; charset=utf-8");
    expect(contentTypeFor(inDist("sitemap.xml"))).toBe("application/xml; charset=utf-8");
    expect(contentTypeFor(inDist("googleeb75106204844a1b.html"))).toBe("text/html; charset=utf-8");
    expect(contentTypeFor(inDist("og-cover.png"))).toBe("image/png");
  });

  it("is case-insensitive and falls back to a binary type", () => {
    expect(contentTypeFor(inDist("LOGO.PNG"))).toBe("image/png");
    expect(contentTypeFor(inDist("archive.tar.gz"))).toBe("application/octet-stream");
  });
});

describe("cacheControlFor", () => {
  it("pins only Vite's content-hashed bundles", () => {
    expect(cacheControlFor(inDist("assets", "index-D4f8a1.js"), DIST)).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(cacheControlFor(inDist("assets", "index-D4f8a1.css"), DIST)).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("keeps stable-URL text files revalidatable", () => {
    // These change in place on every deploy; an immutable cache is unfixable.
    for (const f of ["index.html", "robots.txt", "sitemap.xml", "googleeb75106204844a1b.html"]) {
      expect(cacheControlFor(inDist(f), DIST)).toBe("no-cache");
    }
  });

  it("gives named images a bounded cache", () => {
    expect(cacheControlFor(inDist("og-cover.png"), DIST)).toBe("public, max-age=86400");
    expect(cacheControlFor(inDist("backgrounds", "beach-1.jpg"), DIST)).toBe("public, max-age=86400");
  });

  it("does not treat a name merely starting with 'assets' as hashed", () => {
    expect(cacheControlFor(inDist("assets-legacy.js"), DIST)).toBe("public, max-age=86400");
  });
});
