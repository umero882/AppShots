import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { backend } from "./backend";

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
    return u;
  }, []);

  const signOut = useCallback(async () => {
    await backend.signOut();
    setUser(null);
  }, []);

  const upgrade = useCallback(async (plan) => {
    const u = await backend.upgradePlan(plan);
    setUser(u);
    return u;
  }, []);

  // Redirect to Stripe hosted Checkout for a paid plan. Returns a URL to redirect
  // to (real billing), or null when the active backend has no hosted Checkout
  // (offline demo) — the caller then just navigates on.
  const startCheckout = useCallback(async ({ plan, interval }) => {
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
