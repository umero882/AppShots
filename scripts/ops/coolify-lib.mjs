/**
 * Shared plumbing for the Coolify ops scripts: the API call, "which app is
 * ours", env-var upserts and value masking. Zero deps — Node's fetch only.
 *
 * Env (put them in .env.local and run with `node --env-file=.env.local`):
 *   COOLIFY_URL        default https://coolify.nextechlabs.tech
 *   COOLIFY_API_TOKEN  Coolify → Keys & Tokens → API tokens (needs write scope)
 *   COOLIFY_APP_UUID   optional; otherwise the app is matched by COOLIFY_APP_NAME
 *   COOLIFY_APP_NAME   default "appshots"
 *
 * SAFETY: this account runs several products on one Coolify. resolveApp()
 * refuses to act unless exactly ONE application matches, and every script
 * prints which one it picked before touching it.
 */
export const BASE = (process.env.COOLIFY_URL || "https://coolify.nextechlabs.tech").replace(/\/+$/, "");
export const TOKEN = process.env.COOLIFY_API_TOKEN || "";
export const APP_NAME = process.env.COOLIFY_APP_NAME || "appshots";

/** Show that a value was set without putting a secret in a terminal history. */
export const mask = (v) => {
  const s = String(v);
  if (s.length <= 6) return "*".repeat(s.length);
  // An email or a URL is the common case here and is not a secret; keep it readable.
  if ((s.includes("@") && !/[^\w.@+-]/.test(s)) || /^https?:\/\/[\w.-]+\/?$/.test(s)) return s;
  return `${s.slice(0, 3)}${"*".repeat(Math.max(3, s.length - 6))}${s.slice(-3)}`;
};

export function requireToken() {
  if (!TOKEN) throw new Error("COOLIFY_API_TOKEN is not set (Coolify → Keys & Tokens → API tokens).");
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* Coolify answers HTML when the token or the path is wrong */
  }
  if (!res.ok) {
    const detail = json?.message || json?.error || text.slice(0, 200);
    const err = new Error(`coolify ${method} ${path} -> ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** The one application to act on, or a refusal. Never a guess. */
export async function resolveApp() {
  if (process.env.COOLIFY_APP_UUID) {
    const app = await api(`/api/v1/applications/${process.env.COOLIFY_APP_UUID}`);
    return { uuid: process.env.COOLIFY_APP_UUID, name: app?.name || "(unnamed)", fqdn: app?.fqdn || "" };
  }
  const apps = await api("/api/v1/applications");
  const list = Array.isArray(apps) ? apps : apps?.data || [];
  const needle = APP_NAME.toLowerCase();
  const hits = list.filter(
    (a) => String(a.name || "").toLowerCase().includes(needle) || String(a.fqdn || "").toLowerCase().includes(needle),
  );
  if (hits.length === 0) {
    throw new Error(
      `no application matching "${APP_NAME}". Found: ${list.map((a) => a.name).join(", ") || "(none)"}. ` +
        `Set COOLIFY_APP_UUID to be explicit.`,
    );
  }
  if (hits.length > 1) {
    // Several products share this Coolify. Picking one would be a coin toss with
    // another product's environment as the downside.
    throw new Error(
      `"${APP_NAME}" matches ${hits.length} applications: ${hits.map((a) => `${a.name} (${a.uuid})`).join(", ")}. ` +
        `Set COOLIFY_APP_UUID to choose.`,
    );
  }
  return { uuid: hits[0].uuid, name: hits[0].name, fqdn: hits[0].fqdn || "" };
}

/**
 * Upsert runtime env vars on an app. Prints each one (masked) with what it was.
 * Returns how many actually changed; with dryRun nothing is written.
 */
export async function setEnvs(app, wanted, { dryRun = false } = {}) {
  const existingRaw = await api(`/api/v1/applications/${app.uuid}/envs`);
  const existing = Array.isArray(existingRaw) ? existingRaw : existingRaw?.data || [];
  const byKey = new Map(existing.map((e) => [e.key, e]));
  let changed = 0;
  for (const { key, value } of wanted) {
    const current = byKey.get(key);
    const unchanged = current && String(current.value) === value;
    const verb = unchanged ? "unchanged" : current ? "update" : "create";
    console.log(`  ${verb.padEnd(9)} ${key} = ${mask(value)}${current && !unchanged ? ` (was ${mask(current.value)})` : ""}`);
    if (unchanged || dryRun) continue;
    // Runtime-only and literal, said explicitly: a PATCH without flags resets
    // them to Coolify's defaults, which include is_buildtime=true — and a
    // build-time variable is a Docker build arg, i.e. a secret in the image
    // history. (The field is is_buildtime; is_build_time is rejected with 422.)
    const payload = { key, value, is_preview: false, is_buildtime: false, is_literal: true, is_multiline: false, is_shown_once: false };
    if (current) {
      await api(`/api/v1/applications/${app.uuid}/envs`, { method: "PATCH", body: payload });
    } else {
      await api(`/api/v1/applications/${app.uuid}/envs`, { method: "POST", body: payload });
    }
    changed++;
  }
  return changed;
}

export function explainAuthFailure(e) {
  if (e.status === 403 || e.status === 401) {
    console.error(
      "If the token is right, check Coolify's API IP allowlist (Settings → API) — this machine's address may have changed.",
    );
  }
}
