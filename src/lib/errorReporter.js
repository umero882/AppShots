/**
 * Browser crash reporting — BROWSER side.
 *
 * Posts to our own `/api/client-error`, which forwards to Sentry. No SDK and no
 * ingest key in the bundle; see server/clientErrors.js for why.
 *
 * Deliberately quiet: a broken page can fire the same error on every frame, so
 * reports are deduped and capped per session. Losing the 6th copy of an error
 * costs nothing; sending it hundreds of times costs the user's battery and our
 * quota.
 */
import { authHeaders } from "./apiClient";

const MAX_PER_SESSION = 5;
const seen = new Set();
let sent = 0;

/** Report one error. Never throws, never rejects. */
export async function reportError(error, { kind = "error", componentStack, level } = {}) {
  try {
    const message = String(error?.message || error || "").slice(0, 500);
    if (!message) return false;

    // One report per unique message+kind per session.
    const key = `${kind}:${message}`;
    if (seen.has(key) || sent >= MAX_PER_SESSION) return false;
    seen.add(key);
    sent++;

    const headers = { "content-type": "application/json", ...(await authHeaders()) };
    await fetch("/api/client-error", {
      method: "POST",
      headers,
      keepalive: true, // survives the navigation an error often triggers
      body: JSON.stringify({
        message,
        name: error?.name,
        stack: String(error?.stack || "").slice(0, 8000),
        url: window.location?.href,
        kind,
        level,
        componentStack,
        appVersion: import.meta.env?.VITE_APP_VERSION,
      }),
    });
    return true;
  } catch {
    return false; // reporting must never cause a second failure
  }
}

/** Hook the two events that catch everything React's boundary does not. */
export function installErrorReporting(target = window) {
  target.addEventListener("error", (e) => {
    // Resource load failures (img/script) arrive here with no error object and
    // are noise, not crashes.
    if (!e?.error) return;
    reportError(e.error, { kind: "window.onerror" });
  });
  target.addEventListener("unhandledrejection", (e) => {
    reportError(e?.reason, { kind: "unhandledrejection" });
  });
}

/** Test hook. */
export function _resetErrorReporter() {
  seen.clear();
  sent = 0;
}
