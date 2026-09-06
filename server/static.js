/**
 * Static-file policy for the production server: content type and cache lifetime
 * for anything served out of dist/. Split out of index.js so it can be unit
 * tested without booting an HTTP listener.
 */
import path from "path";

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

export function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

// Files whose contents change while the URL stays the same. robots.txt,
// sitemap.xml, the Search Console token and index.html all fall in here — an
// immutable year-long cache on any of them is unfixable once shipped.
const REVALIDATE = new Set([".html", ".txt", ".xml", ".json", ".webmanifest"]);

export function cacheControlFor(filePath, distDir) {
  // Only Vite's content-hashed bundles under /assets are safe to pin forever.
  if (filePath.startsWith(path.join(distDir, "assets") + path.sep)) {
    return "public, max-age=31536000, immutable";
  }
  if (REVALIDATE.has(path.extname(filePath).toLowerCase())) return "no-cache";
  // Named images and fonts in public/ (favicons, og-cover.png, backgrounds).
  return "public, max-age=86400";
}
