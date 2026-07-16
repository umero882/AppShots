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
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where,
} from "firebase/firestore";
import { getFirebase, hasFirebase } from "./firebase";

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

/* ------------------------------- Firebase backend ------------------------------- *
 * Real backend (auth + projects) on Firebase project `appshots-76a56`. Enabled by
 * default (config baked into src/firebase.js), off only in tests / when disabled.
 * Auth is email/password; the display name + plan live in a `users/{uid}` doc, and
 * projects live in the top-level `projects` collection. Owner-only access is
 * enforced by `firestore.rules` — publish them in the Firebase console.
 */

/** Map a Firebase Auth user (+ optional Firestore profile) → the app user shape. */
export function userFromFirebaseUser(u, profile) {
  if (!u) return null;
  const p = profile || {};
  return {
    id: u.uid,
    email: u.email,
    name: p.name || u.displayName || (u.email ? u.email.split("@")[0] : "User"),
    plan: p.plan || "free",
  };
}

/** Map a Firestore `projects` doc snapshot → the app project shape. */
export function docToProject(snap) {
  if (!snap || !snap.exists?.()) return null;
  const r = snap.data() || {};
  return {
    id: snap.id,
    userId: r.userId,
    name: r.name,
    state: r.state,
    createdAt: r.createdAt || Date.now(),
    updatedAt: r.updatedAt || r.createdAt || Date.now(),
  };
}

/** Friendly copy for the Firebase auth error codes users can actually hit. */
function fbAuthError(e, fallback) {
  const code = e?.code || "";
  if (code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/weak-password") return "Password should be at least 6 characters.";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code))
    return "Invalid email or password.";
  if (code === "auth/operation-not-allowed")
    return "Email/password sign-in isn't enabled for this Firebase project yet.";
  return fallback || e?.message || "Something went wrong.";
}

function makeFirebaseBackend() {
  // Firebase restores a persisted session asynchronously — currentUser is null
  // until the first auth-state emission, so resolve on that for getCurrentUser.
  function authReady(auth) {
    return new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => {
        unsub();
        resolve(u);
      });
    });
  }
  async function loadProfile(db, uid) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      return snap.exists() ? snap.data() : null;
    } catch {
      return null;
    }
  }

  return {
    async signUp({ name, email, password }) {
      const { auth, db } = getFirebase();
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw new Error(fbAuthError(e));
      }
      const displayName = name || email.split("@")[0];
      try { await updateProfile(cred.user, { displayName }); } catch { /* non-fatal */ }
      const profile = { name: displayName, email: cred.user.email, plan: "free", createdAt: Date.now() };
      try { await setDoc(doc(db, "users", cred.user.uid), profile); } catch { /* rules may block; UX still works */ }
      return userFromFirebaseUser(cred.user, profile);
    },

    async signIn({ email, password }) {
      const { auth, db } = getFirebase();
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw new Error(fbAuthError(e, "Invalid email or password."));
      }
      const profile = await loadProfile(db, cred.user.uid);
      return userFromFirebaseUser(cred.user, profile);
    },

    async signOut() {
      const { auth } = getFirebase();
      await fbSignOut(auth);
    },

    async getCurrentUser() {
      const { auth, db } = getFirebase();
      const u = auth.currentUser || (await authReady(auth));
      if (!u) return null;
      const profile = await loadProfile(db, u.uid);
      return userFromFirebaseUser(u, profile);
    },

    onAuthChange(cb) {
      const { auth, db } = getFirebase();
      return onAuthStateChanged(auth, async (u) => {
        if (!u) return cb(null);
        const profile = await loadProfile(db, u.uid);
        cb(userFromFirebaseUser(u, profile));
      });
    },

    async upgradePlan(plan) {
      const { auth, db } = getFirebase();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in.");
      await setDoc(doc(db, "users", u.uid), { plan }, { merge: true });
      const profile = await loadProfile(db, u.uid);
      return userFromFirebaseUser(u, profile);
    },

    /* --- projects --- */
    async listProjects(userId) {
      const { db } = getFirebase();
      // Filter by owner; sort client-side to avoid needing a composite index.
      const snap = await getDocs(query(collection(db, "projects"), where("userId", "==", userId)));
      return snap.docs.map(docToProject).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async getProject(id) {
      const { db } = getFirebase();
      return docToProject(await getDoc(doc(db, "projects", id)));
    },

    async createProject(userId, data) {
      const { db } = getFirebase();
      const now = Date.now();
      const payload = {
        userId,
        name: data.name || "Untitled project",
        state: data.state || {},
        createdAt: now,
        updatedAt: now,
      };
      const ref = await addDoc(collection(db, "projects"), payload);
      return { id: ref.id, ...payload };
    },

    async updateProject(id, patch) {
      const { db } = getFirebase();
      const upd = { updatedAt: Date.now() };
      if (patch.name !== undefined) upd.name = patch.name;
      if (patch.state !== undefined) upd.state = patch.state;
      await updateDoc(doc(db, "projects", id), upd);
      return docToProject(await getDoc(doc(db, "projects", id)));
    },

    async deleteProject(id) {
      const { db } = getFirebase();
      await deleteDoc(doc(db, "projects", id));
      return true;
    },
  };
}

// Precedence: Firebase (default) → Supabase (if configured) → localStorage.
export const BACKEND_MODE = hasFirebase ? "firebase" : hasSupabase ? "supabase" : "local";

export const backend = hasFirebase
  ? makeFirebaseBackend()
  : hasSupabase
    ? makeSupabaseBackend()
    : localBackend;
