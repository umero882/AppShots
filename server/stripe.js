/**
 * Stripe subscription billing for AppShots — implemented with ONLY Node built-ins
 * (fetch + crypto), matching this repo's zero-runtime-dependency backend. No
 * `stripe` npm SDK: we call the Stripe REST API directly and verify webhook
 * signatures with an HMAC, so the Docker image stays tiny.
 *
 *   POST /api/stripe/create-checkout-session  (auth) -> { url }   hosted Checkout
 *   POST /api/stripe/create-portal-session    (auth) -> { url }   billing portal
 *   GET  /api/stripe/subscription             (auth) -> entitlement  (?sync=1 to
 *                                                        reconcile live from Stripe)
 *   POST /api/stripe/webhook   (Stripe-signed) -> { received: true }
 *
 * Entitlement is SERVER-OWNED: Stripe is the source of truth, the webhook (and the
 * post-checkout `?sync=1` reconcile) write a small JSON record per user under
 * SUB_DIR, and the client reads its plan from GET /api/stripe/subscription. The
 * client can no longer grant itself a paid plan. SUB_DIR lives on the same
 * persistent volume as the blob store (default /app/data/subscriptions) — mount it
 * in Coolify or entitlements vanish on redeploy.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import path from "path";
import { verifyIdTokenClaims } from "./firebaseAuth.js";

const STRIPE_API = "https://api.stripe.com/v1";
const SUB_DIR = process.env.SUB_DIR || path.join(process.cwd(), "data", "subscriptions");
const CUST_DIR = path.join(SUB_DIR, "customers");

// Statuses that still entitle the user to their paid plan (past_due keeps access
// during Stripe's Smart Retries grace window; the UI can nudge to fix payment).
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

const secretKey = () => process.env.STRIPE_SECRET_KEY || "";
const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET || "";
// Stripe Tax is opt-out (auto-on) but falls back gracefully if the account hasn't
// finished Tax setup — see createCheckoutSession.
const taxEnabled = () => process.env.STRIPE_AUTOMATIC_TAX !== "false";

/* --------------------------------- plan catalog --------------------------------- */
// Stable price lookup_keys created by scripts/stripe/setup.mjs. Referencing prices
// by lookup_key (not hard-coded price ids) keeps this env-agnostic: the same code
// works in test and live once setup.mjs has run in each.
export const PLAN_LOOKUP_KEYS = {
  pro: { month: "pro_monthly", year: "pro_yearly" },
  team: { month: "team_monthly", year: "team_yearly" },
};
const FREE = Object.freeze({ plan: "free", status: "none" });

/* ------------------------------- form-url encoding ------------------------------ */
// Stripe expects application/x-www-form-urlencoded with PHP-style bracket nesting,
// e.g. line_items[0][price]=price_x, metadata[firebase_uid]=abc.
export function encodeForm(obj, prefix = "", out = []) {
  if (obj === undefined || obj === null) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => encodeForm(v, prefix ? `${prefix}[${i}]` : String(i), out));
  } else if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      encodeForm(v, prefix ? `${prefix}[${k}]` : k, out);
    }
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(obj))}`);
  }
  return out;
}

/** One Stripe REST call. Throws Error(message) with a `.stripeCode` on failure. */
export async function stripeRequest(method, endpoint, params, { idempotencyKey } = {}) {
  const key = secretKey();
  if (!key) throw new Error("stripe-not-configured");
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const body = params ? encodeForm(params).join("&") : undefined;
  const res = await fetch(STRIPE_API + endpoint, { method, headers, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `stripe-request-failed-${res.status}`);
    err.stripeCode = json?.error?.code;
    err.stripeType = json?.error?.type;
    err.status = res.status;
    throw err;
  }
  return json;
}

/* ----------------------------- webhook signatures ------------------------------- */
/**
 * Verify a Stripe webhook signature (crypto-only, no SDK). Header format is
 * `t=<unix>,v1=<hexHmac>[,v0=...]`; the signed payload is `${t}.${rawBody}` and the
 * HMAC-SHA256 key is the endpoint secret (whsec_...). Returns the parsed event, or
 * throws. `toleranceSec` guards against replay of old-but-valid signatures.
 */
export function constructWebhookEvent(rawBody, sigHeader, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!secret) throw new Error("webhook-secret-not-configured");
  if (!sigHeader) throw new Error("missing-signature");
  const parts = Object.fromEntries(
    String(sigHeader)
      .split(",")
      .map((kv) => kv.split("=").map((s) => s.trim()))
      .filter((p) => p.length === 2)
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) throw new Error("malformed-signature");
  if (Math.abs(nowSec - t) > toleranceSec) throw new Error("signature-timestamp-outside-tolerance");

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("signature-mismatch");

  return JSON.parse(payload);
}

/* --------------------------------- disk store ----------------------------------- */
// uids come from a verified Firebase token; validate anyway so nothing can escape
// the store directory.
const validUid = (uid) => (/^[A-Za-z0-9_-]{1,128}$/.test(uid || "") ? uid : null);
const validCid = (cid) => (/^cus_[A-Za-z0-9]+$/.test(cid || "") ? cid : null);

function ensureDirs() {
  if (!existsSync(SUB_DIR)) mkdirSync(SUB_DIR, { recursive: true });
  if (!existsSync(CUST_DIR)) mkdirSync(CUST_DIR, { recursive: true });
}
const recPath = (uid) => path.join(SUB_DIR, `${uid}.json`);
const custPath = (cid) => path.join(CUST_DIR, `${cid}.json`);

export function readRecord(uid) {
  if (!validUid(uid)) return null;
  try {
    return JSON.parse(readFileSync(recPath(uid), "utf8"));
  } catch {
    return null;
  }
}
function writeRecord(uid, rec) {
  if (!validUid(uid)) return;
  ensureDirs();
  writeFileSync(recPath(uid), JSON.stringify(rec));
}
function linkCustomer(cid, uid) {
  if (!validCid(cid) || !validUid(uid)) return;
  ensureDirs();
  writeFileSync(custPath(cid), JSON.stringify({ uid }));
}
function uidForCustomer(cid) {
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
    status: rec.status || "none",
    currentPeriodEnd: rec.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!rec.cancelAtPeriodEnd,
  };
}

/* ----------------------------- catalog / price lookup --------------------------- */
let priceCache = null; // lookup_key -> price id, resolved once per process
async function priceIdForLookup(lookupKey) {
  if (priceCache && priceCache[lookupKey]) return priceCache[lookupKey];
  const keys = Object.values(PLAN_LOOKUP_KEYS).flatMap((p) => Object.values(p));
  const params = { active: "true", limit: 100 };
  keys.forEach((k, i) => (params[`lookup_keys[${i}]`] = k));
  const res = await stripeRequest("GET", "/prices?" + encodeForm(params).join("&"), null);
  priceCache = {};
  for (const price of res.data || []) if (price.lookup_key) priceCache[price.lookup_key] = price.id;
  if (!priceCache[lookupKey]) throw new Error("price-not-found-run-setup-script");
  return priceCache[lookupKey];
}

/** Map a Stripe subscription object → our entitlement record. */
export function entitlementFromSubscription(sub) {
  if (!sub) return { ...FREE };
  const item = sub.items?.data?.[0];
  const price = item?.price || {};
  const plan =
    price.metadata?.plan ||
    (price.lookup_key ? String(price.lookup_key).split("_")[0] : null) ||
    "pro";
  const entitled = ENTITLED_STATUSES.has(sub.status);
  return {
    plan: entitled ? plan : "free",
    status: sub.status,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    stripeSubscriptionId: sub.id,
    priceId: price.id || null,
    currentPeriodEnd: sub.current_period_end || null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    updatedAt: Date.now(),
  };
}

// Rank subscriptions so the "most entitling / most recent" one wins when a customer
// has several (e.g. an old canceled sub alongside a new active one).
function pickSubscription(subs) {
  const rank = (s) => (s.status === "active" || s.status === "trialing" ? 2 : s.status === "past_due" ? 1 : 0);
  return [...(subs || [])].sort((a, b) => rank(b) - rank(a) || (b.created || 0) - (a.created || 0))[0] || null;
}

/** Live-reconcile a user's entitlement from Stripe and persist it. */
export async function reconcile(uid) {
  const rec = readRecord(uid);
  const customerId = rec?.stripeCustomerId;
  if (!customerId) {
    const free = { ...FREE, updatedAt: Date.now() };
    writeRecord(uid, free);
    return publicEntitlement(free);
  }
  const q = encodeForm({
    customer: customerId,
    status: "all",
    limit: 10,
    "expand[0]": "data.items.data.price",
  }).join("&");
  const res = await stripeRequest("GET", "/subscriptions?" + q, null);
  const sub = pickSubscription(res.data);
  const next = sub
    ? { ...entitlementFromSubscription(sub), stripeCustomerId: customerId }
    : { ...FREE, stripeCustomerId: customerId, updatedAt: Date.now() };
  writeRecord(uid, next);
  return publicEntitlement(next);
}

/* ------------------------------- customers -------------------------------------- */
async function getOrCreateCustomer(uid, email) {
  const rec = readRecord(uid);
  if (rec?.stripeCustomerId) return rec.stripeCustomerId;

  // Cross-check Stripe in case the on-disk record was lost, to avoid duplicates.
  try {
    const found = await stripeRequest(
      "GET",
      "/customers/search?" + encodeForm({ query: `metadata['firebase_uid']:'${uid}'`, limit: 1 }).join("&"),
      null
    );
    if (found.data?.[0]?.id) {
      const cid = found.data[0].id;
      writeRecord(uid, { ...(rec || {}), stripeCustomerId: cid, updatedAt: Date.now() });
      linkCustomer(cid, uid);
      return cid;
    }
  } catch {
    /* search may be unavailable/eventually-consistent — fall through to create */
  }

  const created = await stripeRequest(
    "POST",
    "/customers",
    { email: email || undefined, metadata: { firebase_uid: uid } },
    { idempotencyKey: `cust_${uid}` }
  );
  writeRecord(uid, { ...(rec || {}), stripeCustomerId: created.id, updatedAt: Date.now() });
  linkCustomer(created.id, uid);
  return created.id;
}

/* ------------------------------- request helpers -------------------------------- */
function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
function readRaw(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("too-large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
// Absolute app URL for Checkout success/cancel + portal return links. Prefer an
// explicit APP_URL, else the request Origin (browser sends it on same-origin POST),
// else the forwarded host.
function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const origin = req.headers["origin"];
  if (origin) return origin.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

/* --------------------------------- endpoints ------------------------------------ */
async function createCheckoutSession(req, res, uid, email) {
  const raw = await readRaw(req).catch(() => Buffer.from(""));
  let body = {};
  try {
    body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch {
    return sendJson(res, 400, { error: "invalid-json" });
  }
  const plan = String(body.plan || "").toLowerCase();
  const interval = body.interval === "year" ? "year" : "month";
  const lookupKey = PLAN_LOOKUP_KEYS[plan]?.[interval];
  if (!lookupKey) return sendJson(res, 400, { error: "unknown-plan" });

  let priceId;
  try {
    priceId = await priceIdForLookup(lookupKey);
  } catch (e) {
    return sendJson(res, 500, { error: "price-unavailable", detail: e.message });
  }

  const customer = await getOrCreateCustomer(uid, email);
  const base = appUrl(req);
  const params = {
    mode: "subscription",
    customer,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    success_url: `${base}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pricing?checkout=cancel`,
    client_reference_id: uid,
    "subscription_data[metadata][firebase_uid]": uid,
    "metadata[firebase_uid]": uid,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  };
  if (taxEnabled()) {
    params["automatic_tax[enabled]"] = true;
    // Saving the address/name Stripe collects onto the existing customer is required
    // for automatic_tax + tax_id_collection to run.
    params["customer_update[address]"] = "auto";
    params["customer_update[name]"] = "auto";
    params["tax_id_collection[enabled]"] = true; // B2B VAT/ABN capture (esp. Team)
  }

  try {
    const session = await stripeRequest("POST", "/checkout/sessions", params);
    return sendJson(res, 200, { url: session.url });
  } catch (e) {
    // Auto-on Tax degrades gracefully: if the account hasn't finished Stripe Tax
    // setup, retry once without automatic_tax so checkout still works.
    const taxIssue = /tax/i.test(e.message || "") || e.stripeCode === "customer_tax_location_invalid";
    if (taxEnabled() && taxIssue) {
      for (const k of [
        "automatic_tax[enabled]",
        "customer_update[address]",
        "customer_update[name]",
        "tax_id_collection[enabled]",
      ])
        delete params[k];
      try {
        const session = await stripeRequest("POST", "/checkout/sessions", params);
        return sendJson(res, 200, { url: session.url, taxDisabled: true });
      } catch (e2) {
        return sendJson(res, 500, { error: "checkout-failed", detail: e2.message });
      }
    }
    return sendJson(res, 500, { error: "checkout-failed", detail: e.message });
  }
}

async function createPortalSession(req, res, uid) {
  const rec = readRecord(uid);
  const customer = rec?.stripeCustomerId;
  if (!customer) return sendJson(res, 400, { error: "no-customer" });
  try {
    const session = await stripeRequest("POST", "/billing_portal/sessions", {
      customer,
      return_url: `${appUrl(req)}/settings`,
    });
    return sendJson(res, 200, { url: session.url });
  } catch (e) {
    // Most common cause: the Customer Portal isn't activated in the Dashboard yet.
    return sendJson(res, 500, { error: "portal-failed", detail: e.message });
  }
}

async function getSubscription(req, res, uid, query) {
  if (query.sync === "1" || query.session_id) {
    // If we came back from Checkout with a session_id, make sure we've linked the
    // customer (webhook may not have landed yet), then live-reconcile from Stripe.
    try {
      if (query.session_id) {
        const s = await stripeRequest(
          "GET",
          `/checkout/sessions/${encodeURIComponent(query.session_id)}`,
          null
        );
        const cid = typeof s.customer === "string" ? s.customer : s.customer?.id;
        if (cid && s.client_reference_id === uid) {
          const rec = readRecord(uid) || {};
          writeRecord(uid, { ...rec, stripeCustomerId: cid, updatedAt: Date.now() });
          linkCustomer(cid, uid);
        }
      }
      return sendJson(res, 200, await reconcile(uid));
    } catch (e) {
      return sendJson(res, 200, { ...publicEntitlement(readRecord(uid)), syncError: e.message });
    }
  }
  return sendJson(res, 200, publicEntitlement(readRecord(uid)));
}

/** Resolve the AppShots uid a Stripe event object belongs to. */
function resolveUid(obj) {
  const meta = obj?.metadata?.firebase_uid || obj?.subscription_details?.metadata?.firebase_uid;
  if (validUid(meta)) return meta;
  if (obj?.client_reference_id && validUid(obj.client_reference_id)) return obj.client_reference_id;
  const cid = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;
  return uidForCustomer(cid);
}

async function handleWebhook(req, res) {
  let event;
  try {
    const raw = await readRaw(req, 1024 * 1024);
    event = constructWebhookEvent(raw, req.headers["stripe-signature"], webhookSecret());
  } catch (e) {
    return sendJson(res, 400, { error: "invalid-signature", detail: e.message });
  }

  try {
    const obj = event.data?.object || {};
    const type = event.type;

    if (type === "checkout.session.completed") {
      const uid = obj.client_reference_id && validUid(obj.client_reference_id) ? obj.client_reference_id : resolveUid(obj);
      const cid = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (uid && cid) {
        const rec = readRecord(uid) || {};
        writeRecord(uid, { ...rec, stripeCustomerId: cid, updatedAt: Date.now() });
        linkCustomer(cid, uid);
        await reconcile(uid);
      }
    } else if (type.startsWith("customer.subscription.")) {
      const uid = resolveUid(obj);
      const cid = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (uid) {
        if (cid) linkCustomer(cid, uid);
        // The event object IS the subscription — persist directly (no extra fetch).
        writeRecord(uid, { ...entitlementFromSubscription(obj), stripeCustomerId: cid });
      }
    } else if (type === "invoice.paid" || type === "invoice.payment_failed") {
      const uid = resolveUid(obj);
      if (uid) await reconcile(uid);
    }
    // Unhandled types are acknowledged so Stripe stops retrying.
    return sendJson(res, 200, { received: true });
  } catch (e) {
    // Return 500 so Stripe retries a transient failure (e.g. Stripe API blip).
    return sendJson(res, 500, { error: "webhook-handler-error", detail: String(e?.message || e) });
  }
}

/* --------------------------------- router --------------------------------------- */
/** Handle any /api/stripe/* request. `pathname` is the URL path (no query). */
export async function handleStripe(req, res, pathname, query = {}) {
  try {
    if (!secretKey() && pathname !== "/api/stripe/webhook") {
      return sendJson(res, 503, { error: "stripe-not-configured" });
    }
    const sub = pathname.replace(/^\/api\/stripe\/?/, "");

    // Webhook first: Stripe-signed, no Firebase auth.
    if (sub === "webhook" && req.method === "POST") return handleWebhook(req, res);

    // Everything else requires a valid Firebase ID token.
    let claims;
    try {
      claims = await verifyIdTokenClaims(req.headers["authorization"]);
    } catch {
      return sendJson(res, 401, { error: "unauthorized" });
    }
    const uid = claims.sub;
    const email = claims.email;

    if (sub === "create-checkout-session" && req.method === "POST")
      return createCheckoutSession(req, res, uid, email);
    if (sub === "create-portal-session" && req.method === "POST")
      return createPortalSession(req, res, uid);
    if (sub === "subscription" && req.method === "GET")
      return getSubscription(req, res, uid, query);

    return sendJson(res, 404, { error: "not-found" });
  } catch (e) {
    return sendJson(res, 500, { error: "stripe-error", detail: String(e?.message || e) });
  }
}
