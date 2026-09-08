/**
 * Firestore writes with the SERVICE ACCOUNT, for the few documents the client
 * must never be able to forge.
 *
 * Team membership decides who can open a shared project — so it is exactly the
 * kind of document a member could grant themselves if the client wrote it. The
 * security rules therefore make `teams/**` read-only to every client, and this
 * module is the only writer: an admin OAuth token bypasses rules, so the roster
 * the rules read is always the one the server put there.
 *
 * Zero deps, like the rest of the backend: the same service-account JWT flow
 * used for the branded auth emails (server/googleToken.js), pointed at the
 * Firestore REST API instead of Identity Toolkit.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (JSON or base64 JSON), FIREBASE_PROJECT_ID.
 * Unset means no mirror — team seats and billing still work, but sharing is
 * reported as unavailable rather than silently half-working. See teams.js.
 */
import { parseServiceAccount, serviceAccountToken } from "./googleToken.js";
import { toFirestoreFields } from "./firestoreCodec.js";

const SCOPE = "https://www.googleapis.com/auth/datastore";

const env = (k) => process.env[k] || "";
const projectId = () => env("FIREBASE_PROJECT_ID") || "appshots-76a56";

const base = () =>
  `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents`;

/** Is the admin path usable at all? Callers degrade instead of throwing. */
export function firestoreAdminConfigured() {
  return !!parseServiceAccount(env("FIREBASE_SERVICE_ACCOUNT"));
}

/**
 * One authenticated Firestore REST call as the service account.
 * Returns parsed JSON, or null on 404. Throws `firestore-admin-*` on the rest.
 */
export async function adminFs(
  pathname,
  { method = "GET", body, query = "", fetchImpl = fetch, tokenFn = serviceAccountToken } = {},
) {
  const sa = parseServiceAccount(env("FIREBASE_SERVICE_ACCOUNT"));
  if (!sa) throw new Error("firestore-admin-not-configured");

  let token;
  try {
    token = await tokenFn(sa, SCOPE, { fetchImpl });
  } catch {
    throw new Error("firestore-admin-token-failed");
  }

  const res = await fetchImpl(base() + pathname + query, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error("firestore-admin-failed");
    e.detail = json?.error?.message || `HTTP ${res.status}`;
    throw e;
  }
  return json;
}

/**
 * Upsert a document, writing only the given fields.
 *
 * A masked PATCH cannot create a missing document (Firestore answers 404), so a
 * maskless PATCH is the fallback — the same two-step the client backend uses.
 */
export async function adminSet(docPath, data, opts = {}) {
  const fields = toFirestoreFields(data);
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const res = await adminFs(docPath, { ...opts, method: "PATCH", query: "?" + mask, body: { fields } });
  if (res !== null) return res;
  return adminFs(docPath, { ...opts, method: "PATCH", body: { fields } });
}

/** Delete a document. A missing document is a success — this is used to clean up. */
export async function adminDelete(docPath, opts = {}) {
  await adminFs(docPath, { ...opts, method: "DELETE" });
  return true;
}

/**
 * Delete every document in a collection, a page at a time.
 *
 * Used when a team is disbanded: the roster must not outlive the team, or its
 * rules would keep authorizing access to projects that still carry the team id.
 */
export async function adminDeleteCollection(collectionPath, opts = {}) {
  let removed = 0;
  for (let page = 0; page < 20; page++) {
    const res = await adminFs(collectionPath, { ...opts, query: "?pageSize=300" });
    const docs = res?.documents || [];
    if (!docs.length) break;
    for (const d of docs) {
      const rel = String(d.name || "").split("/documents")[1];
      if (rel) {
        await adminDelete(rel, opts);
        removed++;
      }
    }
    if (docs.length < 300) break;
  }
  return removed;
}
