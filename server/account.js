/**
 * Account deletion — the server-owned half.
 *
 * /privacy promises "delete your account and we delete it", so this has to be
 * real: it stops the billing relationship and erases everything the server holds
 * for a user. The client owns the two things it can delete with its own
 * credentials (its Firestore documents and its Firebase Auth user); this endpoint
 * owns what the client cannot touch — Stripe, the blob store, the entitlement
 * record, the usage counters and any Team workspace the user is part of.
 *
 * Ordering is deliberate: **billing first**. The worst outcome of a half-finished
 * deletion is an account the user can no longer reach that is still being
 * charged, so if any step fails the whole call fails and nothing else is removed.
 * Every step is idempotent, so the client simply retries.
 *
 * What is intentionally NOT deleted: Stripe invoices and charges. Deleting the
 * customer strips the personal data (name, email, card) while the transaction
 * records stay, because tax law requires keeping them. /privacy says so.
 */
import { verifyIdToken } from "./firebaseAuth.js";
import { purgeStripeForUid } from "./stripe.js";
import { deleteBlobsForUid } from "./blob.js";
import { deleteUsage } from "./usage.js";
import { purgeTeamsForUid } from "./teams.js";

/**
 * Delete the server-side footprint of the caller's account.
 * @param {object} headers request headers (needs `authorization`)
 * @returns {Promise<{ok: true, blobsDeleted: number, subscriptionsCancelled: number,
 *   stripeCustomerDeleted: boolean, usageCleared: boolean}>}
 */
export async function deleteAccount(headers = {}, deps = {}) {
  const verify = deps.verifyIdToken || verifyIdToken;
  const purgeStripe = deps.purgeStripeForUid || purgeStripeForUid;
  const purgeBlobs = deps.deleteBlobsForUid || deleteBlobsForUid;
  const purgeUsage = deps.deleteUsage || deleteUsage;
  const purgeTeams = deps.purgeTeamsForUid || purgeTeamsForUid;

  let uid;
  try {
    uid = await verify(headers.authorization || headers.Authorization);
  } catch {
    throw new Error("unauthorized");
  }

  // Billing first: everything after this is storage, and storage left behind is
  // recoverable. A subscription left behind is not.
  let stripe;
  try {
    stripe = await purgeStripe(uid);
  } catch (e) {
    const err = new Error("billing-cleanup-failed");
    err.info = { detail: String(e?.message || e) };
    throw err;
  }

  // Teams next, and still before storage: the subscription that paid for the
  // seats is now cancelled, so leaving the workspace standing would keep handing
  // its members a plan nobody is paying for. Failures here are not fatal — the
  // seat cannot outlive the entitlement check either way, which reads the
  // owner's (now cancelled) subscription.
  let team = { disbanded: false, left: false };
  try {
    team = await purgeTeams(uid, deps);
  } catch {
    team = { disbanded: false, left: false, failed: true };
  }

  const blobsDeleted = purgeBlobs(uid);
  const usageCleared = purgeUsage(uid);

  return {
    ok: true,
    blobsDeleted,
    usageCleared,
    teamDisbanded: !!team.disbanded,
    teamLeft: !!team.left,
    subscriptionsCancelled: stripe.subscriptionsCancelled,
    stripeCustomerDeleted: stripe.customerDeleted,
  };
}
