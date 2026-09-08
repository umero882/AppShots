/**
 * Set runtime environment variables on the AppShots app in Coolify.
 *
 * Env vars are the one part of this deployment that is not in the repo, so they
 * drift silently: `ALERT_EMAIL_TO` was never set on the app, which is why a
 * backup failure or a waitlist signup could have gone unreported for weeks with
 * nothing to notice. This makes setting one a command with a record, not a
 * remembered click.
 *
 * Zero deps — Node's fetch and nothing else.
 *
 *   node scripts/ops/coolify-set-env.mjs --dry-run ALERT_EMAIL_TO=you@example.com
 *   node scripts/ops/coolify-set-env.mjs ALERT_EMAIL_TO=you@example.com
 *   node scripts/ops/coolify-set-env.mjs --restart KEY=value KEY2=value2
 *
 * Env (put them in .env.local and run with `node --env-file=.env.local`):
 *   COOLIFY_URL        default https://coolify.nextechlabs.tech
 *   COOLIFY_API_TOKEN  Coolify → Keys & Tokens → API tokens (needs write scope)
 *   COOLIFY_APP_UUID   optional; otherwise the app is matched by COOLIFY_APP_NAME
 *   COOLIFY_APP_NAME   default "appshots"
 *
 * SAFETY: this account runs several products on one Coolify. The script refuses
 * to act unless exactly ONE application matches, prints which one it picked, and
 * never touches anything else. Values are masked in output. A change needs a
 * restart to take effect — that is opt-in via --restart, never implied.
 */
const BASE = (process.env.COOLIFY_URL || "https://coolify.nextechlabs.tech").replace(/\/+$/, "");
const TOKEN = process.env.COOLIFY_API_TOKEN || "";
const APP_NAME = process.env.COOLIFY_APP_NAME || "appshots";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const restart = args.includes("--restart");
const pairs = args.filter((a) => !a.startsWith("--"));

/** Show that a value was set without putting a secret in a terminal history. */
const mask = (v) => {
  const s = String(v);
  if (s.length <= 6) return "*".repeat(s.length);
  // An email is the common case here and is not a secret; keep it readable.
  if (s.includes("@") && !/[^\w.@+-]/.test(s)) return s;
  return `${s.slice(0, 3)}${"*".repeat(Math.max(3, s.length - 6))}${s.slice(-3)}`;
};

async function api(path, { method = "GET", body } = {}) {
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
async function resolveApp() {
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

async function main() {
  if (!TOKEN) throw new Error("COOLIFY_API_TOKEN is not set (Coolify → Keys & Tokens → API tokens).");
  if (!pairs.length) {
    console.error("usage: node scripts/ops/coolify-set-env.mjs [--dry-run] [--restart] KEY=value [KEY=value ...]");
    process.exit(2);
  }

  const wanted = pairs.map((p) => {
    const i = p.indexOf("=");
    if (i < 1) throw new Error(`not a KEY=value pair: ${p}`);
    return { key: p.slice(0, i), value: p.slice(i + 1) };
  });

  const app = await resolveApp();
  console.log(`app: ${app.name}${app.fqdn ? ` (${app.fqdn})` : ""} — ${app.uuid}`);

  const existingRaw = await api(`/api/v1/applications/${app.uuid}/envs`);
  const existing = Array.isArray(existingRaw) ? existingRaw : existingRaw?.data || [];
  const byKey = new Map(existing.map((e) => [e.key, e]));

  for (const { key, value } of wanted) {
    const current = byKey.get(key);
    const unchanged = current && String(current.value) === value;
    const verb = unchanged ? "unchanged" : current ? "update" : "create";
    console.log(`  ${verb.padEnd(9)} ${key} = ${mask(value)}${current && !unchanged ? ` (was ${mask(current.value)})` : ""}`);
    if (unchanged || dryRun) continue;

    const payload = { key, value, is_preview: false, is_build_time: false, is_literal: false };
    if (current) {
      await api(`/api/v1/applications/${app.uuid}/envs`, { method: "PATCH", body: payload });
    } else {
      await api(`/api/v1/applications/${app.uuid}/envs`, { method: "POST", body: payload });
    }
  }

  if (dryRun) {
    console.log("\ndry run — nothing was changed.");
    return;
  }

  if (restart) {
    console.log("\nrestarting so the new values are read…");
    await api(`/api/v1/applications/${app.uuid}/restart`, { method: "GET" });
    console.log("restart requested.");
  } else {
    // A running container holds the old environment. Saying this beats a silent
    // "it didn't work" an hour later.
    console.log("\nSet. The running container still has the OLD values — re-run with --restart, or redeploy in Coolify.");
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  if (e.status === 403 || e.status === 401) {
    console.error("If the token is right, this Coolify allowlists API access by IP and yours is dynamic — re-add it.");
  }
  process.exit(1);
});
