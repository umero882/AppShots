import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { User, Mail, Crown, Check, LogOut, Sparkles } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useAuth } from "../lib/auth";

/** First letters of up to two name words, for the avatar chip. */
export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function Settings() {
  const { user, updateProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const trimmed = name.trim();
  const dirty = !!trimmed && trimmed !== user?.name;
  const isPaid = !!user?.plan && user.plan !== "free";

  async function saveName(e) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateProfile({ name: trimmed });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err?.message || "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white shadow-glow">
            {initials(user?.name)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Profile &amp; settings</h1>
            <p className="text-sm text-slate-400">Manage your account details and plan.</p>
          </div>
        </div>

        {/* Profile */}
        <section className="card mt-8 p-6 sm:p-7">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Profile</h2>
          <form onSubmit={saveName} className="mt-5 space-y-5">
            <div>
              <label className="label" htmlFor="displayName">Display name</label>
              <div className="relative">
                <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="displayName"
                  className="input pl-10"
                  value={name}
                  maxLength={60}
                  onChange={(e) => { setName(e.target.value); setSaved(false); }}
                  placeholder="Your name"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input id="email" className="input pl-10 opacity-70" value={user?.email || ""} disabled readOnly />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Your email is used to sign in and can't be changed here.</p>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary" disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                  <Check size={15} /> Saved
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Plan */}
        <section className="card mt-6 p-6 sm:p-7">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Plan</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                {isPaid ? <Crown size={18} className="text-amber-300" /> : <Sparkles size={18} />}
              </div>
              <div>
                <p className="font-semibold capitalize text-white">{user?.plan || "free"} plan</p>
                <p className="text-xs text-slate-500">
                  {isPaid
                    ? "Watermark-free, full-resolution exports."
                    : "Free forever — exports include a small watermark."}
                </p>
              </div>
            </div>
            <Link to="/pricing" className={isPaid ? "btn-ghost" : "btn-primary"}>
              {isPaid ? "Manage plan" : "Upgrade to Pro"}
            </Link>
          </div>
        </section>

        {/* Account */}
        <section className="card mt-6 p-6 sm:p-7">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Account</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-slate-400">Sign out of AppShots on this device.</p>
            <button onClick={handleSignOut} className="btn-ghost">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
