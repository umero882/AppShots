/**
 * Analytics consent — the switch everything non-essential asks before running.
 *
 * The policy said consent was obtained "where required" and nothing ever asked,
 * which is the gap this closes. The rule taken here is opt-in for everyone
 * rather than opt-in for visitors we guess are in the EEA: geolocation from the
 * browser is a guess (timezone, language, a VPN), and getting the guess wrong
 * means tracking someone who never agreed. Asking everyone costs some analytics
 * volume and is defensible everywhere.
 *
 * Essential storage — the sign-in session, editor preferences — is not covered
 * and is not optional: the product does not function without it. Only analytics
 * waits for an answer.
 */
const KEY = "appshots:cookie-consent";
const VALUES = new Set(["granted", "denied"]);

const listeners = new Set();

/** "granted" | "denied" | null when nobody has been asked yet. */
export function getConsent() {
  try {
    const v = localStorage.getItem(KEY);
    return VALUES.has(v) ? v : null;
  } catch {
    // Private mode, blocked storage, or the prerender running in Node. Treat an
    // unreadable answer as "not given" — never as agreement.
    return null;
  }
}

export const hasAnalyticsConsent = () => getConsent() === "granted";

/** Record a choice and tell everyone who is listening. Returns the value stored. */
export function setConsent(value) {
  const next = VALUES.has(value) ? value : "denied";
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Can't persist (private mode): honour it for this page at least, rather
    // than pretending the choice was never made.
  }
  for (const cb of listeners) {
    try {
      cb(next);
    } catch {
      /* a bad listener must not break the others */
    }
  }
  return next;
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function onConsentChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reopen the question — used by the "Cookie preferences" footer link. */
export function clearConsent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  for (const cb of listeners) {
    try {
      cb(null);
    } catch {
      /* ignore */
    }
  }
}

/** Test hook. */
export function _resetConsentListeners() {
  listeners.clear();
}
