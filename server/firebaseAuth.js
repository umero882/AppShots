/**
 * Verifies Firebase Auth ID tokens server-side using only Node built-ins (no
 * firebase-admin dep). A valid ID token is an RS256 JWT signed by Google; we
 * fetch Google's public X.509 certs, check the signature + standard claims, and
 * return the user's uid. Used to gate blob uploads to authenticated users.
 */
import { createPublicKey, verify as cryptoVerify } from "crypto";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "appshots-76a56";
const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const ISS = `https://securetoken.google.com/${PROJECT_ID}`;

let certsCache = { certs: null, exp: 0 };

async function getCerts(now) {
  if (certsCache.certs && certsCache.exp > now) return certsCache.certs;
  // Fail fast (don't hang the request) if Google is unreachable.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(CERTS_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error("certs-fetch-failed");
    const certs = await res.json();
    const cc = res.headers.get("cache-control") || "";
    const m = cc.match(/max-age=(\d+)/);
    const ttl = m ? Number(m[1]) * 1000 : 3600 * 1000;
    certsCache = { certs, exp: now + ttl };
    return certs;
  } finally {
    clearTimeout(timer);
  }
}

function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function b64urlToJson(s) {
  return JSON.parse(b64urlToBuf(s).toString("utf8"));
}

/**
 * Pure verifier (certs injected) — exported for tests. Throws on any failure,
 * returns the full token claims (`payload`) on success. `nowSec` overridable for
 * deterministic tests.
 */
export function verifyIdTokenClaimsWithCerts(idToken, certs, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = (idToken || "").split(".");
  if (parts.length !== 3) throw new Error("malformed-token");
  const header = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);

  if (header.alg !== "RS256") throw new Error("bad-alg");
  if (payload.aud !== PROJECT_ID) throw new Error("bad-audience");
  if (payload.iss !== ISS) throw new Error("bad-issuer");
  if (!payload.sub) throw new Error("no-subject");
  if (typeof payload.exp === "number" && payload.exp < nowSec) throw new Error("expired");
  if (typeof payload.iat === "number" && payload.iat > nowSec + 300) throw new Error("issued-in-future");

  const cert = certs[header.kid];
  if (!cert) throw new Error("unknown-key-id");
  const publicKey = createPublicKey(cert);
  const signed = Buffer.from(parts[0] + "." + parts[1]);
  const okSig = cryptoVerify("RSA-SHA256", signed, publicKey, b64urlToBuf(parts[2]));
  if (!okSig) throw new Error("bad-signature");

  return payload;
}

/**
 * Pure verifier returning just the uid (`sub`) — kept for callers that only need
 * identity. Exported for tests.
 */
export function verifyIdTokenWithCerts(idToken, certs, nowSec = Math.floor(Date.now() / 1000)) {
  return verifyIdTokenClaimsWithCerts(idToken, certs, nowSec).sub;
}

/** Verify the token from an `Authorization: Bearer <token>` header → full claims. */
export async function verifyIdTokenClaims(authHeader) {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("missing-token");
  const now = Math.floor(Date.now() / 1000);
  const certs = await getCerts(Date.now());
  return verifyIdTokenClaimsWithCerts(token, certs, now);
}

/** Verify the token from an `Authorization: Bearer <token>` header → uid. */
export async function verifyIdToken(authHeader) {
  return (await verifyIdTokenClaims(authHeader)).sub;
}
