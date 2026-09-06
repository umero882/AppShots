/**
 * Guards the crawlable surface: robots.txt, sitemap.xml, the Search Console
 * token and the social card in index.html. These are easy to break silently —
 * nothing in the app reads them, so only a test notices when they drift.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => readFileSync(path.join(ROOT, ...p), "utf8");
const ORIGIN = "https://appshots.nextechlabs.tech";

const robots = read("public", "robots.txt");
const sitemap = read("public", "sitemap.xml");
const indexHtml = read("index.html");
const appJsx = read("src", "App.jsx");

/** Routes wrapped in <ProtectedRoute> — signed-in only, never for crawlers. */
const protectedRoutes = [...appJsx.matchAll(/path="([^"]+)"[\s\S]{0,80}?<ProtectedRoute>/g)].map(
  (m) => m[1],
);
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("robots.txt", () => {
  it("lets crawlers in and points at the sitemap", () => {
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).toMatch(new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, "m"));
  });

  it("keeps the API and the one-time auth-action page out", () => {
    expect(robots).toMatch(/^Disallow: \/api\/$/m);
    expect(robots).toMatch(/^Disallow: \/auth\/action$/m);
  });

  it("disallows every signed-in route", () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
    for (const route of protectedRoutes) {
      // /editor/:id is covered by the /editor/ prefix.
      const rule = route.replace(/\/:[^/]+$/, "/");
      expect(robots, `robots.txt is missing "Disallow: ${rule}"`).toMatch(
        new RegExp(`^Disallow: ${rule.replace(/[/]/g, "\\/")}$`, "m"),
      );
    }
  });
});

describe("sitemap.xml", () => {
  it("lists absolute URLs on the production origin", () => {
    expect(sitemapLocs.length).toBeGreaterThan(0);
    for (const loc of sitemapLocs) expect(loc.startsWith(`${ORIGIN}/`)).toBe(true);
  });

  it("covers the public pages", () => {
    for (const p of ["/", "/pricing", "/inspiration", "/privacy", "/terms"]) {
      expect(sitemapLocs).toContain(`${ORIGIN}${p}`);
    }
  });

  it("never advertises a signed-in route", () => {
    const paths = sitemapLocs.map((l) => l.slice(ORIGIN.length));
    for (const route of protectedRoutes) {
      const base = route.replace(/\/:[^/]+$/, "");
      expect(paths.some((p) => p === base || p.startsWith(`${base}/`))).toBe(false);
    }
    expect(paths).not.toContain("/auth/action");
  });

  it("has no duplicate entries", () => {
    expect(new Set(sitemapLocs).size).toBe(sitemapLocs.length);
  });
});

describe("Google Search Console verification", () => {
  const token = "googleeb75106204844a1b";

  it("serves the token file verbatim under its own name", () => {
    const body = read("public", `${token}.html`);
    // Google matches the body exactly; a trailing newline or a wrapper breaks it.
    expect(body).toBe(`google-site-verification: ${token}.html`);
  });
});

describe("social card", () => {
  const meta = (attr, name) =>
    indexHtml.match(new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`))?.[1];

  it("declares a canonical URL", () => {
    expect(indexHtml).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
  });

  it("uses an absolute image URL — relative ones do not unfurl", () => {
    expect(meta("property", "og:image")).toBe(`${ORIGIN}/og-cover.png`);
    expect(meta("name", "twitter:image")).toBe(`${ORIGIN}/og-cover.png`);
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
  });

  it("ships the card image at the declared 1200x630", () => {
    const png = readFileSync(path.join(ROOT, "public", "og-cover.png"));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
  });

  it("keeps og:title in step with the page title", () => {
    const title = indexHtml.match(/<title>([^<]+)<\/title>/)[1];
    expect(meta("property", "og:title")).toBe(title);
  });

  it("carries structured data naming the publisher", () => {
    const ld = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
    const data = JSON.parse(ld);
    expect(data["@type"]).toBe("SoftwareApplication");
    expect(data.url).toBe(`${ORIGIN}/`);
    expect(data.publisher.name).toBe("Next Tech Labs");
  });
});
