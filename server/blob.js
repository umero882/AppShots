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
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "fs";
import path from "path";
import { verifyIdToken } from "./firebaseAuth.js";
import { planFor } from "./entitlement.js";

const BLOB_DIR = process.env.BLOB_DIR || path.join(process.cwd(), "data", "blobs");
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB ceiling per blob

/**
 * Total stored bytes allowed per plan. The 25 MB per-file cap said nothing about
 * how many files, so a free account could fill the volume one 25 MB upload at a
 * time — and every byte of it is copied to R2 every night.
 *
 * `team` is charged against EACH SEAT's own counter, not once per workspace, so
 * the real ceiling is this number times the seat count. It was 20 GB when "team"
 * meant one account; five seats turned that into 100 GB of volume and nightly
 * backup for $29/month, against 5 GB for a $9 Pro user. It is now the same 5 GB
 * a Pro seat gets — which is exactly what the pricing card sells ("Everything in
 * Pro, for all 5 seats") — so a full workspace holds 25 GB for 3.2x Pro's price.
 * Raise `STORAGE_QUOTA_TEAM` if that turns out to be tight; it needs no deploy.
 */
export const STORAGE_QUOTAS = {
  free: Number(process.env.STORAGE_QUOTA_FREE) || 100 * 1024 * 1024, // 100 MB
  pro: Number(process.env.STORAGE_QUOTA_PRO) || 5 * 1024 * 1024 * 1024, // 5 GB
  team: Number(process.env.STORAGE_QUOTA_TEAM) || 5 * 1024 * 1024 * 1024, // 5 GB per seat
};

export const storageQuotaFor = (plan) => STORAGE_QUOTAS[plan] || STORAGE_QUOTAS.free;

const QUOTA_DIR = path.join(BLOB_DIR, ".quota");
const validUid = (uid) => (typeof uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? uid : null);
const quotaPath = (uid) => path.join(QUOTA_DIR, `${uid}.json`);

/**
 * Bytes this user is currently storing. The counter is a cache: if it is missing
 * (first upload after this shipped, or a restore from backup) it is rebuilt by
 * scanning the metadata, so the number is never guessed.
 */
export function usedBytes(uid) {
  if (!validUid(uid)) return 0;
  try {
    const rec = JSON.parse(readFileSync(quotaPath(uid), "utf8"));
    if (Number.isFinite(rec.bytes)) return Math.max(0, rec.bytes);
  } catch {
    /* fall through to a rebuild */
  }
  return rebuildUsage(uid).bytes;
}

/** Recount from the metadata on disk — the source of truth. */
export function rebuildUsage(uid) {
  let bytes = 0;
  let count = 0;
  if (validUid(uid) && existsSync(BLOB_DIR)) {
    for (const name of readdirSync(BLOB_DIR)) {
      if (!name.endsWith(".meta")) continue;
      try {
        const meta = JSON.parse(readFileSync(path.join(BLOB_DIR, name), "utf8"));
        if (meta.uid !== uid) continue;
        bytes += Number(meta.size) || 0;
        count++;
      } catch {
        /* skip unreadable */
      }
    }
  }
  writeUsage(uid, { bytes, count });
  return { bytes, count };
}

function writeUsage(uid, rec) {
  if (!validUid(uid)) return;
  try {
    if (!existsSync(QUOTA_DIR)) mkdirSync(QUOTA_DIR, { recursive: true });
    writeFileSync(quotaPath(uid), JSON.stringify({ bytes: Math.max(0, rec.bytes), count: Math.max(0, rec.count) }));
  } catch {
    /* a lost counter costs a rebuild, not correctness */
  }
}

/** Apply a delta after an upload (+) or a delete (−). */
export function addUsage(uid, deltaBytes, deltaCount = deltaBytes > 0 ? 1 : -1) {
  if (!validUid(uid)) return;
  let cur;
  try {
    cur = JSON.parse(readFileSync(quotaPath(uid), "utf8"));
  } catch {
    cur = rebuildUsage(uid);
    if (deltaBytes > 0) return; // the rebuild already counted this upload
  }
  writeUsage(uid, { bytes: (cur.bytes || 0) + deltaBytes, count: (cur.count || 0) + deltaCount });
}

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

/**
 * Delete every blob owned by `uid`. Used by account deletion — a project doc can
 * be removed without its blob, and an orphaned blob is still the user's data.
 * Returns how many were removed; safe to call twice.
 */
export function deleteBlobsForUid(uid) {
  if (!uid || !existsSync(BLOB_DIR)) return 0;
  let removed = 0;
  for (const name of readdirSync(BLOB_DIR)) {
    if (!name.endsWith(".meta")) continue; // also skips the .quota directory
    const id = validId(name.slice(0, -".meta".length));
    if (!id) continue;
    try {
      if (JSON.parse(readFileSync(path.join(BLOB_DIR, name), "utf8")).uid !== uid) continue;
    } catch {
      continue; // unreadable meta: leave it rather than delete someone else's blob
    }
    try {
      if (existsSync(blobPath(id))) unlinkSync(blobPath(id));
      unlinkSync(metaPath(id));
      removed++;
    } catch {
      /* already gone */
    }
  }
  try {
    unlinkSync(quotaPath(uid));
  } catch {
    /* no counter yet */
  }
  return removed;
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
      // Checked after the body is read, not before: the browser sends no reliable
      // length up front, and refusing on a guess would reject valid uploads.
      const plan = planFor(uid);
      const limit = storageQuotaFor(plan);
      const used = usedBytes(uid);
      if (used + buf.length > limit) {
        return sendJson(res, 413, {
          error: "storage-quota-exceeded",
          plan,
          limit,
          used,
          needed: buf.length,
        });
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
      addUsage(uid, buf.length, 1);
      return sendJson(res, 200, { id, url: `/api/blob/${id}`, storage: { used: used + buf.length, limit, plan } });
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
      const freed = Number(meta.size) || 0;
      try { unlinkSync(blobPath(id)); } catch {}
      try { unlinkSync(metaPath(id)); } catch {}
      if (freed) addUsage(uid, -freed, -1);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: "method-not-allowed" });
  } catch (e) {
    return sendJson(res, 500, { error: "blob-error", detail: String(e?.message || e) });
  }
}
