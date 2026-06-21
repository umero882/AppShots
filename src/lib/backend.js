/**
 * Backend abstraction layer.
 *
 * By default this uses a localStorage-backed implementation so the app runs
 * with zero setup. When Supabase env vars are present you can swap the
 * implementation for the real one (see `supabaseBackend` stub at the bottom)
 * without touching any UI code — every screen talks only to the `backend`
 * object exported here.
 */

const LS = {
  users: "appshots:users",
  session: "appshots:session",
  projects: "appshots:projects",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function delay(ms = 250) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ----------------------------- localStorage backend ----------------------------- */

const localBackend = {
  /* --- auth --- */
  async signUp({ name, email, password }) {
    await delay();
    const users = read(LS.users, []);
    if (users.find((u) => u.email === email.toLowerCase())) {
      throw new Error("An account with this email already exists.");
    }
    const user = {
      id: uid(),
      name: name || email.split("@")[0],
      email: email.toLowerCase(),
      password, // demo only — never store plaintext in a real backend
      plan: "free",
      createdAt: Date.now(),
    };
    users.push(user);
    write(LS.users, users);
    return this._startSession(user);
  },

  async signIn({ email, password }) {
    await delay();
    const users = read(LS.users, []);
    const user = users.find(
      (u) => u.email === email.toLowerCase() && u.password === password
    );
    if (!user) throw new Error("Invalid email or password.");
    return this._startSession(user);
  },

  async signOut() {
    localStorage.removeItem(LS.session);
  },

  async getCurrentUser() {
    const session = read(LS.session, null);
    if (!session) return null;
    const users = read(LS.users, []);
    const user = users.find((u) => u.id === session.userId);
    return user ? this._publicUser(user) : null;
  },

  // No external auth changes for localStorage; return a no-op unsubscribe.
  onAuthChange() {
    return () => {};
  },

  async upgradePlan(plan) {
    await delay();
    const session = read(LS.session, null);
    if (!session) throw new Error("Not signed in.");
    const users = read(LS.users, []);
    const idx = users.findIndex((u) => u.id === session.userId);
    if (idx === -1) throw new Error("Account not found.");
    users[idx].plan = plan;
    write(LS.users, users);
    return this._publicUser(users[idx]);
  },

  _startSession(user) {
    write(LS.session, { userId: user.id, ts: Date.now() });
    return this._publicUser(user);
  },
  _publicUser(u) {
    const { password, ...rest } = u;
    return rest;
  },

  /* --- projects --- */
  async listProjects(userId) {
    await delay(150);
    return read(LS.projects, [])
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getProject(id) {
    await delay(120);
    return read(LS.projects, []).find((p) => p.id === id) || null;
  },

  async createProject(userId, data) {
    await delay(150);
    const projects = read(LS.projects, []);
    const now = Date.now();
    const project = {
      id: uid(),
      userId,
      name: data.name || "Untitled project",
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    projects.push(project);
    write(LS.projects, projects);
    return project;
  },

  async updateProject(id, patch) {
    await delay(120);
    const projects = read(LS.projects, []);
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error("Project not found.");
    projects[idx] = { ...projects[idx], ...patch, updatedAt: Date.now() };
    write(LS.projects, projects);
    return projects[idx];
  },

  async deleteProject(id) {
    await delay(120);
    write(
      LS.projects,
      read(LS.projects, []).filter((p) => p.id !== id)
    );
    return true;
  },
};

/* ------------------------------- Supabase backend ------------------------------- *
 * Real backend (auth + projects) backed by the self-hosted Supabase on Coolify.
 * Enabled automatically when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set.
 * The `projects` table + RLS schema lives in supabase/schema.sql. `name` and
 * `plan` are stored in the auth user's metadata (no separate profiles table).
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasSupabase = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

/** Map a Supabase auth user → the app's user shape. (pure, exported for tests) */
export function userFromAuthUser(u) {
  if (!u) return null;
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email,
    name: meta.name || (u.email ? u.email.split("@")[0] : "User"),
    plan: meta.plan || "free",
  };
}

/** Map a `projects` row (snake_case, ISO dates) → the app's project shape. */
export function rowToProject(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    state: r.state,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

function makeSupabaseBackend() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  return {
    async signUp({ name, email, password }) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: name || email.split("@")[0], plan: "free" } },
      });
      if (error) throw new Error(error.message);
      // With email confirmation off, a session is returned. If it's on, try to
      // sign in immediately so the user lands in the app.
      if (!data.session) {
        const si = await supabase.auth.signInWithPassword({ email, password });
        if (si.error) throw new Error("Account created — confirm your email, then sign in.");
        return userFromAuthUser(si.data.user);
      }
      return userFromAuthUser(data.user);
    },

    async signIn({ email, password }) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Invalid email or password.");
      return userFromAuthUser(data.user);
    },

    async signOut() {
      await supabase.auth.signOut();
    },

    async getCurrentUser() {
      const { data } = await supabase.auth.getUser();
      return userFromAuthUser(data?.user || null);
    },

    onAuthChange(cb) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        cb(userFromAuthUser(session?.user || null));
      });
      return () => data.subscription.unsubscribe();
    },

    async upgradePlan(plan) {
      const { data, error } = await supabase.auth.updateUser({ data: { plan } });
      if (error) throw new Error(error.message);
      return userFromAuthUser(data.user);
    },

    async listProjects() {
      // RLS scopes rows to the signed-in user, so no explicit user filter needed.
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []).map(rowToProject);
    },

    async getProject(id) {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return rowToProject(data);
    },

    async createProject(userId, payload) {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: userId,
          name: payload.name || "Untitled project",
          state: payload.state || {},
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return rowToProject(data);
    },

    async updateProject(id, patch) {
      const upd = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) upd.name = patch.name;
      if (patch.state !== undefined) upd.state = patch.state;
      const { data, error } = await supabase
        .from("projects")
        .update(upd)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return rowToProject(data);
    },

    async deleteProject(id) {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return true;
    },
  };
}

export const BACKEND_MODE = hasSupabase ? "supabase" : "local";

// Use Supabase when configured, else the zero-setup localStorage backend.
export const backend = hasSupabase ? makeSupabaseBackend() : localBackend;
