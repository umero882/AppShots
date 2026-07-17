/**
 * Idempotent Stripe catalog setup for AppShots. Creates the Products + recurring
 * Prices (with stable lookup_keys) that the app references. Safe to re-run: it
 * reuses anything that already exists (matched by product metadata + price
 * lookup_key), so running it in test and again in live gives you the same keys.
 *
 *   node --env-file=.env.local scripts/stripe/setup.mjs
 *   (or: npm run stripe:setup   — after putting STRIPE_SECRET_KEY in .env.local)
 *
 * Uses only Node built-ins via the same zero-dep helpers as the server.
 */
import { stripeRequest, encodeForm, PLAN_LOOKUP_KEYS } from "../../server/stripe.js";

if (!process.env.STRIPE_SECRET_KEY) {
  console.error(
    "STRIPE_SECRET_KEY is not set. Run with:\n" +
      "  node --env-file=.env.local scripts/stripe/setup.mjs\n"
  );
  process.exit(1);
}
const LIVE = process.env.STRIPE_SECRET_KEY.startsWith("sk_live_");

// The catalog. Amounts are in the smallest currency unit (USD cents).
const CATALOG = [
  {
    planKey: "pro",
    name: "AppShots Pro",
    description: "Full-resolution, watermark-free exports for devs shipping polished store listings.",
    metadata: { appshots_plan: "pro" },
    prices: [
      { lookup_key: PLAN_LOOKUP_KEYS.pro.month, amount: 900, interval: "month" },
      { lookup_key: PLAN_LOOKUP_KEYS.pro.year, amount: 8400, interval: "year" },
    ],
  },
  {
    planKey: "team",
    name: "AppShots Team",
    description: "Shared workspaces, brand kit, and 5 seats for product teams.",
    metadata: { appshots_plan: "team", seats: "5" },
    prices: [
      { lookup_key: PLAN_LOOKUP_KEYS.team.month, amount: 2900, interval: "month" },
      { lookup_key: PLAN_LOOKUP_KEYS.team.year, amount: 27600, interval: "year" },
    ],
  },
];

// Prices are found by lookup_key (immediately consistent), so resolve the product
// from an existing price FIRST — this avoids duplicate products from the eventual
// consistency of /products/search on an immediate re-run.
async function findPriceByLookup(lookup_key) {
  const found = await stripeRequest(
    "GET",
    "/prices?" + encodeForm({ lookup_keys: [lookup_key], limit: 1, "expand[0]": "data.product" }).join("&"),
    null
  ).catch(() => ({ data: [] }));
  return found.data?.[0] || null;
}

async function ensureProduct(entry, knownProductId) {
  if (knownProductId) return { id: knownProductId, created: false };
  const found = await stripeRequest(
    "GET",
    "/products/search?" +
      encodeForm({ query: `metadata['appshots_plan']:'${entry.planKey}'`, limit: 1 }).join("&"),
    null
  ).catch(() => ({ data: [] }));
  if (found.data?.[0]?.id) return { id: found.data[0].id, created: false };

  const product = await stripeRequest("POST", "/products", {
    name: entry.name,
    description: entry.description,
    metadata: entry.metadata,
  });
  return { id: product.id, created: true };
}

async function ensurePrice(productId, existingPrice, price, planKey) {
  if (existingPrice) return { id: existingPrice.id, created: false };

  const created = await stripeRequest("POST", "/prices", {
    product: productId,
    currency: "usd",
    unit_amount: price.amount,
    recurring: { interval: price.interval },
    lookup_key: price.lookup_key,
    transfer_lookup_key: true, // move the key onto this price if it lived elsewhere
    metadata: { plan: planKey },
  });
  return { id: created.id, created: true };
}

async function main() {
  console.log(`\nAppShots Stripe catalog setup — ${LIVE ? "LIVE" : "TEST"} mode\n`);
  const summary = [];
  for (const entry of CATALOG) {
    // Look up existing prices first; reuse their product if present.
    const existing = {};
    for (const price of entry.prices) existing[price.lookup_key] = await findPriceByLookup(price.lookup_key);
    const anyExisting = Object.values(existing).find(Boolean);
    const knownProductId = anyExisting
      ? typeof anyExisting.product === "string"
        ? anyExisting.product
        : anyExisting.product?.id
      : null;

    const product = await ensureProduct(entry, knownProductId);
    console.log(`${product.created ? "created" : "exists "}  product  ${entry.name}  (${product.id})`);
    for (const price of entry.prices) {
      const p = await ensurePrice(product.id, existing[price.lookup_key], price, entry.planKey);
      console.log(
        `${p.created ? "created" : "exists "}  price    ${price.lookup_key.padEnd(14)} ` +
          `$${(price.amount / 100).toFixed(2)}/${price.interval}  (${p.id})`
      );
      summary.push({ lookup_key: price.lookup_key, id: p.id });
    }
  }
  console.log("\nDone. The app references prices by lookup_key, so no ids need copying.\n");
  console.log("Next: enable Stripe Tax, activate the Customer Portal, and add a webhook");
  console.log("endpoint (/api/stripe/webhook) in the Dashboard. See STRIPE-SETUP.md.\n");
}

main().catch((e) => {
  console.error("\nSetup failed:", e.message, "\n");
  process.exit(1);
});
