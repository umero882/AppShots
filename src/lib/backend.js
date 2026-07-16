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

  async updateProfile({ name, avatar }) {
    await delay(150);
    const session = read(LS.session, null);
    if (!session) throw new Error("Not signed in.");
    const users = read(LS.users, []);
    const idx = users.findIndex((u) => u.id === session.userId);
    if (idx === -1) throw new Error("Account not found.");
    if (name !== undefined) users[idx].name = name.trim() || users[idx].name;
    if (avatar !== undefined) users[idx].avatar = avatar; // data-URL string, or null to remove
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
  updateProfile as fbUpdateProfile,
} from "firebase/auth";
import { getFirebase, hasFirebase, firebaseConfig } from "./firebase";

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
    avatar: meta.avatar || null,
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

    async updateProfile({ name, avatar }) {
      const patch = {};
      if (name !== undefined) patch.name = name;
      if (avatar !== undefined) patch.avatar = avatar; // data-URL string, or null to remove
      const { data, error } = await supabase.auth.updateUser({ data: patch });
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
 * Real backend on Firebase project `appshots-76a56`. Auth uses the Firebase SDK
 * (email/password). Firestore is accessed over its REST API (/v1) with the
 * signed-in user's ID token — NOT the streaming Web SDK, whose long-lived "Listen
 * channel" is 503'd/blocked behind some networks (antivirus SSL scanning, VPNs,
 * proxies) and makes every read/write hang ~30s before failing. REST is plain
 * request/response, so it stays fast and resilient. Owner-only access is still
 * enforced by `firestore.rules`. Display name + plan + logo live in `users/{uid}`,
 * projects in the top-level `projects` collection.
 */

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

/** Map a Firebase Auth user (+ optional Firestore profile) → the app user shape. */
export function userFromFirebaseUser(u, profile) {
  if (!u) return null;
  const p = profile || {};
  return {
    id: u.uid,
    email: u.email,
    name: p.name || u.displayName || (u.email ? u.email.split("@")[0] : "User"),
    plan: p.plan || "free",
    avatar: p.avatar || u.photoURL || null,
  };
}

/* -- Firestore REST value codec: plain JS <-> Firestore typed `Value`s -- */
export function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  const t = typeof v;
  if (t === "string") return { stringValue: v };
  if (t === "boolean") return { booleanValue: v };
  if (t === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (t === "object") return { mapValue: { fields: toFirestoreFields(v) } };
  return { nullValue: null };
}
export function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined) continue; // Firestore can't store undefined
    fields[k] = toFirestoreValue(val);
  }
  return fields;
}
export function fromFirestoreValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}
export function fromFirestoreFields(fields) {
  const obj = {};
  for (const [k, val] of Object.entries(fields || {})) obj[k] = fromFirestoreValue(val);
  return obj;
}

/** Map a Firestore REST document ({ name, fields }) → the app project shape.
 *  `state` is inline for small projects; large ones carry a `stateBlob` URL that
 *  the backend hydrates from the same-origin blob store on load. */
export function restDocToProject(docPath, fields) {
  const r = fromFirestoreFields(fields);
  return {
    id: (docPath || "").split("/").pop(),
    userId: r.userId,
    name: r.name,
    state: r.state,
    stateBlob: r.stateBlob || null,
    createdAt: r.createdAt || Date.now(),
    updatedAt: r.updatedAt || r.createdAt || Date.now(),
  };
}

// Above this serialized size, a project's state is stored in the same-origin
// blob store instead of inline in Firestore (whose doc limit is 1 MB).
const STATE_INLINE_MAX = 700 * 1024;

// Firestore auto-indexes every field and REJECTS any write whose indexed value
// exceeds 1500 bytes. A screenshot/logo data-URL blows past that, so state that
// contains such a value must be offloaded to the blob store, not stored inline.
const FIRESTORE_INDEXED_MAX = 1400;
export function containsLargeString(v) {
  if (typeof v === "string") return v.length > FIRESTORE_INDEXED_MAX;
  if (Array.isArray(v)) return v.some(containsLargeString);
  if (v && typeof v === "object") return Object.values(v).some(containsLargeString);
  return false;
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

  // The signed-in user's Firebase ID token (auto-refreshed) for REST auth.
  async function token() {
    const { auth } = getFirebase();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in.");
    return u.getIdToken();
  }

  // One authenticated Firestore REST call. Returns parsed JSON, null on 404,
  // throws on other errors. `path` is relative to the documents root.
  async function fs(path, { method = "GET", body, query = "" } = {}) {
    const t = await token();
    const res = await fetch(FS_BASE + path + query, {
      method,
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `Firestore request failed (${res.status}).`);
    return json;
  }

  // PATCH a doc writing ONLY the given fields (setDoc-merge semantics). Returns
  // the full updated document ({ name, fields }).
  function patchDoc(docPath, data) {
    const mask = Object.keys(data)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join("&");
    return fs(docPath, { method: "PATCH", query: "?" + mask, body: { fields: toFirestoreFields(data) } });
  }

  async function loadProfile(uid) {
    try {
      const d = await fs(`/users/${uid}`);
      return d ? fromFirestoreFields(d.fields) : null;
    } catch {
      return null;
    }
  }

  // --- same-origin blob store (for project state too big for a Firestore doc) ---
  async function putStateBlob(state) {
    const t = await token();
    const res = await fetch("/api/blob", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error("Couldn't save the project (blob store).");
    return (await res.json()).url; // "/api/blob/{id}"
  }
  async function getStateBlob(url) {
    const res = await fetch(url); // same-origin GET, unguessable id
    if (!res.ok) throw new Error("Couldn't load the project (blob store).");
    return res.json();
  }
  // Upload an image data-URL as raw bytes → a same-origin "/api/blob/{id}" URL
  // usable directly in an <img src>. (The data-URL itself can't be stored inline
  // in Firestore — it exceeds the 1500-byte indexed-field limit.)
  async function putImageBlob(dataUrl) {
    const t = await token();
    const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
    const mime = m ? m[1] : "image/png";
    const bytes = Uint8Array.from(atob(m ? m[2] : ""), (c) => c.charCodeAt(0));
    const res = await fetch("/api/blob", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": mime },
      body: bytes,
    });
    if (!res.ok) throw new Error("Couldn't upload the logo.");
    return (await res.json()).url;
  }
  async function deleteStateBlob(url) {
    try {
      const t = await token();
      await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
    } catch { /* best-effort cleanup */ }
  }
  // Turn { state, stateBlob } → the app project shape with `state` fully resolved.
  async function hydrate(project) {
    if (project.stateBlob && project.state == null) {
      try { project.state = await getStateBlob(project.stateBlob); } catch { project.state = {}; }
    }
    delete project.stateBlob;
    return project;
  }
  // Choose inline vs blob storage for a state object; returns Firestore fields.
  async function stateFields(state) {
    const json = JSON.stringify(state ?? {});
    // Offload when too big for the doc OR when any inline value would exceed the
    // 1500-byte indexed-field limit (e.g. a screenshot data-URL).
    if (json.length > STATE_INLINE_MAX || containsLargeString(state)) {
      return { stateBlob: await putStateBlob(state), state: null };
    }
    return { state: state ?? {}, stateBlob: null };
  }

  return {
    async signUp({ name, email, password }) {
      const { auth } = getFirebase();
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw new Error(fbAuthError(e));
      }
      const displayName = name || email.split("@")[0];
      try { await fbUpdateProfile(cred.user, { displayName }); } catch { /* non-fatal */ }
      const profile = { name: displayName, email: cred.user.email, plan: "free", createdAt: Date.now() };
      try { await patchDoc(`/users/${cred.user.uid}`, profile); } catch { /* rules may block; UX still works */ }
      return userFromFirebaseUser(cred.user, profile);
    },

    async signIn({ email, password }) {
      const { auth } = getFirebase();
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw new Error(fbAuthError(e, "Invalid email or password."));
      }
      const profile = await loadProfile(cred.user.uid);
      return userFromFirebaseUser(cred.user, profile);
    },

    async signOut() {
      const { auth } = getFirebase();
      await fbSignOut(auth);
    },

    async getCurrentUser() {
      const { auth } = getFirebase();
      const u = auth.currentUser || (await authReady(auth));
      if (!u) return null;
      const profile = await loadProfile(u.uid);
      return userFromFirebaseUser(u, profile);
    },

    onAuthChange(cb) {
      const { auth } = getFirebase();
      return onAuthStateChanged(auth, async (u) => {
        if (!u) return cb(null);
        const profile = await loadProfile(u.uid);
        cb(userFromFirebaseUser(u, profile));
      });
    },

    async upgradePlan(plan) {
      const { auth } = getFirebase();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in.");
      const d = await patchDoc(`/users/${u.uid}`, { plan });
      return userFromFirebaseUser(u, d ? fromFirestoreFields(d.fields) : { plan });
    },

    async updateProfile({ name, avatar }) {
      const { auth } = getFirebase();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in.");
      const patch = {};
      if (name !== undefined) {
        const displayName = (name || "").trim() || u.displayName || (u.email ? u.email.split("@")[0] : "User");
        patch.name = displayName;
        try { await fbUpdateProfile(u, { displayName }); } catch { /* non-fatal */ }
      }
      // A freshly uploaded logo is a data-URL — too big for an indexed Firestore
      // field, so store it in the blob store and keep only the short URL. null
      // removes it; an existing "/api/blob/..." URL passes through untouched.
      if (avatar !== undefined) {
        patch.avatar =
          typeof avatar === "string" && avatar.startsWith("data:")
            ? await putImageBlob(avatar)
            : avatar;
      }
      let profile = null;
      if (Object.keys(patch).length) {
        const d = await patchDoc(`/users/${u.uid}`, patch);
        profile = d ? fromFirestoreFields(d.fields) : null;
      }
      return userFromFirebaseUser(u, profile || (await loadProfile(u.uid)));
    },

    /* --- projects --- */
    async listProjects(userId) {
      // runQuery filters by owner; sort client-side (no composite index needed).
      const rows = await fs(":runQuery", {
        method: "POST",
        body: {
          structuredQuery: {
            from: [{ collectionId: "projects" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "userId" },
                op: "EQUAL",
                value: { stringValue: userId },
              },
            },
          },
        },
      });
      const projects = (rows || [])
        .filter((row) => row.document)
        .map((row) => restDocToProject(row.document.name, row.document.fields));
      const hydrated = await Promise.all(projects.map(hydrate));
      return hydrated.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async getProject(id) {
      const d = await fs(`/projects/${id}`);
      return d ? hydrate(restDocToProject(d.name, d.fields)) : null;
    },

    async createProject(userId, data) {
      const now = Date.now();
      const state = data.state || {};
      const fields = {
        userId,
        name: data.name || "Untitled project",
        createdAt: now,
        updatedAt: now,
        ...(await stateFields(state)),
      };
      const created = await fs(`/projects`, { method: "POST", body: { fields: toFirestoreFields(fields) } });
      return { id: created.name.split("/").pop(), userId, name: fields.name, state, createdAt: now, updatedAt: now };
    },

    async updateProject(id, patch) {
      const upd = { updatedAt: Date.now() };
      if (patch.name !== undefined) upd.name = patch.name;
      if (patch.state !== undefined) Object.assign(upd, await stateFields(patch.state));
      const d = await patchDoc(`/projects/${id}`, upd);
      return d ? hydrate(restDocToProject(d.name, d.fields)) : null;
    },

    async deleteProject(id) {
      // Best-effort: remove the state blob too, if any, before deleting the doc.
      try {
        const d = await fs(`/projects/${id}`);
        const blobUrl = d?.fields?.stateBlob?.stringValue;
        if (blobUrl) await deleteStateBlob(blobUrl);
      } catch { /* ignore */ }
      await fs(`/projects/${id}`, { method: "DELETE" });
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
