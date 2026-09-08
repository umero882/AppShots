/**
 * The one place that answers "what plan is this user on?".
 *
 * Two different things can grant a plan:
 *   1. the user's own Stripe subscription (server/subscriptionStore.js), and
 *   2. a seat in someone else's Team workspace (server/teams.js).
 *
 * Quotas, storage limits and feature gates must honour both, or a seat is a
 * receipt for nothing. Keeping the join here — rather than teaching billing
 * about teams, or teams about quotas — means there is exactly one function to
 * audit when the question is "how could someone get a paid plan?".
 *
 * Imports point at the record STORE, not at server/stripe.js, so that stripe.js
 * can use this to answer /api/stripe/subscription without an import cycle.
 */
import { readRecord, publicEntitlement } from "./subscriptionStore.js";
import { teamPlanFor } from "./teams.js";

const RANK = { free: 0, pro: 1, team: 2 };
const rank = (plan) => RANK[plan] ?? 0;

/**
 * The caller's effective entitlement, in the shape the client already consumes,
 * plus `via` so the UI can explain a plan instead of merely asserting it.
 *
 * The better of the two wins: someone who pays for Pro and also holds a Team
 * seat gets Team. A Team owner seated elsewhere keeps their own subscription,
 * which is the one with a renewal date and a cancel button.
 *
 * @param {string} uid
 * @param {{record?: object}} [opts] pre-read record (the billing endpoints have
 *        just reconciled one and should not read it off disk a second time)
 * @returns {{plan:string, interval:string|null, status:string,
 *   currentPeriodEnd:number|null, cancelAtPeriodEnd:boolean,
 *   via:"billing"|"seat"|"none", teamId?:string, teamRole?:string}}
 */
export function resolveEntitlement(uid, opts = {}, deps = {}) {
  const own = opts.record
    ? (deps.publicEntitlement || publicEntitlement)(opts.record)
    : (deps.publicEntitlement || publicEntitlement)((deps.readRecord || readRecord)(uid));

  let seat = null;
  try {
    seat = (deps.teamPlanFor || teamPlanFor)(uid);
  } catch {
    seat = null; // a broken roster read must never revoke a paid plan
  }

  if (seat && rank(seat.plan) > rank(own.plan)) {
    return {
      plan: seat.plan,
      interval: null,
      // A seat holder has no subscription of their own. Reporting "active" here
      // would put a renewal date and a cancel button in front of someone whose
      // card is not the one being charged.
      status: "seat",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      via: "seat",
      teamId: seat.teamId,
      teamRole: seat.role,
    };
  }

  return {
    plan: own.plan || "free",
    interval: own.interval || null,
    status: own.status || "none",
    currentPeriodEnd: own.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!own.cancelAtPeriodEnd,
    via: own.plan && own.plan !== "free" ? "billing" : "none",
    ...(seat ? { teamId: seat.teamId, teamRole: seat.role } : {}),
  };
}

/** Just the plan string — what quota and storage checks actually need. */
export function planFor(uid, deps = {}) {
  try {
    return resolveEntitlement(uid, {}, deps).plan || "free";
  } catch {
    return "free";
  }
}
