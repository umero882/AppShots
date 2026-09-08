/**
 * The entitlement record — one small JSON file per user, on the persistent
 * volume, describing what Stripe last told us they are paying for.
 *
 * Split out of server/stripe.js so the parts of the backend that only need to
 * ASK ("what is this user entitled to?") do not have to import the part that
 * TALKS to Stripe. That is what lets server/teams.js read a Team owner's plan
 * without an import cycle between teams, billing and entitlement.
 *
 * Stripe stays the source of truth; this is its local projection, written by the
 * webhook and by reconcile(). SUB_DIR must live on the mounted volume or every
 * paid plan disappears on redeploy.
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import path from "path";

export const SUB_DIR = process.env.SUB_DIR || path.join(process.cwd(), "data", "subscriptions");
export const CUST_DIR = path.join(SUB_DIR, "customers");

/** Statuses that still entitle the user to their paid plan (past_due keeps access
 *  during Stripe's Smart Retries grace window; the UI can nudge to fix payment). */
export const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

export const FREE = Object.freeze({ plan: "free", status: "none" });

export const secretKey = () => process.env.STRIPE_SECRET_KEY || "";
/** Which Stripe mode the configured key talks to. Customer/subscription ids are
 *  mode-specific, so records remember the mode they were written in. */
export const keyMode = () => (secretKey().startsWith("sk_live_") ? "live" : "test");

export const validUid = (uid) => (/^[A-Za-z0-9_-]{1,128}$/.test(uid || "") ? uid : null);
export const validCid = (cid) => (/^cus_[A-Za-z0-9]+$/.test(cid || "") ? cid : null);

/**
 * Project a stored record into the Stripe mode we're running in. A record written
 * in the OTHER mode (e.g. a sandbox purchase from before the key was switched to
 * live) is meaningless here: its customer/subscription ids don't exist in this
 * mode, so it must neither grant a plan nor be reused for Checkout/portal calls.
 * Legacy records without a `mode` were all written in test mode.
 */
export function recordInMode(rec, mode) {
  if (!rec) return null;
  const recMode = rec.mode || "test";
  if (recMode === mode) return rec;
  return { ...FREE, mode, updatedAt: Date.now(), migratedFrom: recMode };
}

export function ensureDirs() {
  if (!existsSync(SUB_DIR)) mkdirSync(SUB_DIR, { recursive: true });
  if (!existsSync(CUST_DIR)) mkdirSync(CUST_DIR, { recursive: true });
}

export const recPath = (uid) => path.join(SUB_DIR, `${uid}.json`);
export const custPath = (cid) => path.join(CUST_DIR, `${cid}.json`);

export function readRecord(uid) {
  if (!validUid(uid)) return null;
  try {
    return recordInMode(JSON.parse(readFileSync(recPath(uid), "utf8")), keyMode());
  } catch {
    return null;
  }
}

export function writeRecord(uid, rec) {
  if (!validUid(uid)) return;
  ensureDirs();
  writeFileSync(recPath(uid), JSON.stringify({ ...rec, mode: keyMode() }));
}

export function linkCustomer(cid, uid) {
  if (!validCid(cid) || !validUid(uid)) return;
  ensureDirs();
  writeFileSync(custPath(cid), JSON.stringify({ uid }));
}

export function uidForCustomer(cid) {
  if (!validCid(cid)) return null;
  try {
    return JSON.parse(readFileSync(custPath(cid), "utf8")).uid || null;
  } catch {
    return null;
  }
}

/** Public entitlement shape the client consumes (no internal churn leaks out). */
export function publicEntitlement(rec) {
  if (!rec || !rec.plan) return { ...FREE };
  return {
    plan: rec.plan,
    interval: rec.interval || null,
    status: rec.status || "none",
    currentPeriodEnd: rec.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!rec.cancelAtPeriodEnd,
  };
}
