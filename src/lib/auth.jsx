import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { backend } from "./backend";
import { trackSignUp, trackBeginCheckout } from "./analytics";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // getCurrentUser is async on the Supabase backend, sync-ish on local —
    // Promise.resolve handles both.
    Promise.resolve(backend.getCurrentUser()).then((u) => {
      if (mounted) {
        setUser(u);
        setLoading(false);
      }
    });
    const unsub = backend.onAuthChange
      ? backend.onAuthChange((u) => {
          if (mounted) setUser(u);
        })
      : null;
    return () => {
      mounted = false;
      if (unsub) unsub();
    };
  }, []);

  const signIn = useCallback(async (creds) => {
    const u = await backend.signIn(creds);
    setUser(u);
    return u;
  }, []);

  const signUp = useCallback(async (creds) => {
    const u = await backend.signUp(creds);
    setUser(u);
    trackSignUp(creds?.provider || "password");
    // New accounts get a verify-your-email link automatically; failures here must
    // never block signup (the dashboard offers a resend).
    if (backend.sendEmailVerification && u && u.emailVerified === false) {
      backend.sendEmailVerification().catch(() => {});
    }
    return u;
  }, []);

  // Send (or resend) the verify-email link for the signed-in user.
  const sendEmailVerification = useCallback(async () => {
    if (!backend.sendEmailVerification) throw new Error("Email verification isn't available on this backend.");
    return backend.sendEmailVerification();
  }, []);

  // Re-read the current user from the backend (e.g. after an email is verified).
  const refreshUser = useCallback(async () => {
    const u = await Promise.resolve(backend.getCurrentUser({ reload: true }));
    setUser(u);
    return u;
  }, []);

  const signOut = useCallback(async () => {
    await backend.signOut();
    setUser(null);
  }, []);

  // Irreversible: cancels billing, erases the account and signs out. The backend
  // does the cascade; this only clears the session once it succeeded.
  const deleteAccount = useCallback(async (confirm) => {
    if (!backend.deleteAccount) throw new Error("Account deletion isn't available on this backend.");
    const result = await backend.deleteAccount(confirm);
    setUser(null);
    return result;
  }, []);

  // Email a password-reset link. Resolves even for unknown addresses (no account
  // enumeration); throws only for invalid input, rate limits, or network errors.
  const requestPasswordReset = useCallback(async (email) => {
    if (!backend.requestPasswordReset) throw new Error("Password reset isn't available on this backend.");
    await backend.requestPasswordReset({ email: String(email || "").trim() });
  }, []);

  const upgrade = useCallback(async (plan) => {
    const u = await backend.upgradePlan(plan);
    setUser(u);
    return u;
  }, []);

  // Redirect to Stripe hosted Checkout for a paid plan. Returns a URL to redirect
  // to (real billing), or null when the active backend has no hosted Checkout
  // (offline demo) — the caller then just navigates on.
  const startCheckout = useCallback(async ({ plan, interval, price }) => {
    // Fired before the redirect: this measures intent, which is the number the
    // purchase event is compared against.
    trackBeginCheckout({ plan, interval, value: price });
    return backend.startCheckout({ plan, interval });
  }, []);

  // Open the Stripe billing portal (self-service plan changes / cancel / payment).
  const openBillingPortal = useCallback(async () => {
    return backend.openBillingPortal();
  }, []);

  // Re-read entitlement from the server (pass { sessionId } after a Checkout return
  // to reconcile immediately) and fold the resulting plan into the current user.
  const refreshEntitlement = useCallback(async (opts) => {
    const ent = await backend.getEntitlement(opts);
    setUser((prev) =>
      prev
        ? {
            ...prev,
            plan: ent.plan || prev.plan,
            subscription: {
              status: ent.status,
              interval: ent.interval || null,
              currentPeriodEnd: ent.currentPeriodEnd,
              cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
            },
          }
        : prev
    );
    return ent;
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const u = await backend.updateProfile(patch);
    setUser(u);
    return u;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        deleteAccount,
        requestPasswordReset,
        sendEmailVerification,
        refreshUser,
        upgrade,
        updateProfile,
        startCheckout,
        openBillingPortal,
        refreshEntitlement,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
