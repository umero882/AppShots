/**
 * Google OAuth2 access tokens from a service-account key, with only Node's
 * `crypto` (no google-auth-library). Signs a JWT (RS256) and exchanges it at the
 * token endpoint; tokens are cached per (client_email, scope) until shortly
 * before expiry.
 */
import { createSign } from "crypto";

const b64url = (input) =>
  Buffer.from(typeof input === "string" ? input : JSON.stringify(input))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Build the signed assertion (exported so tests can verify the signature). */
export function buildJwt(sa, scope, nowSec = Math.floor(Date.now() / 1000), ttlSec = 3600) {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + ttlSec,
  };
  const signingInput = `${b64url(header)}.${b64url(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = signer.sign(sa.private_key, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${signingInput}.${signature}`;
}

/**
 * Parse FIREBASE_SERVICE_ACCOUNT: raw JSON, or base64 of the JSON (handy for env
 * vars that dislike newlines). Returns null when unset/invalid.
 */
export function parseServiceAccount(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  try {
    const json = s.startsWith("{") ? s : Buffer.from(s, "base64").toString("utf8");
    const sa = JSON.parse(json);
    if (!sa.client_email || !sa.private_key) return null;
    return sa;
  } catch {
    return null;
  }
}

const cache = new Map(); // key -> { token, exp }

export async function serviceAccountToken(sa, scope, { fetchImpl = fetch } = {}) {
  const key = `${sa.client_email}|${scope}`;
  const hit = cache.get(key);
  const now = Math.floor(Date.now() / 1000);
  if (hit && hit.exp - 60 > now) return hit.token;

  const assertion = buildJwt(sa, scope, now);
  const res = await fetchImpl(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`google-token-failed: ${json.error_description || json.error || res.status}`);
  }
  cache.set(key, { token: json.access_token, exp: now + (Number(json.expires_in) || 3600) });
  return json.access_token;
}

export function _clearTokenCache() {
  cache.clear();
}
