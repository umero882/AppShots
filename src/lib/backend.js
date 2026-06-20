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

  getCurrentUser() {
    const session = read(LS.session, null);
    if (!session) return null;
    const users = read(LS.users, []);
    const user = users.find((u) => u.id === session.userId);
    return user ? this._publicUser(user) : null;
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
 * To switch to a real backend:
 *   1) npm i @supabase/supabase-js
 *   2) fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local
 *   3) create a `projects` table (see README) with RLS
 *   4) implement the same method surface as localBackend using the client below
 *
 * import { createClient } from "@supabase/supabase-js";
 * const supabase = createClient(
 *   import.meta.env.VITE_SUPABASE_URL,
 *   import.meta.env.VITE_SUPABASE_ANON_KEY
 * );
 * ...map each method to supabase.auth / supabase.from("projects")...
 */

const hasSupabase =
  !!import.meta.env.VITE_SUPABASE_URL &&
  !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export const BACKEND_MODE = hasSupabase ? "supabase (configure in backend.js)" : "local";

// Always export localBackend for now; wire Supabase when ready.
export const backend = localBackend;
