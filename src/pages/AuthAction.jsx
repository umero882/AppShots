import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { backend } from "../lib/backend";
import { useAuth } from "../lib/auth";

/**
 * Branded landing page for Firebase's email action links. The Auth email
 * templates point their Action URL here, so instead of Firebase's plain hosted
 * page users see AppShots when they:
 *   - reset a password  (?mode=resetPassword&oobCode=…)
 *   - verify an email    (?mode=verifyEmail&oobCode=…)
 *   - undo an email change (?mode=recoverEmail&oobCode=…)
 * Firebase's own message copy can't be customized, so this page is where the
 * brand lives. Codes are verified client-side via the Firebase SDK.
 */
export default function AuthAction() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const mode = params.get("mode") || "";
  const code = params.get("oobCode") || "";

  const [status, setStatus] = useState("loading"); // loading | ready | done | error
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  const supported = !!backend.checkPasswordResetCode;

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!code || !supported) {
        setError(supported ? "This link is missing its code." : "Email links aren't available on this backend.");
        setStatus("error");
        return;
      }
      try {
        if (mode === "resetPassword") {
          const addr = await backend.checkPasswordResetCode({ code });
          if (!cancelled) {
            setEmail(addr || "");
            setStatus("ready");
          }
        } else if (mode === "verifyEmail" || mode === "recoverEmail") {
          await backend.applyActionCode({ code });
          if (!cancelled) setStatus("done");
        } else {
          throw new Error("Unknown link type.");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setStatus("error");
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [mode, code, supported]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (form.password !== form.confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await backend.completePasswordReset({ code, password: form.password });
      // Sign the user straight in with the new password so they land in the app.
      try {
        await signIn({ email, password: form.password });
        navigate("/dashboard", { replace: true });
        return;
      } catch {
        /* fall through to the confirmation view */
      }
      setStatus("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const toLogin = (
    <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200">
      Back to log in
    </Link>
  );

  if (status === "loading") {
    return (
      <AuthShell title="One moment…" subtitle="Checking your link.">
        <div className="h-11 animate-pulse rounded-xl bg-white/5" />
      </AuthShell>
    );
  }

  if (status === "error") {
    return (
      <AuthShell
        title="This link didn't work"
        subtitle="Reset links only work once and expire after about an hour."
        footer={toLogin}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </div>
          {mode === "resetPassword" && (
            <Link to="/login?mode=reset" className="btn-primary block w-full text-center">
              Request a new reset link
            </Link>
          )}
        </div>
      </AuthShell>
    );
  }

  if (status === "done") {
    const copy =
      mode === "verifyEmail"
        ? { title: "Email verified", subtitle: "Thanks — your email address is confirmed." }
        : mode === "recoverEmail"
          ? { title: "Email change reverted", subtitle: "Your account is back on its previous email address. Consider changing your password if you didn't request this." }
          : { title: "Password updated", subtitle: "You can log in with your new password now." };
    return (
      <AuthShell title={copy.title} subtitle={copy.subtitle} footer={null}>
        <Link to="/login" className="btn-primary block w-full text-center">
          Go to log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={email ? `For your AppShots account ${email}.` : "For your AppShots account."}
      footer={toLogin}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}
        <div>
          <label className="label">New password</label>
          <input
            type="password"
            required
            autoFocus
            minLength={6}
            autoComplete="new-password"
            className="input"
            placeholder="At least 6 characters"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Confirm password</label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="input"
            placeholder="••••••••"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
