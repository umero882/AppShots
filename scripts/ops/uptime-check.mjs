/**
 * External uptime check for AppShots.
 *
 *   node --env-file=<smtp env> scripts/ops/uptime-check.mjs [--url https://…] [--verbose]
 *
 * Run it from somewhere that is NOT the app's own server — a monitor that dies
 * with the thing it monitors reports nothing. It hits the endpoints a real user
 * depends on, and emails through the same Hostinger mailbox the app already uses,
 * so it needs no third-party monitoring account.
 *
 * It alerts on *transitions*, not on every failure: one mail when the site goes
 * down and one when it comes back. An alert that arrives every five minutes gets
 * filtered, and then it is not an alert any more.
 *
 * Exit code 0 = up, 1 = down, so any scheduler (cron, Task Scheduler, a Coolify
 * scheduled task on another server) can act on it too.
 *
 * Required env: SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM, ALERT_EMAIL_TO.
 * Optional: UPTIME_URL, UPTIME_STATE_FILE, UPTIME_FAILURES_BEFORE_ALERT (2),
 *           UPTIME_TIMEOUT_MS (10000).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { sendMail } from "../../server/smtp.js";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : dflt;
};
const VERBOSE = process.argv.includes("--verbose");
const BASE = (arg("url", process.env.UPTIME_URL || "https://appshots.nextechlabs.tech")).replace(/\/+$/, "");
const STATE_FILE =
  process.env.UPTIME_STATE_FILE || path.join(os.tmpdir(), `appshots-uptime-${Buffer.from(BASE).toString("hex").slice(0, 12)}.json`);
const FAILURES_BEFORE_ALERT = Number(process.env.UPTIME_FAILURES_BEFORE_ALERT) || 2;
const TIMEOUT_MS = Number(process.env.UPTIME_TIMEOUT_MS) || 10_000;

/**
 * What "up" means. Each probe asserts something a user would notice losing —
 * including that the API gate still answers, because an API that started
 * serving AI calls to anonymous callers is an outage of a different kind.
 */
const PROBES = [
  { name: "liveness", path: "/healthz", check: (r, body) => r.status === 200 && body.trim() === "ok" },
  {
    name: "readiness",
    path: "/readyz",
    check: (r, body) => {
      if (r.status !== 200) return false;
      try {
        return JSON.parse(body).ready === true;
      } catch {
        return false;
      }
    },
  },
  { name: "app shell", path: "/", check: (r, body) => r.status === 200 && body.includes("<title>") },
  {
    name: "api gate",
    path: "/api/ai/suggest",
    method: "POST",
    check: (r) => r.status === 401,
  },
];

async function probe(p) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + p.path, {
      method: p.method || "GET",
      headers: p.method === "POST" ? { "content-type": "application/json" } : {},
      body: p.method === "POST" ? "{}" : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const body = await res.text();
    const ok = p.check(res, body);
    return { name: p.name, ok, status: res.status, ms: Date.now() - started, detail: ok ? "" : `unexpected ${res.status}` };
  } catch (e) {
    return { name: p.name, ok: false, status: 0, ms: Date.now() - started, detail: e.name === "AbortError" ? "timed out" : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { down: false, consecutiveFailures: 0, since: null };
  }
}

function writeState(state) {
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (e) {
    console.error("could not persist state:", e.message);
  }
}

async function alert(subject, lines) {
  const to = process.env.ALERT_EMAIL_TO;
  if (!to || !process.env.SMTP_HOST) {
    console.error("ALERT (not emailed — SMTP/ALERT_EMAIL_TO not set):", subject);
    return;
  }
  const text = lines.join("\n");
  try {
    await sendMail({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (process.env.SMTP_SECURE || "") !== "false",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM || `AppShots monitor <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html: `<pre style="font:13px ui-monospace,monospace">${text.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</pre>`,
    });
    console.log("alert emailed to", to);
  } catch (e) {
    console.error("alert email FAILED:", e.message);
  }
}

export async function runCheck() {
  const results = await Promise.all(PROBES.map(probe));
  const failed = results.filter((r) => !r.ok);
  const state = readState();
  const now = new Date().toISOString();

  if (VERBOSE || failed.length) {
    for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name.padEnd(10)} ${String(r.status).padStart(3)} ${r.ms}ms ${r.detail}`);
  }

  if (failed.length) {
    const consecutive = state.consecutiveFailures + 1;
    // One bad response is usually a redeploy, not an outage.
    if (!state.down && consecutive >= FAILURES_BEFORE_ALERT) {
      await alert(`AppShots is DOWN (${failed.map((f) => f.name).join(", ")})`, [
        `${BASE} failed ${consecutive} checks in a row.`,
        "",
        ...results.map((r) => `${r.ok ? "ok  " : "FAIL"} ${r.name} — HTTP ${r.status} in ${r.ms}ms ${r.detail}`),
        "",
        `First seen: ${now}`,
      ]);
      writeState({ down: true, consecutiveFailures: consecutive, since: now });
    } else {
      writeState({ ...state, consecutiveFailures: consecutive });
    }
    console.log(`DOWN (${consecutive} consecutive failures)`);
    return 1;
  }

  if (state.down) {
    await alert("AppShots is back UP", [
      `${BASE} is answering normally again.`,
      `Down since: ${state.since}`,
      `Recovered:  ${now}`,
      "",
      ...results.map((r) => `ok   ${r.name} — HTTP ${r.status} in ${r.ms}ms`),
    ]);
  }
  writeState({ down: false, consecutiveFailures: 0, since: null });
  console.log(`UP (${results.map((r) => `${r.name} ${r.ms}ms`).join(", ")})`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) process.exit(await runCheck());
