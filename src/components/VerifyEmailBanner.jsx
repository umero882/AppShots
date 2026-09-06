import { useState } from "react";
import { MailCheck } from "lucide-react";
import { useAuth } from "../lib/auth";

const DISMISS_KEY = "appshots:verify-banner-dismissed";

/**
 * Nudges signed-in users whose email isn't verified yet. A verification link is
 * sent automatically at signup; this offers a resend and a "I clicked it" refresh.
 * Dismissal lasts for the browser session only, so the nudge comes back.
 */
export default function VerifyEmailBanner() {
  const { user, sendEmailVerification, refreshUser } = useAuth();
  const [state, setState] = useState("idle"); // idle | sending | sent | checking | error
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!user || user.emailVerified !== false || dismissed) return null;

  async function resend() {
    setError("");
    setState("sending");
    try {
      const r = await sendEmailVerification();
      if (r?.alreadyVerified) await refreshUser();
      setState("sent");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }

  async function check() {
    setError("");
    setState("checking");
    try {
      const u = await refreshUser();
      if (u?.emailVerified) return; // banner unmounts
      setError("Not verified yet — open the link in the email first.");
      setState("error");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
    setDismissed(true);
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      <MailCheck size={18} className="shrink-0" />
      <span className="min-w-0 flex-1">
        {state === "sent" ? (
          <>
            Verification email sent to <span className="font-semibold">{user.email}</span>. Open the link, then
            come back here.
          </>
        ) : (
          <>
            Please verify your email. We sent a link to <span className="font-semibold">{user.email}</span>
            {error && <span className="block text-xs text-amber-300/80">{error}</span>}
          </>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={resend}
          disabled={state === "sending" || state === "checking"}
          className="font-semibold text-amber-100 hover:text-white disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : state === "sent" ? "Send again" : "Resend email"}
        </button>
        <button
          type="button"
          onClick={check}
          disabled={state === "sending" || state === "checking"}
          className="font-semibold text-amber-100 hover:text-white disabled:opacity-60"
        >
          {state === "checking" ? "Checking…" : "I've verified"}
        </button>
        <button type="button" onClick={dismiss} className="text-amber-300/70 hover:text-amber-100">
          Dismiss
        </button>
      </span>
    </div>
  );
}
