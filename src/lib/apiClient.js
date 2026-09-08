/**
 * Shared plumbing for the same-origin `/api/*` proxy — BROWSER side.
 *
 * The endpoints that spend money (AI suggest/image/translate, image search, App
 * Store lookup) are metered server-side: they need the signed-in user's Firebase
 * ID token and are charged against a daily per-plan quota. See server/usage.js.
 * No keys live here; the token is the user's own.
 */
import { hasFirebase, getFirebase } from "./firebase";

/** Error from an `/api/*` call. `code` is the server's machine-readable string. */
export class ApiError extends Error {
  constructor(code, info = {}, status = 0) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.info = info;
    this.status = status;
  }
}

/** `Authorization` header for the current user, or {} when signed out. */
export async function authHeaders() {
  if (!hasFirebase) return {};
  try {
    const { auth } = getFirebase();
    const user = auth.currentUser;
    if (!user) return {};
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return {}; // let the server answer 401 rather than failing here
  }
}

/** One authenticated proxy call. Throws ApiError; resolves to parsed JSON. */
export async function apiFetch(path, { method = "GET", body, signal } = {}) {
  const headers = await authHeaders();
  if (body !== undefined) headers["content-type"] = "application/json";
  let resp;
  try {
    resp = await fetch(path, { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ApiError("network-error");
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new ApiError(data.error || `http-${resp.status}`, data, resp.status);
  return data;
}

const KIND_LABELS = {
  suggest: "AI background ideas",
  image: "AI image generations",
  translate: "translations",
  search: "image searches",
  appStore: "App Store lookups",
};

/**
 * A storage limit as a person would say it. The quotas are round numbers of GB,
 * and "you've used all 5120 MB" is a number nobody recognises as their plan.
 */
export function formatStorage(bytes) {
  const n = Number(bytes) || 0;
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  return `${Math.round(n / 1024 ** 2)} MB`;
}

function untilReset(resetAt) {
  const ms = new Date(resetAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "shortly";
  const hours = Math.round(ms / 3_600_000);
  if (hours >= 2) return `in ${hours} hours`;
  const mins = Math.max(1, Math.round(ms / 60_000));
  return `in ${mins} minute${mins === 1 ? "" : "s"}`;
}

/**
 * Turn an ApiError into something worth showing a user. `fallback` covers the
 * ordinary "the upstream broke" case each caller words differently.
 */
export function describeApiError(err, fallback = "Something went wrong — please try again.") {
  const code = err?.code || err?.message;
  const info = err?.info || {};
  switch (code) {
    case "unauthorized":
      return "Please sign in again — your session expired.";
    case "quota-exceeded": {
      const what = KIND_LABELS[info.kind] || "requests";
      const when = untilReset(info.resetAt);
      const upgrade = info.plan === "free" ? " Upgrade to Pro for a much higher limit." : "";
      return `You've used today's ${what} (${info.limit}). Your allowance resets ${when}.${upgrade}`;
    }
    case "plan-required":
      return `${info.feature || "This feature"} is part of Pro. Upgrade to unlock it.`;
    case "storage-quota-exceeded": {
      // Only the free plan has somewhere to upgrade TO on their own. A Team seat
      // holder cannot buy more room at all — the workspace owner pays — so
      // telling them to upgrade points at a door they cannot open.
      const room = info.plan === "free" ? " Delete something, or upgrade for more room." : " Delete something to free up space.";
      return `You've used all ${formatStorage(info.limit)} of storage on the ${info.plan || "free"} plan.${room}`;
    }
    case "email-verification-required":
      return "Verify your email address to use the AI features — check your inbox, or resend the link from your dashboard.";
    case "rate-limited":
      return "You're going a bit fast — wait a minute and try again.";
    case "capacity-reached":
      return "AppShots is at its daily capacity for this feature. Please try again tomorrow.";
    case "network-error":
      return "Couldn't reach AppShots — check your connection and try again.";
    default:
      return fallback;
  }
}
