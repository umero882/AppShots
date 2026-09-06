/**
 * Waitlist for plans that are advertised but not built yet.
 *
 * The Team tier was on the pricing page — and purchasable — while none of what
 * it promised (seats, shared templates, roles) existed. Rather than sell it or
 * silently delete it, it collects intent, which is the number worth having
 * before building a multi-tenant feature.
 *
 * Entries are appended as JSONL on the persistent volume (so they ride along in
 * the nightly backup) and, best effort, emailed to the owner — demand nobody
 * reads is demand nobody acts on.
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "fs";
import path from "path";
import { verifyIdTokenClaims } from "./firebaseAuth.js";
import { sendMail } from "./smtp.js";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const WAITLIST_DIR = process.env.WAITLIST_DIR || path.join(DATA_DIR, "waitlist");
const PLANS = new Set(["team"]); // only what is actually advertised as coming
const MAX_PER_MINUTE = Number(process.env.WAITLIST_MAX_PER_MINUTE) || 20;

// Deliberately permissive: rejecting odd-but-valid addresses loses a signup,
// and nothing here trusts the address for anything security-relevant.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let windowStart = 0;
let count = 0;

const filePath = (plan) => path.join(WAITLIST_DIR, `${plan}.jsonl`);

/** Everyone already on the list for a plan (used to dedupe and to report). */
export function readWaitlist(plan) {
  try {
    return readFileSync(filePath(plan), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Add someone to a waitlist. Idempotent per email: signing up twice is a normal
 * thing for a person to do and must not look like an error.
 */
export async function joinWaitlist(body = {}, headers = {}, deps = {}) {
  const now = deps.now || Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    count = 0;
  }
  if (++count > MAX_PER_MINUTE) throw new Error("rate-limited");

  const plan = String(body.plan || "").toLowerCase();
  if (!PLANS.has(plan)) throw new Error("unknown-waitlist");

  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(email)) throw new Error("invalid-email");

  // Attach the account if they happen to be signed in; never require it, and
  // never take a uid from the body.
  let uid = null;
  try {
    const verify = deps.verifyIdTokenClaims || verifyIdTokenClaims;
    if (headers.authorization || headers.Authorization) {
      uid = (await verify(headers.authorization || headers.Authorization)).sub;
    }
  } catch {
    uid = null;
  }

  const existing = (deps.readWaitlist || readWaitlist)(plan);
  const already = existing.some((e) => e.email === email);
  // Fixed before the write: reading it afterwards depends on whether the reader
  // handed back a snapshot or a live view of the same storage.
  const position = existing.length + 1;
  if (!already) {
    const entry = {
      email,
      plan,
      uid,
      seats: Number.isFinite(Number(body.seats)) ? Math.min(999, Math.max(1, Number(body.seats))) : null,
      note: String(body.note || "").slice(0, 500) || null,
      at: new Date(now).toISOString(),
    };
    (deps.append || append)(plan, entry);
    (deps.notify || notify)(entry, position).catch(() => {});
  }

  return { ok: true, plan, already, position: already ? null : position };
}

function append(plan, entry) {
  if (!existsSync(WAITLIST_DIR)) mkdirSync(WAITLIST_DIR, { recursive: true });
  appendFileSync(filePath(plan), JSON.stringify(entry) + "\n");
}

/** Best effort: tell the owner. A failure here must not fail the signup. */
async function notify(entry, total) {
  const to = process.env.ALERT_EMAIL_TO || process.env.EMAIL_REPLY_TO;
  if (!to || !process.env.SMTP_HOST) return;
  await sendMail({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_SECURE || "") !== "false",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || `AppShots <${process.env.SMTP_USER}>`,
    to,
    subject: `Team waitlist: ${entry.email} (#${total})`,
    text: [
      `${entry.email} joined the ${entry.plan} waitlist.`,
      entry.seats ? `Seats wanted: ${entry.seats}` : null,
      entry.note ? `Note: ${entry.note}` : null,
      entry.uid ? `Signed in as: ${entry.uid}` : "Not signed in.",
      ``,
      `That makes ${total} on the list.`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

/** Test hook. */
export function _resetWaitlistBudget() {
  windowStart = 0;
  count = 0;
}
