import { useState } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { signIn, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = location.state?.from || "/dashboard";

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // "login" | "reset" — the reset view reuses the email already typed above.
  // /login?mode=reset opens the reset view directly (used by expired-link pages).
  const [mode, setMode] = useState(searchParams.get("mode") === "reset" ? "reset" : "login");
  const [resetSentTo, setResetSentTo] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(form);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(form.email);
      setResetSentTo(form.email.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setResetSentTo("");
  }

  if (mode === "reset") {
    return (
      <AuthShell
        title="Reset your password"
        subtitle="Enter your email and we'll send you a link to choose a new password."
        footer={
          <>
            Remembered it?{" "}
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="font-semibold text-brand-300 hover:text-brand-200"
            >
              Back to log in
            </button>
          </>
        }
      >
        {resetSentTo ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-200">
              If an account exists for <span className="font-semibold">{resetSentTo}</span>, a reset
              link is on its way. Check your inbox (and spam folder) — the link expires in about an
              hour.
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => switchMode("login")}
            >
              Back to log in
            </button>
            <p className="text-center text-xs text-slate-500">
              Didn't get it?{" "}
              <button
                type="button"
                onClick={() => setResetSentTo("")}
                className="font-semibold text-brand-300 hover:text-brand-200"
              >
                Send again
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={sendReset} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
                {error}
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                className="input"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to keep working on your screenshots."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-semibold text-brand-300 hover:text-brand-200">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            className="input"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label">Password</label>
            <button
              type="button"
              onClick={() => switchMode("reset")}
              className="mb-1.5 text-xs font-semibold text-brand-300 hover:text-brand-200"
            >
              Forgot password?
            </button>
          </div>
          <input
            type="password"
            required
            autoComplete="current-password"
            className="input"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </AuthShell>
  );
}
