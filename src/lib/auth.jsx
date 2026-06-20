import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { backend } from "./backend";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(backend.getCurrentUser());
    setLoading(false);
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

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, upgrade }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
