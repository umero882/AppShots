/**
 * Error reporting to Sentry over its HTTP envelope API — no SDK.
 *
 * The runtime image ships no node_modules (see Dockerfile), so `@sentry/node` is
 * not an option here. An envelope is three newline-delimited JSON blobs POSTed to
 * the project's ingest URL, which is little enough to write out.
 *
 * Rules this module lives by, because monitoring must never be the thing that
 * breaks production:
 *   - it never throws — every failure path is swallowed;
 *   - it never blocks a response (fire-and-forget, with a short timeout);
 *   - it drops events rather than queue without bound when something loops;
 *   - it strips credentials before sending anything.
 *
 * Off unless SENTRY_DSN is set, so local dev and tests stay silent.
 */
const DSN = process.env.SENTRY_DSN || "";
const ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
const RELEASE = process.env.SENTRY_RELEASE || "";
const MAX_PER_MINUTE = Number(process.env.SENTRY_MAX_PER_MINUTE) || 30;
const TIMEOUT_MS = 3000;

/** Split a DSN into the pieces the ingest request needs. Null if unusable. */
export function parseDsn(dsn) {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return {
      publicKey: u.username,
      projectId,
      envelopeUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

/** `    at fn (/app/server/x.js:12:34)` → Sentry frames, oldest first. */
export function parseStack(stack = "") {
  const frames = [];
  for (const line of String(stack).split("\n").slice(1)) {
    const m = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const filename = m[2].replace(/^file:\/\//, "");
    frames.push({
      function: m[1] || "<anonymous>",
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes("node_modules") && !filename.startsWith("node:"),
    });
  }
  return frames.reverse(); // Sentry renders the throwing frame last
}

const SECRET_HEADERS = new Set(["authorization", "cookie", "set-cookie", "stripe-signature", "x-api-key"]);

/** Headers worth having, minus anything that could be replayed. */
export function safeHeaders(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    out[key] = SECRET_HEADERS.has(key) ? "[redacted]" : String(v).slice(0, 200);
  }
  return out;
}

/** A URL without its query string — tokens and emails hide in query strings. */
export function safeUrl(url = "") {
  return String(url).split("?")[0].slice(0, 500);
}

// Simple sliding-minute budget. A crash loop should cost one burst of events,
// not an unbounded stream of them.
let windowStart = 0;
let sentInWindow = 0;
let dropped = 0;

function overBudget(now) {
  if (now - windowStart > 60_000) {
    // Report what the previous window swallowed, so a silent gap is visible.
    if (dropped > 0) {
      const n = dropped;
      dropped = 0;
      queueMicrotask(() => captureMessage(`${n} error events dropped by the rate limiter`, "warning"));
    }
    windowStart = now;
    sentInWindow = 0;
  }
  if (sentInWindow >= MAX_PER_MINUTE) {
    dropped++;
    return true;
  }
  sentInWindow++;
  return false;
}

function eventId() {
  // 32 hex chars, no dashes — Sentry's id format.
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

async function send(event, { dsn = DSN, fetchImpl = fetch, now = Date.now() } = {}) {
  const parsed = parseDsn(dsn);
  if (!parsed) return null;
  if (overBudget(now)) return null;

  const id = eventId();
  const body =
    JSON.stringify({ event_id: id, sent_at: new Date(now).toISOString(), dsn }) +
    "\n" +
    JSON.stringify({ type: "event" }) +
    "\n" +
    JSON.stringify({
      event_id: id,
      timestamp: now / 1000,
      platform: "node",
      environment: ENVIRONMENT,
      ...(RELEASE ? { release: RELEASE } : {}),
      server_name: "appshots",
      ...event,
    });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    await fetchImpl(parsed.envelopeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_client=appshots/1.0, sentry_key=${parsed.publicKey}`,
      },
      body,
      signal: ctrl.signal,
    });
    return id;
  } catch {
    return null; // never let reporting failure surface
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Report an error. Fire-and-forget: returns a promise for tests, but callers are
 * not expected to await it.
 * @param {Error|string} err
 * @param {{level?: string, tags?: object, extra?: object, user?: object,
 *          request?: {url?: string, method?: string, headers?: object}}} context
 */
export function captureException(err, context = {}, opts = {}) {
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    const { request, ...rest } = context;
    return send(
      {
        level: context.level || "error",
        exception: {
          values: [
            {
              type: error.name || "Error",
              value: String(error.message || error).slice(0, 1000),
              stacktrace: { frames: parseStack(error.stack) },
            },
          ],
        },
        ...(request
          ? {
              request: {
                url: safeUrl(request.url),
                method: request.method,
                headers: safeHeaders(request.headers),
              },
            }
          : {}),
        ...rest,
      },
      opts,
    );
  } catch {
    return Promise.resolve(null);
  }
}

/** Report a plain message (no exception object). */
export function captureMessage(message, level = "info", context = {}, opts = {}) {
  try {
    return send({ level, message: { formatted: String(message).slice(0, 1000) }, ...context }, opts);
  } catch {
    return Promise.resolve(null);
  }
}

/** True when a DSN is configured — used by /readyz to report the wiring. */
export function sentryConfigured(dsn = DSN) {
  return !!parseDsn(dsn);
}

/**
 * Catch what the request handlers cannot. An uncaught exception leaves the
 * process in an unknown state, so we report it and let the container restart —
 * Docker's HEALTHCHECK and Coolify bring it back.
 */
export function installProcessHandlers(proc = process) {
  proc.on("unhandledRejection", (reason) => {
    captureException(reason, { tags: { handler: "unhandledRejection" } });
  });
  proc.on("uncaughtException", async (err) => {
    console.error("uncaught exception:", err);
    await captureException(err, { level: "fatal", tags: { handler: "uncaughtException" } });
    proc.exit(1);
  });
}

/** Test hook: forget the rate-limit window. */
export function _resetSentryBudget() {
  windowStart = 0;
  sentInWindow = 0;
  dropped = 0;
}
