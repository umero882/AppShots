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
import { api, resolveApp, setEnvs, requireToken, explainAuthFailure } from "./coolify-lib.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const restart = args.includes("--restart");
const pairs = args.filter((a) => !a.startsWith("--"));

async function main() {
  requireToken();
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

  await setEnvs(app, wanted, { dryRun });

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
  explainAuthFailure(e);
  process.exit(1);
});
