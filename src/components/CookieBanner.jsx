import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { getConsent, setConsent, onConsentChange } from "../lib/consent";
import { initAnalytics } from "../lib/analytics";

/**
 * Asks before any analytics runs.
 *
 * Accept and Decline are the same size, weight and prominence on purpose: a
 * "reject" that is harder to find than "accept" is not consent, it is a dark
 * pattern, and regulators treat it as one. There is no third "manage 47
 * vendors" screen because there is one analytics vendor and no ad tech.
 *
 * Nothing renders until after mount, so the prerendered HTML never ships a
 * banner to a crawler — and never flashes one at a visitor who already chose.
 */
export default function CookieBanner() {
  const [choice, setChoice] = useState("granted"); // assume answered until mounted
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setChoice(getConsent());
    return onConsentChange(setChoice);
  }, []);

  if (!mounted || choice !== null) return null;

  function decide(value) {
    setConsent(value);
    if (value === "granted") initAnalytics();
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink-900/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2.5 text-sm text-slate-300">
          <Cookie size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            We'd like to measure how AppShots is used, with Google Analytics. Signing in and saving your work
            need their own storage and always work.{" "}
            <Link to="/privacy#cookies" className="underline hover:text-white">
              How we use it
            </Link>
            .
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => decide("denied")} className="btn-ghost flex-1 sm:flex-none">
            Decline
          </button>
          <button onClick={() => decide("granted")} className="btn-ghost flex-1 sm:flex-none">
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
