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
import { existsSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { route } from "./router.js";
import { handleBlob } from "./blob.js";
import { handleStripe } from "./stripe.js";
import { contentTypeFor, cacheControlFor } from "./static.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");
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

    if (u.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
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
      const body = req.method === "POST" ? await readBody(req) : {};
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
    const isFile = existsSync(filePath) && statSync(filePath).isFile();
    if (!isFile) {
      filePath = path.join(DIST, "index.html"); // SPA fallback
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": contentTypeFor(filePath),
      "cache-control": cacheControlFor(filePath, DIST),
    });
    res.end(data);
  } catch (e) {
    sendJson(res, 500, { error: "server-error", detail: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`AppShots server listening on :${PORT}`);
});
