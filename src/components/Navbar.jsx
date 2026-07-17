import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Menu, X, LogOut, LayoutGrid, Radar, Settings as SettingsIcon } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "../lib/auth";

/** First letters of up to two name words, for the avatar chip. */
function navInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Fall back to initials if the avatar image fails to load (e.g. missing blob).
  const [avatarError, setAvatarError] = useState(false);
  useEffect(() => setAvatarError(false), [user?.avatar]);

  const links = [
    { label: "Features", href: "/#features" },
    { label: "How it works", href: "/#how" },
    { label: "Inspiration", href: "/inspiration" },
    { label: "Pricing", href: "/pricing" },
  ];

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
        <Logo />

        <div className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm font-medium text-slate-300 hover:text-white transition"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Link to="/tracker" className="btn-ghost">
                <Radar size={16} /> Tracker
              </Link>
              <Link to="/dashboard" className="btn-ghost">
                <LayoutGrid size={16} /> Dashboard
              </Link>
              <button onClick={handleSignOut} className="btn-ghost">
                <LogOut size={16} /> Sign out
              </button>
              <Link
                to="/settings"
                title="Profile & settings"
                aria-label="Profile & settings"
                className="transition hover:brightness-110"
              >
                {user.avatar && !avatarError ? (
                  <img
                    src={user.avatar}
                    alt=""
                    onError={() => setAvatarError(true)}
                    className="h-9 w-9 rounded-full border border-white/10 bg-ink-900 object-cover"
                  />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
                    {navInitials(user.name)}
                  </span>
                )}
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-semibold text-slate-200 hover:text-white px-3">
                Log in
              </Link>
              <Link to="/signup" className="btn-primary">
                Get started free
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden text-slate-200"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </nav>

      {open && (
        <div className="md:hidden border-t border-white/5 px-5 py-4 space-y-3">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block text-sm font-medium text-slate-300"
            >
              {l.label}
            </a>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            {user ? (
              <>
                <Link to="/tracker" className="btn-ghost" onClick={() => setOpen(false)}>
                  Tracker
                </Link>
                <Link to="/dashboard" className="btn-ghost" onClick={() => setOpen(false)}>
                  Dashboard
                </Link>
                <Link to="/settings" className="btn-ghost" onClick={() => setOpen(false)}>
                  <SettingsIcon size={16} /> Profile &amp; settings
                </Link>
                <button onClick={handleSignOut} className="btn-ghost">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost" onClick={() => setOpen(false)}>
                  Log in
                </Link>
                <Link to="/signup" className="btn-primary" onClick={() => setOpen(false)}>
                  Get started free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
