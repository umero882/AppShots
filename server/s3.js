/**
 * Minimal S3 client (AWS Signature V4) on Node built-ins only — no aws-sdk. Works
 * with any S3-compatible store (Hostinger Object Storage, AWS, R2, B2, MinIO).
 * Path-style requests (`https://endpoint/bucket/key`) by default, which every
 * compatible provider accepts; set `virtualHost: true` for `bucket.endpoint`.
 *
 * Supports exactly what the backup job needs: putObject, getObject,
 * listObjects (v2, paginated), deleteObject.
 */
import { createHash, createHmac } from "crypto";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const encodeRfc3986 = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
// S3 keys keep "/" unencoded in the canonical URI.
const encodePath = (p) => p.split("/").map(encodeRfc3986).join("/");

export function s3ConfigFromEnv(env = process.env) {
  return {
    endpoint: env.BACKUP_S3_ENDPOINT || "",
    bucket: env.BACKUP_S3_BUCKET || "",
    region: env.BACKUP_S3_REGION || "us-east-1",
    accessKey: env.BACKUP_S3_ACCESS_KEY || "",
    secretKey: env.BACKUP_S3_SECRET_KEY || "",
    virtualHost: env.BACKUP_S3_VIRTUAL_HOST === "true",
  };
}
export const s3Configured = (c = s3ConfigFromEnv()) => !!(c.endpoint && c.bucket && c.accessKey && c.secretKey);

/** Build a signed request. Exported for tests (deterministic given `now`). */
export function signRequest(cfg, { method, key = "", query = {}, headers = {}, body = null, now = new Date() }) {
  const url = new URL(cfg.endpoint.includes("://") ? cfg.endpoint : `https://${cfg.endpoint}`);
  const host = cfg.virtualHost ? `${cfg.bucket}.${url.host}` : url.host;
  const basePath = url.pathname.replace(/\/$/, "");
  const objectPath = (cfg.virtualHost ? "" : `/${cfg.bucket}`) + (key ? `/${encodePath(key)}` : "");
  const canonicalUri = (basePath + objectPath) || "/";

  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = body == null ? sha256("") : sha256(body);

  const allHeaders = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])),
  };
  const signedHeaderNames = Object.keys(allHeaders).sort();
  const canonicalHeaders = signedHeaderNames.map((k) => `${k}:${allHeaders[k]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(String(query[k]))}`)
    .join("&");

  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${cfg.secretKey}`, dateStamp), cfg.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const { host: _h, ...sendHeaders } = allHeaders;
  sendHeaders.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const requestUrl = `${url.protocol}//${host}${canonicalUri}${canonicalQuery ? "?" + canonicalQuery : ""}`;
  return { url: requestUrl, headers: sendHeaders, signature, canonicalRequest, stringToSign };
}

async function request(cfg, opts, { fetchImpl = fetch } = {}) {
  const { url, headers } = signRequest(cfg, opts);
  const res = await fetchImpl(url, { method: opts.method, headers, body: opts.body ?? undefined });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const code = (text.match(/<Code>([^<]+)<\/Code>/) || [])[1] || res.status;
    const err = new Error(`s3-${opts.method.toLowerCase()}-failed: ${code}`);
    err.status = res.status;
    err.body = text.slice(0, 500);
    throw err;
  }
  return res;
}

export async function putObject(cfg, key, body, { contentType = "application/octet-stream", fetchImpl } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  await request(cfg, { method: "PUT", key, body: buf, headers: { "content-type": contentType, "content-length": String(buf.length) } }, { fetchImpl });
  return { key, size: buf.length };
}

export async function getObject(cfg, key, { fetchImpl } = {}) {
  const res = await request(cfg, { method: "GET", key }, { fetchImpl });
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteObject(cfg, key, { fetchImpl } = {}) {
  await request(cfg, { method: "DELETE", key }, { fetchImpl });
}

/** True if the bucket exists and we can reach it (HEAD bucket → 200). */
export async function bucketExists(cfg, { fetchImpl } = {}) {
  try {
    await request(cfg, { method: "HEAD" }, { fetchImpl });
    return true;
  } catch (e) {
    if (e.status === 404) return false;
    throw e;
  }
}

/** Create the bucket (idempotent: an existing bucket you own is fine). */
export async function createBucket(cfg, { fetchImpl } = {}) {
  try {
    await request(cfg, { method: "PUT" }, { fetchImpl });
    return { created: true };
  } catch (e) {
    if (/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(e.message)) return { created: false };
    throw e;
  }
}

/** List all objects under a prefix (follows continuation tokens). */
export async function listObjects(cfg, prefix = "", { fetchImpl } = {}) {
  const out = [];
  let token = null;
  do {
    const query = { "list-type": "2", prefix, "max-keys": "1000" };
    if (token) query["continuation-token"] = token;
    const res = await request(cfg, { method: "GET", query }, { fetchImpl });
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const c = m[1];
      out.push({
        key: (c.match(/<Key>([^<]+)<\/Key>/) || [])[1],
        size: Number((c.match(/<Size>(\d+)<\/Size>/) || [])[1] || 0),
        lastModified: (c.match(/<LastModified>([^<]+)<\/LastModified>/) || [])[1],
      });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] : null;
  } while (token);
  return out.map((o) => ({ ...o, key: o.key?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") }));
}
