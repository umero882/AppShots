import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Users, Check, Loader2, AlertTriangle } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useAuth } from "../lib/auth";
import { useTeam } from "../lib/teamContext";
import { previewInvite, describeTeamError, roleLabel } from "../lib/team";

/**
 * Accepting an invite, for someone who may not have an account yet.
 *
 * The invite is previewed BEFORE any sign-in: "join Acme on AppShots" is a
 * reason to make an account, and "sign in to see what this link is" is not. The
 * preview endpoint needs no token, and reveals only the workspace name, the role
 * and who sent it.
 */
export default function JoinTeam() {
  const { token } = useParams();
  const { user, loading: authLoading, refreshEntitlement } = useAuth();
  const team = useTeam();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let live = true;
    previewInvite(token)
      .then((res) => {
        if (!live) return;
        if (res?.invite) setInvite(res.invite);
        else setError("This invite has expired or has already been used.");
      })
      .catch((e) => live && setError(describeTeamError(e, "Couldn't open this invite.")))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [token]);

  async function accept() {
    setJoining(true);
    setError("");
    try {
      await team.join(token);
      // The seat changes the plan, so the entitlement has to be re-read before
      // the app starts trusting it — otherwise exports keep the free watermark.
      await refreshEntitlement({ sync: false }).catch(() => {});
      setJoined(true);
      setTimeout(() => navigate("/dashboard"), 1200);
    } catch (e) {
      setError(describeTeamError(e, "Couldn't accept this invite."));
    } finally {
      setJoining(false);
    }
  }

  const wrongEmail = !!(user?.email && invite?.email && user.email.toLowerCase() !== invite.email.toLowerCase());

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto flex max-w-lg flex-col px-5 py-16">
        <div className="card p-8 text-center">
          {loading ? (
            <p className="flex items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Opening the invite…
            </p>
          ) : !invite ? (
            <>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-500/15 text-red-300">
                <AlertTriangle size={22} />
              </div>
              <h1 className="mt-4 text-xl font-bold text-white">This invite isn&rsquo;t valid</h1>
              <p className="mt-2 text-sm text-slate-400">{error || "It may have expired or already been used."}</p>
              <p className="mt-2 text-xs text-slate-500">Ask whoever invited you to send a new one.</p>
              <Link to="/" className="btn-ghost mx-auto mt-6">
                Back to AppShots
              </Link>
            </>
          ) : joined ? (
            <>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                <Check size={22} />
              </div>
              <h1 className="mt-4 text-xl font-bold text-white">You&rsquo;re in</h1>
              <p className="mt-2 text-sm text-slate-400">Taking you to {invite.teamName}&rsquo;s workspace…</p>
            </>
          ) : (
            <>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow">
                <Users size={22} />
              </div>
              <h1 className="mt-4 text-xl font-bold text-white">Join {invite.teamName}</h1>
              <p className="mt-2 text-sm text-slate-400">
                {invite.invitedBy ? `${invite.invitedBy} invited you` : "You've been invited"} to join{" "}
                {invite.teamName} on AppShots as {invite.role === "admin" ? "an admin" : "a member"}.
              </p>
              <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm text-slate-300">
                {["The team's shared project library", "Shared templates and brand kit", "Watermark-free, full-resolution exports"].map(
                  (line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <Check size={16} className="mt-0.5 shrink-0 text-brand-400" /> {line}
                    </li>
                  ),
                )}
              </ul>

              {error && <p className="mt-5 text-sm text-red-400">{error}</p>}

              {authLoading ? null : !user ? (
                <div className="mt-6 space-y-2">
                  <p className="text-xs text-slate-500">
                    The invite was sent to <span className="text-slate-300">{invite.email}</span> — sign in with
                    that address to accept it.
                  </p>
                  <Link to="/signup" state={{ from: `/join/${token}` }} className="btn-primary w-full">
                    Create an account
                  </Link>
                  <Link to="/login" state={{ from: `/join/${token}` }} className="btn-ghost w-full">
                    I already have one
                  </Link>
                </div>
              ) : wrongEmail ? (
                <p className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  You&rsquo;re signed in as {user.email}, but this invite is for {invite.email}. Sign out and
                  back in with that address to accept it.
                </p>
              ) : (
                <button onClick={accept} disabled={joining} className="btn-primary mx-auto mt-6">
                  {joining ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {joining ? "Joining…" : `Join ${invite.teamName}`}
                </button>
              )}

              <p className="mt-4 text-xs text-slate-500">
                You&rsquo;ll be {roleLabel(invite.role).toLowerCase() === "admin" ? "an admin" : "a member"} — nothing
                is charged to you, the workspace owner pays for the seat.
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
