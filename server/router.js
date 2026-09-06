/**
 * Transport-agnostic API router. Maps (method, path) to a handler and normalizes
 * errors to { status, body }. Reused by the Vite dev middleware now and by any
 * Node/serverless wrapper later — no host-specific types leak in here.
 *
 * Endpoints that spend money (AI calls, outbound search proxies) are metered:
 * they require a Firebase ID token and are charged against the caller's daily
 * per-plan quota before the upstream request is made. See server/usage.js.
 */
import { capabilities, suggest, image, search, translate, appStore, statusForError } from "./handlers.js";
import { requestPasswordReset, sendVerificationEmail } from "./authEmail.js";
import { verifyIdToken } from "./firebaseAuth.js";
import { readRecord, publicEntitlement } from "./stripe.js";
import { consume, refund } from "./usage.js";
import { deleteAccount } from "./account.js";

const ok = (body) => ({ status: 200, body });

/** "METHOD /path" → quota kind. Everything listed here costs us money per call. */
const METERED = {
  "POST /api/ai/suggest": "suggest",
  "POST /api/ai/image": "image",
  "POST /api/ai/translate": "translate",
  "GET /api/search": "search",
  "GET /api/app-store": "appStore",
};

/** Entitlement is server-owned: read the Stripe record, never a client claim. */
function planFor(uid) {
  try {
    return publicEntitlement(readRecord(uid)).plan || "free";
  } catch {
    return "free";
  }
}

/**
 * Authenticate and charge one unit before a metered handler runs. Throws
 * `unauthorized`, `rate-limited`, `quota-exceeded` or `capacity-reached`.
 * Returns the charge (with the uid) so it can be refunded if the upstream fails.
 */
async function meter(key, headers, deps) {
  const kind = METERED[key];
  if (!kind) return null;
  const verify = deps.verifyIdToken || verifyIdToken;
  const charge = deps.consume || consume;
  const plans = deps.planFor || planFor;

  let uid;
  try {
    uid = await verify(headers.authorization || headers.Authorization);
  } catch {
    // Never leak why the token failed — expired, forged and absent look alike.
    throw new Error("unauthorized");
  }
  return { uid, ...charge({ uid, plan: await plans(uid), kind }) };
}

export async function route({ method, path, query = {}, body = {}, headers = {} }, deps = {}) {
  const key = `${method} ${path}`;
  let charged = null;
  try {
    if (key === "GET /api/capabilities") return ok(capabilities());

    charged = await meter(key, headers, deps);

    if (key === "POST /api/ai/suggest") return ok(await suggest(body));
    if (key === "POST /api/ai/image") return ok(await image(body));
    if (key === "POST /api/ai/translate") return ok(await translate(body));
    if (key === "GET /api/search") return ok(await search(query.q || ""));
    if (key === "GET /api/app-store") return ok(await appStore(query));
    if (key === "POST /api/auth/password-reset") return ok(await requestPasswordReset(body));
    if (key === "POST /api/auth/send-verification") return ok(await sendVerificationEmail(headers));
    // Authenticates itself (the caller's own token decides whose account it is)
    // and is never metered — nobody should be rate-limited out of leaving.
    if (key === "DELETE /api/account") return ok(await (deps.deleteAccount || deleteAccount)(headers, deps));
    return { status: 404, body: { error: "not-found" } };
  } catch (e) {
    // The upstream failed (or was misconfigured) after we charged the caller —
    // an outage of ours must not eat someone's daily allowance.
    if (charged) (deps.refund || refund)(charged);
    // `.info` carries the quota details (limit, remaining, resetAt) so the UI can
    // say what ran out and when it comes back.
    return { status: statusForError(e.message), body: { error: e.message, ...(e.info || {}) } };
  }
}
