/**
 * Browser crash reports → Sentry.
 *
 * The client could talk to Sentry directly, but that means shipping an SDK to
 * every visitor and putting an ingest key in the bundle. Forwarding through our
 * own origin keeps the bundle small, keeps the DSN server-side, and lets us
 * attach the signed-in user without the browser asserting who it is.
 *
 * This endpoint is open by design — a crash often happens before sign-in, and a
 * crash report that requires a working app is worthless — so it is treated as
 * hostile input: size-capped, field-capped, and rate-limited as a whole.
 */
import { captureException } from "./sentry.js";
import { verifyIdToken } from "./firebaseAuth.js";

const MAX_PER_MINUTE = Number(process.env.CLIENT_ERROR_MAX_PER_MINUTE) || 60;
const MAX_FIELD = 2000;

let windowStart = 0;
let count = 0;

function overBudget(now) {
  if (now - windowStart > 60_000) {
    windowStart = now;
    count = 0;
  }
  return ++count > MAX_PER_MINUTE;
}

const clip = (v, max = MAX_FIELD) => (typeof v === "string" ? v.slice(0, max) : undefined);

/**
 * Accept one browser error report. Always resolves — a failure to record a crash
 * must not produce a second one.
 */
export async function reportClientError(body = {}, headers = {}, deps = {}) {
  const now = deps.now || Date.now();
  if (overBudget(now)) return { ok: false, reason: "rate-limited" };

  const message = clip(body.message, 500);
  if (!message) return { ok: false, reason: "empty" };

  // Identify the reporter only if they hold a real token; never trust a uid in
  // the body, and never fail the report because the token was bad.
  let uid = null;
  try {
    const verify = deps.verifyIdToken || verifyIdToken;
    if (headers.authorization || headers.Authorization) {
      uid = await verify(headers.authorization || headers.Authorization);
    }
  } catch {
    uid = null;
  }

  const error = new Error(message);
  error.name = clip(body.name, 100) || "ClientError";
  error.stack = clip(body.stack, 8000) || "";

  (deps.captureException || captureException)(error, {
    level: body.level === "warning" ? "warning" : "error",
    platform: "javascript",
    tags: { scope: "browser", kind: clip(body.kind, 40) || "error" },
    ...(uid ? { user: { id: uid } } : {}),
    request: { url: clip(body.url, 500), method: "GET", headers: {} },
    extra: {
      userAgent: clip(headers["user-agent"], 300),
      componentStack: clip(body.componentStack, 4000),
      appVersion: clip(body.appVersion, 60),
    },
  });

  return { ok: true };
}

/** Test hook: forget the rate-limit window. */
export function _resetClientErrorBudget() {
  windowStart = 0;
  count = 0;
}
