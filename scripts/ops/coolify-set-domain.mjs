/**
 * Move the AppShots app to a new domain in Coolify — the deploy-side half of a
 * domain change. The repo side (canonical tags, sitemap, emails, legal pages)
 * is a code change; this is the part that only lives in Coolify.
 *
 * What it does, in order:
 *   1. checks every hostname resolves to the server the app is on (Traefik asks
 *      Let's Encrypt for a certificate the moment a domain is added; a domain
 *      still pointing at the registrar's parking page fails that and keeps
 *      retrying, so DNS has to be done first — or pass --skip-dns-check);
 *   2. sets the app's domains to the list you give, FIRST ONE CANONICAL — keep
 *      the old domain in the list, it must keep answering so the server can
 *      301 it to the new one;
 *   3. sets APP_URL (Stripe return URLs, auth-email links) and CANONICAL_HOST
 *      (the 301 in server/canonicalHost.js) from that first domain;
 *   4. with --deploy, redeploys so Traefik picks the new labels up. A domain
 *      change is not read by a restart — it needs a deploy.
 *
 *   node --env-file=.env.local scripts/ops/coolify-set-domain.mjs --dry-run \
 *     https://appshotspreview.com https://www.appshotspreview.com https://appshots.nextechlabs.tech
 *   node --env-file=.env.local scripts/ops/coolify-set-domain.mjs --deploy \
 *     https://appshotspreview.com https://www.appshotspreview.com https://appshots.nextechlabs.tech
 *
 * Same env and the same one-app-or-refuse rule as coolify-set-env.mjs.
 */
import dns from "node:dns/promises";
import { api, resolveApp, setEnvs, requireToken, explainAuthFailure } from "./coolify-lib.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const deploy = args.includes("--deploy");
const skipDns = args.includes("--skip-dns-check");
const domains = args.filter((a) => !a.startsWith("--"));

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error(`not a URL: ${url} (write it as https://example.com)`);
  }
}

async function addressesOf(host) {
  try {
    const recs = await dns.lookup(host, { all: true });
    return recs.map((r) => r.address);
  } catch {
    return [];
  }
}

async function main() {
  requireToken();
  if (!domains.length) {
    console.error(
      "usage: node scripts/ops/coolify-set-domain.mjs [--dry-run] [--deploy] [--skip-dns-check] https://canonical.example [https://www.canonical.example ...] [https://old.example]",
    );
    process.exit(2);
  }
  for (const d of domains) {
    if (!/^https:\/\//i.test(d)) throw new Error(`${d}: use https:// — Coolify's Traefik issues the certificate, plain http never sees a visitor`);
  }
  const hosts = domains.map(hostOf);
  const canonical = hosts[0];

  const app = await resolveApp();
  console.log(`app: ${app.name} — ${app.uuid}`);
  console.log(`  domains now: ${app.fqdn || "(none)"}`);
  console.log(`  domains new: ${domains.join(",")}`);
  console.log(`  canonical:   ${canonical}`);

  // Where does the app live? The hostname it serves today tells us.
  const currentHost = (app.fqdn || "").split(",").map((s) => s.trim()).filter(Boolean).map(hostOf)[0];
  const serverIps = currentHost ? await addressesOf(currentHost) : [];
  if (!skipDns) {
    if (!serverIps.length) {
      throw new Error(`cannot tell which server the app is on (no current domain resolves); re-run with --skip-dns-check if you are sure of the DNS`);
    }
    console.log(`\nDNS (server is ${serverIps.join(" / ")}):`);
    const bad = [];
    for (const h of hosts) {
      const ips = await addressesOf(h);
      const ok = ips.some((ip) => serverIps.includes(ip));
      console.log(`  ${ok ? "ok  " : "MISS"} ${h} -> ${ips.join(", ") || "(does not resolve)"}`);
      if (!ok) bad.push(h);
    }
    if (bad.length) {
      throw new Error(
        `${bad.join(", ")} does not point at the server yet. Add an A record -> ${serverIps[0]} at the registrar, wait for it to resolve, then re-run. ` +
          `(--skip-dns-check overrides; the certificate will fail until DNS is right.)`,
      );
    }
  }

  console.log("\nenv:");
  const wanted = [
    { key: "APP_URL", value: `https://${canonical}` },
    { key: "CANONICAL_HOST", value: canonical },
  ];
  await setEnvs(app, wanted, { dryRun });

  if (dryRun) {
    console.log("\ndry run — nothing was changed.");
    return;
  }

  await api(`/api/v1/applications/${app.uuid}`, { method: "PATCH", body: { domains: domains.join(",") } });
  console.log("\ndomains set.");

  if (deploy) {
    console.log("deploying so Traefik picks up the new domains…");
    const out = await api(`/api/v1/deploy?uuid=${encodeURIComponent(app.uuid)}&force=false`);
    const id = out?.deployments?.[0]?.deployment_uuid || out?.deployment_uuid || "";
    console.log(`deploy requested${id ? ` (${id})` : ""}. Watch it in Coolify; the certificate for a new domain arrives a minute or two after.`);
  } else {
    console.log("\nNot deployed. A domain change is only read by a deploy: re-run with --deploy, or click Redeploy in Coolify.");
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  explainAuthFailure(e);
  process.exit(1);
});
