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

/**
 * The status to send with the SPA shell when no file matched.
 *
 * The shell is served for signed-in routes — /dashboard, /editor/<id> — which
 * really do exist, so 200 is right for them and is what everything gets by
 * default.
 *
 * Articles are the exception, and the blog is what makes it matter. Every
 * published article is prerendered into its own directory, so the complete set
 * of real /blog/ URLs is on disk: anything under /blog/ that missed is not an
 * article. Answering 200 there tells a crawler that a renamed or mistyped slug
 * is a real page and invites it to index one — a soft 404, and articles get
 * renamed (that is what blog-retitle in the pipeline does). It also breaks the
 * client's own lookup, which reads a 404 as "no such article" and anything else
 * as a failure.
 *
 * The body stays the shell either way, so the reader still gets the app and its
 * "that article isn't here" message. Only the status changes.
 *
 * A missing ASSET is the same mistake in a different place. Every route this app
 * has is extensionless, so a path ending in a type we serve — .webp, .png, .js —
 * that reached the fallback is a file that is not there, not a page. Answering
 * 200 with HTML makes an <img> hold a document, hides the real error from the
 * browser, and tells anything that probes for the file that it exists: the
 * PyRunner Briefs screen asks the blog whether a cover has been drawn before it
 * shows one, got 200 for a cover no job has ever drawn, and rendered a broken
 * image on the card.
 */
const ASSET_EXT = new Set(Object.keys(MIME));

export function fallbackStatus(pathname) {
  if (pathname === "/blog" || pathname.startsWith("/blog/")) return 404;
  const ext = path.extname(pathname).toLowerCase();
  return ext && ASSET_EXT.has(ext) ? 404 : 200;
}
