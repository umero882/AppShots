/**
 * The signed-in user's workspace, loaded once and shared by every screen that
 * needs it — the team page, the dashboard's shared library, the editor's brand
 * kit and the navbar.
 *
 * It only fetches for people who could plausibly have a workspace (a Team plan,
 * or a seat the entitlement already told us about). Free users pay no request
 * for a feature they do not have.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import * as api from "./team";

const TeamContext = createContext(null);

const EMPTY = {
  team: null,
  role: null,
  members: [],
  invites: [],
  seatsUsed: 0,
  seatsTotal: 0,
  sharing: false,
};

export function TeamProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // A workspace is possible when the plan is Team (they bought it) or the server
  // already told us a seat exists. Anything else would be a wasted round-trip.
  const eligible = !!user && (user.plan === "team" || !!user.teamId);

  const refresh = useCallback(async () => {
    if (!user) {
      setState(EMPTY);
      return EMPTY;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api.getTeam();
      setState({ ...EMPTY, ...data });
      return data;
    } catch (e) {
      // Not being in a team is an ordinary answer, not a failure to report.
      if (e?.code === "no-team") {
        setState(EMPTY);
        return EMPTY;
      }
      setError(api.describeTeamError(e, "Couldn't load your workspace."));
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!eligible) {
      setState(EMPTY);
      return;
    }
    refresh();
  }, [eligible, refresh]);

  /**
   * Run a mutation and adopt whatever roster it returns.
   *
   * Every /api/team write answers with the full workspace, so the UI never has
   * to guess what changed — which is how a seat count drifts from the truth.
   */
  const run = useCallback(async (fn) => {
    const data = await fn();
    if (data && Object.prototype.hasOwnProperty.call(data, "team")) setState({ ...EMPTY, ...data });
    return data;
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      loading,
      error,
      eligible,
      refresh,
      brand: state.team?.brand || null,
      teamId: state.team?.id || null,
      rename: (name) => run(() => api.renameTeam(name)),
      saveBrand: (brand) => run(() => api.saveBrandKit(brand)),
      invite: (email, role) => run(() => api.inviteMember(email, role)),
      revoke: (token) => run(() => api.revokeInvite(token)),
      setRole: (uid, role) => run(() => api.setMemberRole(uid, role)),
      remove: (uid) => run(() => api.removeMember(uid)),
      transfer: (uid) => run(() => api.transferOwnership(uid)),
      disband: async () => {
        await api.disbandTeam();
        setState(EMPTY);
      },
      join: (token) => run(() => api.joinTeam(token)),
    }),
    [state, loading, error, eligible, refresh, run],
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

/** Safe outside the provider (prerendering, tests) — answers "no workspace". */
export function useTeam() {
  return useContext(TeamContext) || { ...EMPTY, loading: false, error: "", eligible: false, brand: null, teamId: null };
}
