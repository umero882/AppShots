/**
 * Product analytics — BROWSER side.
 *
 * Google Analytics for Firebase is already initialised (see ./firebase.js) and
 * already collects page views, so this adds the events it cannot infer: the
 * funnel. Without them you can see traffic but not where people stop, which is
 * the only question worth asking of a paid product.
 *
 * Event names follow GA4's recommended set where one exists (`sign_up`,
 * `begin_checkout`, `purchase`) so the built-in reports light up instead of
 * needing custom exploration for every question.
 *
 * Never throws and never blocks: analytics is the least important thing on any
 * page, and an ad-blocker eating it is the normal case, not an error.
 */
import { hasFirebase, getFirebase, firebaseConfig } from "./firebase";

let analyticsPromise = null;

function analytics() {
  if (analyticsPromise) return analyticsPromise;
  if (!hasFirebase || !firebaseConfig.measurementId) return (analyticsPromise = Promise.resolve(null));
  analyticsPromise = (async () => {
    try {
      const { getAnalytics, isSupported } = await import("firebase/analytics");
      if (!(await isSupported())) return null;
      const { app } = getFirebase();
      return app ? getAnalytics(app) : null;
    } catch {
      return null; // blocked, unsupported, or offline
    }
  })();
  return analyticsPromise;
}

/**
 * Record one product event.
 * @param {string} name GA4 event name (snake_case)
 * @param {object} params event parameters — never personal data
 */
export async function track(name, params = {}) {
  try {
    const instance = await analytics();
    if (!instance) return false;
    const { logEvent } = await import("firebase/analytics");
    logEvent(instance, name, params);
    return true;
  } catch {
    return false;
  }
}

/* --------------------------- the funnel, named once -------------------------- */

/** Someone finished creating an account. */
export const trackSignUp = (method = "password") => track("sign_up", { method });

/** Someone reached hosted Checkout. `value` is the price they were shown. */
export const trackBeginCheckout = ({ plan, interval, value, currency = "USD" }) =>
  track("begin_checkout", { plan, interval, value, currency, items: [{ item_id: `${plan}_${interval}`, item_name: plan }] });

/**
 * A subscription actually started. Fired when the app comes back from Checkout
 * and the SERVER confirms the plan — never on the redirect alone, which happens
 * whether or not the payment settled.
 */
export const trackPurchase = ({ plan, transactionId, value, currency = "USD" }) =>
  track("purchase", { transaction_id: transactionId, value, currency, items: [{ item_id: plan, item_name: plan }] });

/** A project was created — the first real act of using the product. */
export const trackProjectCreated = ({ source = "blank" } = {}) => track("project_created", { source });

/** Screenshots were exported — the moment the product delivered its value. */
export const trackExport = ({ format, screens, sizes = 1 }) =>
  track("export_completed", { format, screens, sizes });
