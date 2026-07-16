/**
 * Same-origin blob store for large project state that would exceed Firestore's
 * 1 MB document limit. Because these blobs are served from the app's own origin,
 * their URLs are always reachable (unlike blocked Firebase Storage) and never
 * taint the export canvas.
 *
 *   POST   /api/blob        (auth: Firebase ID token)  -> { id, url }
 *   GET    /api/blob/{id}   (public; ids are unguessable)
 *   DELETE /api/blob/{id}   (auth; owner only)
 *
 * Blobs live on disk under BLOB_DIR. In production mount a persistent volume
 * there (default /app/data/blobs) or projects vanish on redeploy.
 */
import { randomBytes } from "crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import path from "path";
import { verifyIdToken } from "./firebaseAuth.js";

const BLOB_DIR = process.env.BLOB_DIR || path.join(process.cwd(), "data", "blobs");
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB ceiling per blob

function ensureDir() {
  if (!existsSync(BLOB_DIR)) mkdirSync(BLOB_DIR, { recursive: true });
}
const blobPath = (id) => path.join(BLOB_DIR, id);
const metaPath = (id) => path.join(BLOB_DIR, id + ".meta");
// Ids are 32 hex chars — reject anything else so path traversal is impossible.
const validId = (id) => (/^[a-f0-9]{32}$/.test(id) ? id : null);

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readRaw(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("too-large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Handle any /api/blob* request. `pathname` is the URL path (no query). */
export async function handleBlob(req, res, pathname) {
  try {
    ensureDir();
    const rest = pathname.slice("/api/blob".length).replace(/^\//, "");
    const method = req.method;

    // Upload (auth required).
    if (method === "POST" && !rest) {
      let uid;
      try {
        uid = await verifyIdToken(req.headers["authorization"]);
      } catch {
        return sendJson(res, 401, { error: "unauthorized" });
      }
      let buf;
      try {
        buf = await readRaw(req, MAX_BYTES);
      } catch {
        return sendJson(res, 413, { error: "payload-too-large" });
      }
      const id = randomBytes(16).toString("hex");
      writeFileSync(blobPath(id), buf);
      writeFileSync(
        metaPath(id),
        JSON.stringify({
          uid,
          contentType: req.headers["content-type"] || "application/octet-stream",
          size: buf.length,
          createdAt: Date.now(),
        })
      );
      return sendJson(res, 200, { id, url: `/api/blob/${id}` });
    }

    // Download (public — ids are unguessable random).
    if (method === "GET" && rest) {
      const id = validId(rest);
      if (!id || !existsSync(blobPath(id))) {
        res.writeHead(404);
        return res.end();
      }
      let meta = {};
      try {
        meta = JSON.parse(readFileSync(metaPath(id), "utf8"));
      } catch {}
      res.writeHead(200, {
        "content-type": meta.contentType || "application/octet-stream",
        "cache-control": "private, max-age=31536000, immutable",
      });
      return res.end(readFileSync(blobPath(id)));
    }

    // Delete (owner only).
    if (method === "DELETE" && rest) {
      const id = validId(rest);
      if (!id) {
        res.writeHead(404);
        return res.end();
      }
      let uid;
      try {
        uid = await verifyIdToken(req.headers["authorization"]);
      } catch {
        return sendJson(res, 401, { error: "unauthorized" });
      }
      let meta = {};
      try {
        meta = JSON.parse(readFileSync(metaPath(id), "utf8"));
      } catch {}
      if (meta.uid && meta.uid !== uid) return sendJson(res, 403, { error: "forbidden" });
      try { unlinkSync(blobPath(id)); } catch {}
      try { unlinkSync(metaPath(id)); } catch {}
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: "method-not-allowed" });
  } catch (e) {
    return sendJson(res, 500, { error: "blob-error", detail: String(e?.message || e) });
  }
}
