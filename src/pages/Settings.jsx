import { useRef, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { User, Mail, Crown, Check, LogOut, Sparkles, Upload, Trash2 } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useAuth } from "../lib/auth";
import { fileToAvatarDataUrl } from "../lib/avatar";

/** First letters of up to two name words, for the avatar chip. */
export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/** The user's logo if set (and it loads), otherwise an initials chip. Falls back
 *  to initials if the image fails to load (e.g. a missing/deleted blob) so a broken
 *  reference never renders a broken-image icon. */
export function Avatar({ avatar, name, size = "h-16 w-16", text = "text-lg", extra = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatar]); // retry when the source changes
  const base = `${size} shrink-0 rounded-2xl ${extra}`;
  return avatar && !failed ? (
    <img
      src={avatar}
      alt="Profile logo"
      onError={() => setFailed(true)}
      className={`${base} border border-white/10 bg-ink-900 object-cover`}
    />
  ) : (
    <div className={`${base} grid place-items-center bg-gradient-to-br from-brand-400 to-brand-600 ${text} font-bold text-white`}>
      {initials(name)}
    </div>
  );
}

/** Format a Unix (seconds) timestamp as a short date, or "" if absent. */
export function formatDate(unixSeconds) {
  if (!unixSeconds) return "";
  try {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function Settings() {
  const { user, updateProfile, signOut, openBillingPortal } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [name, setName] = useState(user?.name || "");
  const [avatar, setAvatar] = useState(user?.avatar || null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");

  const trimmed = name.trim();
  const nameChanged = !!trimmed && trimmed !== user?.name;
  const avatarChanged = (avatar || null) !== (user?.avatar || null);
  const dirty = nameChanged || avatarChanged;
  const isPaid = !!user?.plan && user.plan !== "free";
  const sub = user?.subscription || null;
  const pastDue = sub?.status === "past_due";

  async function openPortal() {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortalError("");
    try {
      const url = await openBillingPortal();
      if (url) {
        window.location.href = url;
        return;
      }
      // No hosted portal on this backend (offline demo) — send to pricing.
      navigate("/pricing");
    } catch (e) {
      setPortalError(e?.message || "Couldn't open the billing portal.");
      setPortalBusy(false);
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError("");
    setSaved(false);
    setProcessing(true);
    try {
      setAvatar(await fileToAvatarDataUrl(file));
    } catch (err) {
      setError(err?.message || "Couldn't use that image.");
    } finally {
      setProcessing(false);
    }
  }

  function removeAvatar() {
    setAvatar(null);
    setSaved(false);
    setError("");
  }

  async function save(e) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const u = await updateProfile({ name: trimmed, avatar });
      // Sync local state to what was persisted (e.g. the logo is now a blob URL,
      // not the data-URL we uploaded) so the preview + dirty-check settle.
      if (u) {
        setName(u.name || trimmed);
        setAvatar(u.avatar ?? null);
      }
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
          <Avatar avatar={avatar} name={name} size="h-14 w-14" extra="shadow-glow" />
          <div>
            <h1 className="text-2xl font-bold text-white">Profile &amp; settings</h1>
            <p className="text-sm text-slate-400">Manage your account details and plan.</p>
          </div>
        </div>

        {/* Profile */}
        <section className="card mt-8 p-6 sm:p-7">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Profile</h2>

          {/* Logo */}
          <div className="mt-5 flex items-center gap-5">
            <Avatar avatar={avatar} name={name} />
            <div>
              <p className="text-sm font-medium text-white">Logo</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={processing || saving}
                  className="btn-ghost"
                >
                  <Upload size={16} /> {processing ? "Processing…" : avatar ? "Change" : "Upload logo"}
                </button>
                {avatar && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    disabled={saving}
                    className="btn-ghost text-slate-300 hover:text-red-300"
                  >
                    <Trash2 size={16} /> Remove
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">PNG, JPG or SVG · square works best · max 10&nbsp;MB.</p>
            </div>
          </div>

          {/* Name + email */}
          <form onSubmit={save} className="mt-6 space-y-5 border-t border-white/5 pt-6">
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
              <button type="submit" className="btn-primary" disabled={!dirty || saving || processing}>
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
                {isPaid && sub?.currentPeriodEnd && (
                  <p className="mt-1 text-xs text-slate-500">
                    {sub.cancelAtPeriodEnd
                      ? `Cancels on ${formatDate(sub.currentPeriodEnd)}`
                      : `Renews on ${formatDate(sub.currentPeriodEnd)}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isPaid ? (
                <>
                  <button type="button" onClick={openPortal} disabled={portalBusy} className="btn-primary">
                    {portalBusy ? "Opening…" : "Manage billing"}
                  </button>
                  <Link to="/pricing" className="btn-ghost">Change plan</Link>
                </>
              ) : (
                <Link to="/pricing" className="btn-primary">Upgrade to Pro</Link>
              )}
            </div>
          </div>

          {pastDue && (
            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
              Your last payment failed. Update your card in “Manage billing” to keep your plan.
            </p>
          )}
          {portalError && <p className="mt-4 text-sm text-red-400">{portalError}</p>}
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
