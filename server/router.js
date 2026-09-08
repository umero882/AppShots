/**
 * Transport-agnostic API router. Maps (method, path) to a handler and normalizes
 * errors to { status, body }. Reused by the Vite dev middleware now and by any
 * Node/serverless wrapper later — no host-specific types leak in here.
 *
 * Endpoints that spend money (AI calls, outbound search proxies) are metered:
 * they require a Firebase ID token and are charged against the caller's daily
 * per-plan quota before the upstream request is made. See server/usage.js.
 *
 * The plan behind that quota is server-owned and never a client claim: it comes
 * from server/entitlement.js, which combines the user's own Stripe subscription
 * with any Team seat they hold.
 */
import { capabilities, suggest, image, search, translate, appStore, statusForError } from "./handlers.js";
import { requestPasswordReset, sendVerificationEmail } from "./authEmail.js";
import { verifyIdTokenClaims } from "./firebaseAuth.js";
import { planFor } from "./entitlement.js";
import { consume, refund } from "./usage.js";
import { deleteAccount } from "./account.js";
import { reportClientError } from "./clientErrors.js";
import { joinWaitlist } from "./waitlist.js";
import { handleTeam } from "./teams.js";
import { captureException } from "./sentry.js";

const ok = (body) => ({ status: 200, body });

/**
 * Which methods carry a JSON body worth parsing.
 *
 * Lives here, next to the routes, because both transports (server/index.js and
 * server/devProxy.js) have to agree. They did not: only POST was read, so every
 * PATCH handler was quietly handed `{}` — a rename that renamed nothing, and no
 * error anywhere to say why.
 */
export const methodHasBody = (method) => method === "POST" || method === "PATCH";

/** "METHOD /path" → quota kind. Everything listed here costs us money per call. */
const METERED = {
  "POST /api/ai/suggest": "suggest",
  "POST /api/ai/image": "image",
  "POST /api/ai/translate": "translate",
  "GET /api/search": "search",
  "GET /api/app-store": "appStore",
};

/**
 * Authenticate and charge one unit before a metered handler runs. Throws
 * `unauthorized`, `rate-limited`, `quota-exceeded` or `capacity-reached`.
 * Returns the charge (with the uid) so it can be refunded if the upstream fails.
 */
async function meter(key, headers, deps) {
  const kind = METERED[key];
  if (!kind) return null;
  const verify = deps.verifyIdTokenClaims || verifyIdTokenClaims;
  const charge = deps.consume || consume;
  const plans = deps.planFor || planFor;

  let claims;
  try {
    claims = await verify(headers.authorization || headers.Authorization);
  } catch {
    // Never leak why the token failed — expired, forged and absent look alike.
    throw new Error("unauthorized");
  }
  const uid = claims.sub;
  return {
    uid,
    ...charge({ uid, plan: await plans(uid), kind, emailVerified: claims.email_verified }),
  };
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
    // Browser-side crashes. Unmetered and open (a crash can happen before sign-in)
    // but rate-limited and size-capped inside the handler.
    if (key === "POST /api/client-error") return ok(await (deps.reportClientError || reportClientError)(body, headers, deps));
    // Open: the whole point is to hear from people who have not signed up.
    if (key === "POST /api/waitlist") return ok(await (deps.joinWaitlist || joinWaitlist)(body, headers, deps));
    // Team workspaces: seats, roles, invites, brand kit. Sub-paths carry ids and
    // tokens, so this one dispatches on the path itself rather than an exact key.
    if (path === "/api/team" || path.startsWith("/api/team/"))
      return ok(await (deps.handleTeam || handleTeam)({ method, path, query, body, headers }, deps));
    return { status: 404, body: { error: "not-found" } };
  } catch (e) {
    // The upstream failed (or was misconfigured) after we charged the caller —
    // an outage of ours must not eat someone's daily allowance.
    if (charged) (deps.refund || refund)(charged);
    // 5xx means we broke, not the caller — those are the ones worth waking up for.
    const status = statusForError(e.message);
    if (status >= 500) {
      (deps.captureException || captureException)(e, {
        tags: { scope: "api", route: key },
        extra: { code: e.message },
      });
    }
    // `.info` carries the quota details (limit, remaining, resetAt) so the UI can
    // say what ran out and when it comes back.
    return { status, body: { error: e.message, ...(e.info || {}) } };
  }
}
