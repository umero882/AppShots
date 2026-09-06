/**
 * Per-user quotas for the endpoints that spend money.
 *
 * /api/ai/* calls Anthropic, OpenAI and Stability with OUR keys; /api/search and
 * /api/app-store are outbound proxies on our IP. Without a caller identity and a
 * ceiling, anyone who finds the URLs can run up the bill or get our upstream keys
 * rate-limited. Auth is enforced in server/router.js; this module decides how much
 * an authenticated caller may spend.
 *
 * Counters live on the same persistent volume as blobs and entitlements
 * (default <cwd>/data/usage → /app/data/usage in the container, so they survive
 * redeploys and land in the nightly backup). They are keyed by UTC day; there is
 * no cron to reset them — a new day simply starts a new bucket.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync } from "fs";
import path from "path";

const USAGE_DIR = process.env.USAGE_DIR || path.join(process.cwd(), "data", "usage");

/**
 * Daily allowance per plan. Free is deliberately tight: an AI image is the most
 * expensive call we make and free accounts cost nothing to create. Paid tiers are
 * generous enough that a real user will not notice the ceiling.
 */
export const QUOTAS = {
  free: { suggest: 20, image: 5, translate: 0, search: 100, appStore: 100 },
  pro: { suggest: 200, image: 60, translate: 400, search: 600, appStore: 600 },
  team: { suggest: 600, image: 200, translate: 1200, search: 2000, appStore: 2000 },
};

/**
 * Whole-instance daily ceiling — the backstop a per-user quota cannot give us. A
 * wave of throwaway signups would each get their own free allowance; this caps
 * what the whole system can spend in a day. Tune with env vars, 0 disables.
 */
export const GLOBAL_DAILY = {
  image: num(process.env.USAGE_GLOBAL_IMAGE_CAP, 300),
  suggest: num(process.env.USAGE_GLOBAL_SUGGEST_CAP, 3000),
  translate: num(process.env.USAGE_GLOBAL_TRANSLATE_CAP, 5000),
  search: num(process.env.USAGE_GLOBAL_SEARCH_CAP, 0),
  appStore: num(process.env.USAGE_GLOBAL_APPSTORE_CAP, 0),
};

/** Burst ceiling per user across all metered kinds, sliding window. */
const BURST_WINDOW_MS = 60_000;
const BURST_MAX = num(process.env.USAGE_BURST_PER_MIN, 20);

export const KINDS = ["suggest", "image", "translate", "search", "appStore"];

/**
 * Features sold as paid on the pricing page. Gating them in the UI is not
 * enforcement — the API is where the feature is actually spent, so the check
 * lives here. Free callers get `plan-required` (403), which is a different
 * answer from "you ran out": it never resets, and upgrading fixes it.
 */
export const PAID_ONLY = {
  translate: { feature: "Localization sets", requiredPlan: "pro" },
};

/**
 * Kinds a FREE account must verify its email address to use.
 *
 * Per-user quotas assume the user is a person. Nothing stopped one person from
 * signing up with twenty made-up addresses and collecting twenty free
 * allowances, and these three are the ones that spend money per call.
 *
 * Scoped to the free plan on purpose: the gate exists to stop throwaway
 * accounts farming free AI, and someone who has paid is not that. Blocking a
 * paying customer over an unclicked email link would be a worse bug than the
 * one this prevents.
 */
export const VERIFY_REQUIRED = new Set(["suggest", "image", "translate"]);

function num(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

// A uid comes from a verified Firebase token, but it becomes a filename here.
const validUid = (uid) => typeof uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(uid);

/** UTC day stamp — quotas reset at 00:00 UTC, the same boundary the app shows. */
export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Start of the next UTC day, as an ISO string, for "try again at" messages. */
export function resetAt(now = Date.now()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

export function limitFor(plan, kind) {
  const table = QUOTAS[plan] || QUOTAS.free;
  return table[kind] ?? 0;
}

/* --------------------------------- storage ---------------------------------- */

function filePath(key) {
  return path.join(USAGE_DIR, `${key}.json`);
}

function readBucket(key, day) {
  try {
    const rec = JSON.parse(readFileSync(filePath(key), "utf8"));
    // A bucket from an earlier day is not cleared, just ignored — the next write
    // overwrites it. That keeps reads cheap and needs no scheduled cleanup.
    if (rec && rec.day === day && rec.counts && typeof rec.counts === "object") return rec.counts;
  } catch {
    /* missing or corrupt → start fresh */
  }
  return {};
}

function writeBucket(key, day, counts) {
  if (!existsSync(USAGE_DIR)) mkdirSync(USAGE_DIR, { recursive: true });
  // Written on every metered request, so avoid leaving a truncated file behind
  // if the process dies mid-write.
  const tmp = filePath(`.${key}.tmp`);
  writeFileSync(tmp, JSON.stringify({ day, counts }));
  renameSync(tmp, filePath(key));
}

/* ------------------------------- burst window -------------------------------- */

const hits = new Map(); // uid -> timestamps within the window

function burstExceeded(uid, now) {
  const recent = (hits.get(uid) || []).filter((t) => now - t < BURST_WINDOW_MS);
  if (recent.length >= BURST_MAX) {
    hits.set(uid, recent);
    return true;
  }
  recent.push(now);
  hits.set(uid, recent);
  // Bound the map: drop callers with nothing left in their window.
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < BURST_WINDOW_MS)) hits.delete(k);
  return false;
}

/* --------------------------------- the check --------------------------------- */

/**
 * Charge one unit of `kind` to `uid`. Throws before spending anything:
 *   rate-limited   — too many requests in the last minute
 *   quota-exceeded — this user's daily allowance for `kind` is used up
 *   capacity-reached — the whole instance hit its daily ceiling for `kind`
 * Thrown errors carry `.info` (limit/remaining/resetAt/plan) which the router
 * merges into the JSON body so the UI can explain the block.
 */
export function consume({ uid, plan = "free", kind, emailVerified, now = Date.now() }) {
  if (!KINDS.includes(kind)) throw new Error("unknown-usage-kind");
  if (!validUid(uid)) throw fail("unauthorized", {});

  const paid = PAID_ONLY[kind];
  if (paid && plan === "free") throw fail("plan-required", { kind, plan, ...paid });

  // Only an explicit false blocks: the claim is always present on a real Firebase
  // token, and locking someone out over a missing field would be the worse bug.
  if (emailVerified === false && plan === "free" && VERIFY_REQUIRED.has(kind)) {
    throw fail("email-verification-required", { kind });
  }

  const limit = limitFor(plan, kind);
  const day = utcDay(now);

  if (limit <= 0) throw fail("quota-exceeded", { kind, plan, limit: 0, remaining: 0, resetAt: resetAt(now) });
  if (burstExceeded(uid, now)) throw fail("rate-limited", { kind, retryAfterSec: Math.ceil(BURST_WINDOW_MS / 1000) });

  const counts = readBucket(uid, day);
  const used = counts[kind] || 0;
  if (used >= limit) {
    throw fail("quota-exceeded", { kind, plan, limit, remaining: 0, resetAt: resetAt(now) });
  }

  const cap = GLOBAL_DAILY[kind] || 0;
  if (cap > 0) {
    const global = readBucket("_global", day);
    if ((global[kind] || 0) >= cap) throw fail("capacity-reached", { kind, resetAt: resetAt(now) });
    writeBucket("_global", day, { ...global, [kind]: (global[kind] || 0) + 1 });
  }

  writeBucket(uid, day, { ...counts, [kind]: used + 1 });
  return { kind, plan, limit, used: used + 1, remaining: limit - used - 1, resetAt: resetAt(now) };
}

function fail(code, info) {
  const e = new Error(code);
  e.info = info;
  return e;
}

/**
 * Give a charged unit back — used when the upstream call fails after we metered
 * it. Never goes below zero, so a double refund cannot mint allowance.
 */
export function refund({ uid, kind, now = Date.now() }) {
  if (!validUid(uid) || !KINDS.includes(kind)) return;
  const day = utcDay(now);
  const counts = readBucket(uid, day);
  if (counts[kind] > 0) writeBucket(uid, day, { ...counts, [kind]: counts[kind] - 1 });
  if ((GLOBAL_DAILY[kind] || 0) > 0) {
    const global = readBucket("_global", day);
    if (global[kind] > 0) writeBucket("_global", day, { ...global, [kind]: global[kind] - 1 });
  }
}

/** What's left today, for every metered kind. */
export function usageSummary(uid, plan = "free", now = Date.now()) {
  const counts = validUid(uid) ? readBucket(uid, utcDay(now)) : {};
  const kinds = {};
  for (const kind of KINDS) {
    const limit = limitFor(plan, kind);
    const used = counts[kind] || 0;
    kinds[kind] = { limit, used, remaining: Math.max(0, limit - used) };
  }
  return { plan, resetAt: resetAt(now), kinds };
}

/** Forget a user's counters entirely — part of account deletion. */
export function deleteUsage(uid) {
  if (!validUid(uid)) return false;
  hits.delete(uid);
  try {
    unlinkSync(filePath(uid));
    return true;
  } catch {
    return false; // nothing recorded today
  }
}

/** Test hook: forget in-memory burst state and delete the on-disk buckets. */
export function _resetUsage() {
  hits.clear();
  try {
    for (const f of readdirSync(USAGE_DIR)) unlinkSync(path.join(USAGE_DIR, f));
  } catch {
    /* nothing written yet */
  }
}
