/**
 * Self-sent password-reset emails.
 *
 * Firebase refuses to let this project customize its auth email templates or the
 * action URL (EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED), so instead of asking Firebase to
 * send the email we:
 *   1. ask Identity Toolkit for the reset *link* (returnOobLink) using a service
 *      account — this does NOT send anything;
 *   2. take the one-time oobCode from that link and point it at OUR branded page
 *      (/auth/action), which finishes the reset with the Firebase SDK;
 *   3. send a fully branded email through our own SMTP relay (server/smtp.js).
 *
 * Endpoint: POST /api/auth/password-reset { email } → { ok: true }
 * Always 200 for a well-formed address, whether or not an account exists, so the
 * form can't be used to enumerate accounts. Throws "not-configured" (→ 501) when
 * the service account or SMTP env is missing — the client then falls back to
 * Firebase's own (unbranded) email.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (JSON or base64 JSON), SMTP_HOST, SMTP_PORT,
 *      SMTP_USER, SMTP_PASS, EMAIL_FROM ("AppShots <noreply@…>"), APP_URL.
 */
import { parseServiceAccount, serviceAccountToken } from "./googleToken.js";
import { sendMail as smtpSend } from "./smtp.js";

const IDENTITY_TOOLKIT = "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode";
const SCOPE = "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const env = (k) => process.env[k] || "";

export function smtpConfig() {
  const port = Number(env("SMTP_PORT")) || 465;
  return {
    host: env("SMTP_HOST"),
    port,
    secure: env("SMTP_SECURE") ? env("SMTP_SECURE") !== "false" : port === 465,
    user: env("SMTP_USER"),
    pass: env("SMTP_PASS"),
    from: env("EMAIL_FROM") || (env("SMTP_USER") ? `AppShots <${env("SMTP_USER")}>` : ""),
    replyTo: env("EMAIL_REPLY_TO") || undefined,
  };
}

// Never derive this from the request: a caller-supplied origin would let an
// attacker mail victims a valid reset code that lands on their own site.
export const appUrl = () => (env("APP_URL") || "http://localhost:5173").replace(/\/$/, "");

export function passwordResetConfigured() {
  const smtp = smtpConfig();
  return !!(parseServiceAccount(env("FIREBASE_SERVICE_ACCOUNT")) && smtp.host && smtp.user && smtp.pass && smtp.from);
}

/* ------------------------------ rate limiting ------------------------------ */
// Per-address and global buckets; in-memory is fine for a single container.
const perEmail = new Map(); // email -> [timestamps]
let globalHits = [];
const WINDOW_MS = 15 * 60 * 1000;
const PER_EMAIL_MAX = 3;
const GLOBAL_MAX_PER_MIN = 30;

export function checkRateLimit(email, now = Date.now()) {
  globalHits = globalHits.filter((t) => now - t < 60_000);
  if (globalHits.length >= GLOBAL_MAX_PER_MIN) return false;
  const hits = (perEmail.get(email) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= PER_EMAIL_MAX) return false;
  hits.push(now);
  perEmail.set(email, hits);
  globalHits.push(now);
  return true;
}
export function _resetRateLimits() {
  perEmail.clear();
  globalHits = [];
}

/* --------------------------------- email --------------------------------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function renderResetEmail({ link, email, siteUrl = "https://appshots.nextechlabs.tech" }) {
  const subject = "Reset your AppShots password";
  const text = [
    "Reset your AppShots password",
    "",
    `We received a request to reset the password for your AppShots account (${email}).`,
    "Open this link to choose a new password:",
    link,
    "",
    "The link expires in about an hour. If you didn't ask for this, you can ignore this email — your password won't change.",
    "",
    `AppShots · by Next Tech Labs · ${siteUrl}`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f5fb;padding:32px 16px;font-family:-apple-system,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;color:#111827;">
    <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 24px;">App<span style="color:#6366f1;">Shots</span></p>
    <p style="font-size:22px;font-weight:700;line-height:1.3;margin:0 0 12px;color:#111827;">Reset your password</p>
    <p style="margin:0 0 20px;line-height:1.6;color:#374151;">We received a request to reset the password for your AppShots account (<strong>${esc(email)}</strong>). Click the button below to choose a new one.</p>
    <p style="margin:0 0 24px;"><a href="${esc(link)}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px;">Choose a new password</a></p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">This link expires in about an hour. If the button doesn't work, paste this into your browser:</p>
    <p style="margin:0 0 24px;font-size:12px;word-break:break-all;"><a href="${esc(link)}" style="color:#4f46e5;">${esc(link)}</a></p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">Didn't ask for this? You can safely ignore this email &mdash; your password won't change.</p>
    <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">AppShots &middot; by Next Tech Labs &middot; <a href="${esc(siteUrl)}" style="color:#6366f1;text-decoration:none;">${esc(siteUrl.replace(/^https?:\/\//, ""))}</a></p>
  </div>
</body></html>`;
  return { subject, text, html };
}

/** Turn Firebase's hosted-page link into a link to our branded /auth/action. */
export function brandedResetLink(oobLink, base) {
  const code = new URL(oobLink).searchParams.get("oobCode");
  if (!code) throw new Error("reset-link-failed");
  const u = new URL(`${base}/auth/action`);
  u.searchParams.set("mode", "resetPassword");
  u.searchParams.set("oobCode", code);
  u.searchParams.set("continueUrl", `${base}/login`);
  return u.toString();
}

/* -------------------------------- handler -------------------------------- */
export async function requestPasswordReset(
  { email } = {},
  { fetchImpl = fetch, sendMail = smtpSend, tokenFn = serviceAccountToken, now = Date.now } = {}
) {
  const addr = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) throw new Error("invalid-email");
  if (!passwordResetConfigured()) throw new Error("not-configured");
  if (!checkRateLimit(addr, now())) throw new Error("rate-limited");

  const sa = parseServiceAccount(env("FIREBASE_SERVICE_ACCOUNT"));
  const token = await tokenFn(sa, SCOPE, { fetchImpl });
  const base = appUrl();

  const res = await fetchImpl(IDENTITY_TOOLKIT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email: addr, returnOobLink: true, continueUrl: `${base}/login` }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || "";
    // Unknown address: say nothing (no account enumeration) and send nothing.
    if (/EMAIL_NOT_FOUND|USER_NOT_FOUND/.test(msg)) return { ok: true };
    throw new Error(`reset-link-failed: ${msg || res.status}`);
  }

  const link = brandedResetLink(json.oobLink, base);
  const { subject, text, html } = renderResetEmail({ link, email: addr, siteUrl: base });
  const smtp = smtpConfig();
  await sendMail({ ...smtp, to: addr, subject, text, html });
  return { ok: true };
}
