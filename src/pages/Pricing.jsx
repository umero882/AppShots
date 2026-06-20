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
    tagline: "Shared workspaces for product teams.",
    features: [
      "Everything in Pro",
      "5 team seats",
      "Shared templates",
      "Brand kit",
      "Roles & permissions",
    ],
    cta: "Start Team trial",
  },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);
  const { user, upgrade } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);

  async function choose(plan) {
    if (plan.id === "free") {
      navigate(user ? "/dashboard" : "/signup");
      return;
    }
    if (!user) {
      navigate("/signup");
      return;
    }
    // Demo upgrade. In production this would redirect to Stripe Checkout.
    setBusy(plan.id);
    try {
      await upgrade(plan.id);
      navigate("/dashboard");
    } finally {
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

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {plans.map((p) => {
            const price = yearly ? Math.round(p.price.yr / 12) : p.price.mo;
            const isCurrent = user?.plan === p.id;
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
                {yearly && p.price.yr > 0 && (
                  <p className="text-xs text-slate-500">billed ${p.price.yr}/year</p>
                )}
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
                  {isCurrent ? "Current plan" : busy === p.id ? "Processing…" : p.cta}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-slate-500">
          This is a demo. Payments are simulated — wire up Stripe Checkout with the
          keys in <code className="text-slate-400">.env.local</code> to take real payments.
        </p>
      </section>
      <Footer />
    </div>
  );
}
