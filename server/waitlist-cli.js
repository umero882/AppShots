/**
 * The other half of the waitlist: telling the people on it.
 *
 * /pricing promised "we'll email you when Team is ready" for months. Team is now
 * ready, and a promise nobody can execute is the same as one nobody made — so
 * the list, which until now could only be written, can also be read and mailed.
 *
 *   node server/waitlist-cli.js list [plan]                 who is on it
 *   node server/waitlist-cli.js export [plan] [file.csv]    dump it
 *   node server/waitlist-cli.js announce [plan] [--dry-run] [--limit n]
 *
 * `announce` is idempotent: every address it successfully mails is recorded in
 * <plan>.announced.json, so re-running after a partial failure picks up exactly
 * where it stopped rather than emailing the same people twice. --dry-run prints
 * the recipients and sends nothing.
 *
 * Env: WAITLIST_DIR (default DATA_DIR/waitlist), SMTP_*, EMAIL_FROM, PUBLIC_URL.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readWaitlist } from "./waitlist.js";
import { sendMail } from "./smtp.js";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const WAITLIST_DIR = process.env.WAITLIST_DIR || path.join(DATA_DIR, "waitlist");
const APP_URL = (process.env.PUBLIC_URL || "https://appshots.nextechlabs.tech").replace(/\/+$/, "");

const sentPath = (plan) => path.join(WAITLIST_DIR, `${plan}.announced.json`);

/**
 * Domains reserved by RFC 2606 / RFC 6761 — they cannot receive mail, ever.
 *
 * A public signup form collects test entries: someone trying the form, a
 * monitoring probe, a developer checking the endpoint answers. Mailing them
 * bounces, and enough bounces is how a sending domain earns a spam reputation.
 * Cheaper to never send than to explain the bounce rate afterwards.
 */
const UNDELIVERABLE = /(^|\.)(invalid|test|example|localhost)$|(^|\.)example\.(com|net|org)$/i;

/** Is this an address that could actually receive the announcement? */
export function isDeliverable(email) {
  const domain = String(email || "").split("@")[1] || "";
  return !!domain && !UNDELIVERABLE.test(domain);
}

/** Addresses already told about this plan. Missing file means nobody yet. */
export function readAnnounced(plan) {
  try {
    const parsed = JSON.parse(readFileSync(sentPath(plan), "utf8"));
    return new Set(Array.isArray(parsed) ? parsed : parsed.sent || []);
  } catch {
    return new Set();
  }
}

function writeAnnounced(plan, set) {
  if (!existsSync(WAITLIST_DIR)) mkdirSync(WAITLIST_DIR, { recursive: true });
  writeFileSync(sentPath(plan), JSON.stringify({ sent: [...set], updatedAt: new Date().toISOString() }, null, 2));
}

/**
 * Who still needs telling — deduplicated, and skipping anyone already mailed.
 * Exported so the "who would this email?" question has an answer that does not
 * involve running the thing that sends email.
 */
export function pendingRecipients(plan, { entries = readWaitlist(plan), announced = readAnnounced(plan) } = {}) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const email = String(entry?.email || "").trim().toLowerCase();
    if (!email || seen.has(email) || announced.has(email)) continue;
    if (!isDeliverable(email)) continue;
    seen.add(email);
    out.push({ email, at: entry.at, uid: entry.uid || null });
  }
  return out;
}

/** The launch email. Plain text, because that is what the invite emails are. */
export function announcementFor(plan) {
  if (plan !== "team") {
    return {
      subject: `AppShots: ${plan} is available`,
      text: `The ${plan} plan you asked about is now available: ${APP_URL}/pricing\n\n— AppShots`,
    };
  }
  return {
    subject: "AppShots Team is ready",
    text: [
      "You asked to hear when AppShots Team was ready. It is.",
      "",
      "One subscription, five seats, one workspace:",
      "  · a shared project library everyone on the team can open and edit",
      "  · shared templates, so a house style is one click and not a screenshot in Slack",
      "  · a brand kit — your colours, fonts and logo, in the editor",
      "  · roles, so it is clear who can change what",
      "  · watermark-free, full-resolution exports for all five seats",
      "",
      `Start here: ${APP_URL}/pricing`,
      "",
      "Invite your team by email once you're in — their seats cost nothing extra.",
      "",
      "You're getting this because you joined the Team waitlist on appshots.nextechlabs.tech.",
      "It's the only email that list was for, and you won't hear from it again.",
      "",
      "— AppShots",
    ].join("\n"),
  };
}

const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER);

function mailer() {
  return (to, subject, text) =>
    sendMail({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (process.env.SMTP_SECURE || "") !== "false",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM || `AppShots <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
    });
}

export function list(plan = "team", { log = console.log } = {}) {
  const entries = readWaitlist(plan);
  const announced = readAnnounced(plan);
  const undeliverable = entries.filter((e) => !isDeliverable(e.email)).length;
  log(
    `${entries.length} on the ${plan} waitlist · ${announced.size} already told` +
      (undeliverable ? ` · ${undeliverable} undeliverable (skipped)` : ""),
  );
  for (const e of entries) {
    const notes = [
      announced.has(e.email) ? "announced" : null,
      isDeliverable(e.email) ? null : "undeliverable — will not be mailed",
      e.seats ? `seats:${e.seats}` : null,
    ].filter(Boolean);
    log(`  ${e.at || "?"}  ${e.email}${notes.length ? `  (${notes.join(", ")})` : ""}`);
  }
  return entries.length;
}

export function exportCsv(plan = "team", file, { log = console.log } = {}) {
  const rows = readWaitlist(plan);
  // Quote everything: an address is user input, and a stray comma would shift
  // every column after it.
  const csv = ["email,joined_at,uid,seats,note"]
    .concat(rows.map((r) => [r.email, r.at, r.uid, r.seats, r.note].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")))
    .join("\n");
  const out = file || path.join(process.cwd(), `${plan}-waitlist.csv`);
  writeFileSync(out, csv);
  log(`wrote ${rows.length} row(s) → ${out}`);
  return out;
}

export async function announce(plan = "team", { dryRun = false, limit = 0, log = console.log, send } = {}) {
  const recipients = pendingRecipients(plan);
  const targets = limit > 0 ? recipients.slice(0, limit) : recipients;
  const { subject, text } = announcementFor(plan);

  log(`${plan}: ${recipients.length} still to tell${limit > 0 ? ` (sending ${targets.length})` : ""}`);
  if (dryRun) {
    for (const r of targets) log(`  would email ${r.email}`);
    return { sent: 0, failed: 0, pending: targets.length, dryRun: true };
  }
  const deliver = send || mailer();
  if (!send && !smtpConfigured()) throw new Error("smtp-not-configured");

  const announced = readAnnounced(plan);
  let sent = 0;
  let failed = 0;
  for (const r of targets) {
    try {
      await deliver(r.email, subject, text);
      announced.add(r.email);
      sent++;
      // Persisted per address, not at the end: a crash halfway through must not
      // re-mail everyone who already received it.
      writeAnnounced(plan, announced);
      log(`  sent ${r.email}`);
    } catch (e) {
      failed++;
      log(`  FAILED ${r.email}: ${e.message}`);
    }
  }
  log(`done: ${sent} sent, ${failed} failed`);
  return { sent, failed, pending: targets.length - sent - failed };
}

/* --------------------------------- CLI ---------------------------------- */
const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = rest.filter((a) => a.startsWith("--"));
  const args = rest.filter((a) => !a.startsWith("--"));
  const plan = args[0] || "team";
  const limitFlag = rest.indexOf("--limit");
  const limit = limitFlag >= 0 ? Number(rest[limitFlag + 1]) || 0 : 0;

  const run = {
    list: async () => list(plan),
    export: async () => exportCsv(plan, args[1]),
    announce: () => announce(plan, { dryRun: flags.includes("--dry-run"), limit }),
  }[cmd];

  if (!run) {
    console.error("usage: node server/waitlist-cli.js <list|export|announce> [plan] [--dry-run] [--limit n]");
    process.exit(2);
  }
  run().catch((e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
  });
}
