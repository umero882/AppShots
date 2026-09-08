/**
 * Production server: serves the built SPA (dist/) and the /api/* proxy using the
 * same transport-agnostic router as the dev middleware. Zero runtime deps — only
 * Node built-ins — so the Docker image stays tiny.
 *
 * API keys come from the container's environment (set in Coolify), read by
 * server/handlers.js via process.env. They are never baked into the image.
 */
import http from "http";
import { readFile } from "fs/promises";
import { existsSync, statSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { route, methodHasBody } from "./router.js";
import { handleBlob } from "./blob.js";
import { handleStripe } from "./stripe.js";
import { contentTypeFor, cacheControlFor, fallbackStatus } from "./static.js";
import { captureException, sentryConfigured, installProcessHandlers } from "./sentry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");
// Where the persistent volume is mounted; BLOB_DIR/SUB_DIR/USAGE_DIR all live here.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const PORT = process.env.PORT || 3000;


function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");

    // Liveness: is the process answering? Deliberately cheap and dependency-free
    // — the Docker HEALTHCHECK restarts the container when this fails, so it must
    // not go red for a reason a restart cannot fix.
    if (u.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }

    // Readiness: can it actually serve? Checks the things whose absence makes the
    // app useless but the process healthy — the persistent volume above all,
    // because a missing mount loses uploads and entitlements silently.
    if (u.pathname === "/readyz") {
      const checks = { dataDir: false, blobDir: false, stripe: !!process.env.STRIPE_SECRET_KEY, sentry: sentryConfigured() };
      try {
        const probe = path.join(DATA_DIR, ".readyz");
        mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(probe, String(Date.now()));
        unlinkSync(probe);
        checks.dataDir = true;
      } catch {
        checks.dataDir = false;
      }
      checks.blobDir = existsSync(process.env.BLOB_DIR || path.join(DATA_DIR, "blobs"));
      const ready = checks.dataDir;
      sendJson(res, ready ? 200 : 503, { ready, checks });
      return;
    }

    // Blob store needs raw request/response (binary), so handle it before the
    // JSON router consumes the body.
    if (u.pathname === "/api/blob" || u.pathname.startsWith("/api/blob/")) {
      await handleBlob(req, res, u.pathname);
      return;
    }

    // Stripe needs raw bodies (webhook signatures) and request headers (auth), so
    // it also bypasses the generic JSON router.
    if (u.pathname === "/api/stripe" || u.pathname.startsWith("/api/stripe/")) {
      await handleStripe(req, res, u.pathname, Object.fromEntries(u.searchParams));
      return;
    }

    if (u.pathname.startsWith("/api/")) {
      const query = Object.fromEntries(u.searchParams);
      const body = methodHasBody(req.method) ? await readBody(req) : {};
      const result = await route({ method: req.method, path: u.pathname, query, body, headers: req.headers });
      sendJson(res, result.status, result.body);
      return;
    }

    // Static files with SPA fallback.
    let rel = decodeURIComponent(u.pathname);
    let filePath = path.join(DIST, rel);
    if (!filePath.startsWith(DIST)) {
      // path traversal attempt
      res.writeHead(403);
      res.end();
      return;
    }
    let isFile = existsSync(filePath) && statSync(filePath).isFile();
    // A prerendered page lives at dist/<route>/index.html. Without this the
    // directory misses and every public route falls back to the empty shell —
    // which is the exact bug prerendering exists to fix, so it would fail
    // silently and look like the prerender never ran.
    if (!isFile) {
      const indexed = path.join(filePath, "index.html");
      if (existsSync(indexed) && statSync(indexed).isFile()) {
        filePath = indexed;
        isFile = true;
      }
    }
    let status = 200;
    if (!isFile) {
      // The empty shell, not the prerendered homepage: a signed-in route must
      // not be handed the landing page's markup and canonical.
      const shell = path.join(DIST, "app-shell.html");
      filePath = existsSync(shell) ? shell : path.join(DIST, "index.html");
      // Every article is prerendered, so a /blog/ path that reached here is not
      // one. See fallbackStatus.
      status = fallbackStatus(u.pathname);
    }
    const data = await readFile(filePath);
    res.writeHead(status, {
      "content-type": contentTypeFor(filePath),
      "cache-control": cacheControlFor(filePath, DIST),
    });
    res.end(data);
  } catch (e) {
    // Nothing below this point can report itself — this is the last catch before
    // the socket, so it is the one that must tell us.
    captureException(e, {
      tags: { scope: "http" },
      request: { url: req.url, method: req.method, headers: req.headers },
    });
    console.error("server error:", req.method, req.url, e);
    sendJson(res, 500, { error: "server-error", detail: String(e?.message || e) });
  }
});

installProcessHandlers();

server.listen(PORT, () => {
  console.log(`AppShots server listening on :${PORT}`);
});
