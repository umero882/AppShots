import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useAuth } from "../lib/auth";

const plans = [
  {
    id: "free",
    name: "Free",
    price: { mo: 0, yr: 0 },
    tagline: "Everything to get your first set shipped.",
    features: [
      "Unlimited projects",
      "All device frames",
      "Gradient & solid backgrounds",
      "PNG export up to 2x",
      "AppShots watermark",
    ],
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    price: { mo: 9, yr: 84 },
    tagline: "For devs shipping polished store listings.",
    highlight: true,
    features: [
      "Everything in Free",
      "No watermark",
      "Full-resolution exports",
      "Localization sets",
      "Priority rendering",
      "Bulk export (.zip)",
    ],
    cta: "Upgrade to Pro",
  },
  {
    id: "team",
    name: "Team",
    price: { mo: 29, yr: 276 },
    tagline: "One workspace, five people, one bill.",
    features: [
      "Everything in Pro, for all 5 seats",
      "Shared project library",
      "Shared templates",
      "Brand kit — colours, fonts, logo",
      "Roles & permissions",
    ],
    cta: "Start with Team",
  },
];

/**
 * What one pricing card should say for this visitor.
 *
 * "Current plan" has to mean this plan AND this billing period. Ignoring the
 * period told a monthly subscriber that the yearly card was already theirs, and
 * disabled the very button that would have sold them the upgrade.
 *
 * Pure and exported so every combination can be tested without driving the
 * billing-period toggle through the DOM.
 *
 * A seat holder is a special case: their plan is real but someone else's card is
 * paying for it, so every button that would start or change a subscription has
 * to keep working — they are buying their OWN plan, not editing the workspace's.
 *
 * @param {{id:string,name:string,cta:string}} plan
 * @param {{plan?:string, planVia?:string, subscription?:{interval?:string|null}}|null} user
 * @param {boolean} yearly which period the toggle is showing
 * @returns {{isCurrent:boolean, cta:string, action:"signup"|"checkout"|"portal"|"none"}}
 */
export function planCardState(plan, user, yearly) {
  const wanted = yearly ? "year" : "month";
  // A plan that came from a seat is not a subscription this person can manage.
  const viaSeat = user?.planVia === "seat";
  const subscribed = !!user?.plan && user.plan !== "free" && !viaSeat;
  const current = user?.subscription?.interval || null;

  if (viaSeat) {
    // Their seat already gives them Team; the same card is not something to buy
    // twice, and the cheaper ones are not an upgrade.
    if (plan.id === "team") return { isCurrent: true, cta: "Your team's plan", action: "none" };
    return { isCurrent: false, cta: plan.cta, action: "checkout" };
  }

  // An unknown interval means an entitlement record written before we stored it.
  // Fall back to plan-only — the previous behaviour — rather than guess wrong.
  const samePlan = !!user?.plan && plan.id === user.plan;
  const samePeriod = !current || current === wanted;

  if (plan.id === "free") {
    const isCurrent = user?.plan === "free";
    return { isCurrent, cta: isCurrent ? "Current plan" : plan.cta, action: isCurrent ? "none" : "signup" };
  }

  if (samePlan && samePeriod) return { isCurrent: true, cta: "Current plan", action: "none" };

  if (samePlan) {
    // Same plan, other period: a real, sellable change — through the portal,
    // because a second Checkout would mean a second subscription.
    return { isCurrent: false, cta: yearly ? "Switch to yearly" : "Switch to monthly", action: "portal" };
  }

  if (subscribed) return { isCurrent: false, cta: `Switch to ${plan.name}`, action: "portal" };

  return { isCurrent: false, cta: plan.cta, action: user ? "checkout" : "signup" };
}

export default function Pricing() {
  const [yearly, setYearly] = useState(false);
  const { user, startCheckout, openBillingPortal } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  // A seat holder has no subscription of their own, so the portal has nothing to
  // show them — they buy through Checkout like anyone else.
  const subscribed = !!user?.plan && user.plan !== "free" && user.planVia !== "seat";

  async function choose(plan) {
    if (plan.id === "free") {
      navigate(user ? "/dashboard" : "/signup");
      return;
    }
    if (!user) {
      navigate("/signup");
      return;
    }
    // Already paying? Every change — plan or billing period — goes through the
    // portal, which prorates it. A second Checkout would mean a second
    // subscription and a second charge.
    if (subscribed) {
      setBusy(plan.id);
      setError(null);
      try {
        const url = await openBillingPortal();
        if (url) {
          window.location.href = url;
          return;
        }
      } catch (e) {
        setError(e.message || "Couldn't open the billing portal. Please try again.");
      }
      setBusy(null);
      return;
    }
    setBusy(plan.id);
    setError(null);
    try {
      const url = await startCheckout({
        plan: plan.id,
        interval: yearly ? "year" : "month",
        price: yearly ? plan.price.yr : plan.price.mo,
      });
      if (url) {
        window.location.href = url; // redirect to Stripe hosted Checkout
        return;
      }
      navigate("/dashboard"); // offline demo backend — no hosted Checkout
    } catch (e) {
      setError(e.message || "Couldn't start checkout. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <section className="mx-auto max-w-7xl px-5 pt-16 pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="chip mx-auto">
            <Sparkles size={14} className="text-brand-400" /> Simple, honest pricing
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Pick a plan that fits
          </h1>
          <p className="mt-4 text-slate-400">
            Start free. Upgrade when you need full-resolution, watermark-free exports.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 p-1">
            <button
              onClick={() => setYearly(false)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${!yearly ? "bg-brand-600 text-white" : "text-slate-300"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${yearly ? "bg-brand-600 text-white" : "text-slate-300"}`}
            >
              Yearly <span className="text-brand-200">−22%</span>
            </button>
          </div>
        </div>

        {error && (
          <p className="mx-auto mt-6 max-w-md rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {plans.map((p) => {
            const price = yearly ? Math.round(p.price.yr / 12) : p.price.mo;
            const card = planCardState(p, user, yearly);
            const isCurrent = card.isCurrent;
            return (
              <div
                key={p.id}
                className={`card relative flex flex-col p-7 ${p.highlight ? "ring-2 ring-brand-500/60" : ""}`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white shadow-glow">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{p.tagline}</p>
                <div className="mt-5 flex items-end gap-1">
                  <span className="text-4xl font-extrabold text-white">${price}</span>
                  <span className="mb-1 text-sm text-slate-400">/mo</span>
                </div>
                {yearly && p.price.yr > 0 && <p className="text-xs text-slate-500">billed ${p.price.yr}/year</p>}
                {p.id === "team" && <p className="text-xs text-slate-500">5 seats included · one bill</p>}
                <ul className="mt-6 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <Check size={16} className="mt-0.5 shrink-0 text-brand-400" /> {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => choose(p)}
                  disabled={busy === p.id || isCurrent}
                  className={`mt-7 ${p.highlight ? "btn-primary" : "btn-ghost"}`}
                >
                  {busy === p.id ? "Processing…" : card.cta}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-slate-500">
          Secure checkout by Stripe. Cancel anytime — manage your plan from Settings.
          <br />
          Team seats are invited by email and cost nothing extra — the workspace owner pays one bill.
        </p>
      </section>
      <Footer />
    </div>
  );
}
