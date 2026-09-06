import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  requestPasswordReset,
  sendVerificationEmail,
  renderResetEmail,
  renderVerifyEmail,
  brandedResetLink,
  brandedActionLink,
  checkRateLimit,
  passwordResetConfigured,
  _resetRateLimits,
} from "./authEmail.js";

const SA = JSON.stringify({ client_email: "m@p.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n" });
const ENV = {
  FIREBASE_SERVICE_ACCOUNT: SA,
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "465",
  SMTP_USER: "noreply@nextechlabs.tech",
  SMTP_PASS: "pw",
  EMAIL_FROM: "AppShots <noreply@nextechlabs.tech>",
  APP_URL: "https://appshots.nextechlabs.tech",
};
const FIREBASE_LINK =
  "https://appshots-76a56.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC123&apiKey=k&continueUrl=https%3A%2F%2Fappshots.nextechlabs.tech%2Flogin&lang=en";

const saved = {};
beforeEach(() => {
  for (const k of Object.keys(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = ENV[k];
  }
  _resetRateLimits();
});
afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("brandedResetLink", () => {
  it("re-targets Firebase's oobCode at our /auth/action page", () => {
    const link = brandedResetLink(FIREBASE_LINK, "https://appshots.nextechlabs.tech");
    const u = new URL(link);
    expect(u.origin + u.pathname).toBe("https://appshots.nextechlabs.tech/auth/action");
    expect(u.searchParams.get("mode")).toBe("resetPassword");
    expect(u.searchParams.get("oobCode")).toBe("ABC123");
    expect(u.searchParams.get("continueUrl")).toBe("https://appshots.nextechlabs.tech/login");
    expect(link).not.toContain("apiKey"); // the public key isn't needed by our page
  });

  it("rejects a link without a code", () => {
    expect(() => brandedResetLink("https://x.test/?mode=resetPassword", "https://a.test")).toThrow(/reset-link-failed/);
  });
});

describe("renderResetEmail", () => {
  it("brands the email and escapes user-controlled values", () => {
    const { subject, text, html } = renderResetEmail({ link: "https://a.test/auth/action?oobCode=1&x=<y>", email: "a<b>@x.com" });
    expect(subject).toBe("Reset your AppShots password");
    expect(html).toContain("App<span");
    expect(html).toContain("Next Tech Labs");
    expect(html).toContain("a&lt;b&gt;@x.com");
    expect(html).toContain("oobCode=1&amp;x=&lt;y&gt;");
    expect(text).toContain("https://a.test/auth/action?oobCode=1&x=<y>");
  });
});

describe("checkRateLimit", () => {
  it("allows 3 per address per 15 minutes, then blocks", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("a@x.com", t0)).toBe(true);
    expect(checkRateLimit("a@x.com", t0 + 1)).toBe(true);
    expect(checkRateLimit("a@x.com", t0 + 2)).toBe(true);
    expect(checkRateLimit("a@x.com", t0 + 3)).toBe(false);
    expect(checkRateLimit("b@x.com", t0 + 3)).toBe(true);
    expect(checkRateLimit("a@x.com", t0 + 16 * 60 * 1000)).toBe(true);
  });
});

describe("sendVerificationEmail", () => {
  const okToken = async () => "tok";
  const VERIFY_LINK = FIREBASE_LINK.replace("mode=resetPassword", "mode=verifyEmail").replace("ABC123", "VER456");
  const claimsFor = (c) => async (header) => {
    if (!header) throw new Error("missing");
    return c;
  };

  it("rejects requests without a valid Firebase ID token", async () => {
    await expect(sendVerificationEmail({}, { verify: claimsFor({}) })).rejects.toThrow(/unauthorized/);
  });

  it("is a no-op for already-verified addresses", async () => {
    const out = await sendVerificationEmail({ authorization: "Bearer t" }, { verify: claimsFor({ email: "a@x.com", email_verified: true }) });
    expect(out).toEqual({ ok: true, alreadyVerified: true });
  });

  it("mints a VERIFY_EMAIL link for the token's email and sends the branded email", async () => {
    const sent = [];
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ requestType: "VERIFY_EMAIL", email: "new@x.com", returnOobLink: true });
      return { ok: true, json: async () => ({ oobLink: VERIFY_LINK }) };
    };
    const out = await sendVerificationEmail(
      { authorization: "Bearer t" },
      { fetchImpl, sendMail: async (m) => sent.push(m), tokenFn: okToken, verify: claimsFor({ email: "New@X.com", email_verified: false }) }
    );
    expect(out).toEqual({ ok: true, alreadyVerified: false });
    expect(sent[0].to).toBe("new@x.com");
    expect(sent[0].subject).toBe("Verify your AppShots email");
    expect(sent[0].html).toContain("https://appshots.nextechlabs.tech/auth/action?mode=verifyEmail&amp;oobCode=VER456");
    expect(sent[0].html).toContain("continueUrl=https%3A%2F%2Fappshots.nextechlabs.tech%2Fdashboard");
  });

  it("brandedActionLink keeps the mode and routes verify links to the dashboard", () => {
    const u = new URL(brandedActionLink(VERIFY_LINK, "https://a.test", "verifyEmail"));
    expect(u.pathname).toBe("/auth/action");
    expect(u.searchParams.get("mode")).toBe("verifyEmail");
    expect(u.searchParams.get("oobCode")).toBe("VER456");
    expect(u.searchParams.get("continueUrl")).toBe("https://a.test/dashboard");
    expect(renderVerifyEmail({ link: "https://a.test/x", email: "a@x.com" }).text).toContain("https://a.test/x");
  });
});

describe("requestPasswordReset", () => {
  const okToken = async () => "tok";

  it("reports not-configured when SMTP or the service account is missing", async () => {
    delete process.env.SMTP_PASS;
    expect(passwordResetConfigured()).toBe(false);
    await expect(requestPasswordReset({ email: "a@x.com" })).rejects.toThrow(/not-configured/);
  });

  it("rejects malformed addresses before touching Google", async () => {
    await expect(requestPasswordReset({ email: "nope" })).rejects.toThrow(/invalid-email/);
  });

  it("mints a link, rewrites it to /auth/action, and sends the branded email", async () => {
    const sent = [];
    const fetchImpl = async (url, init) => {
      expect(url).toContain("accounts:sendOobCode");
      expect(init.headers.Authorization).toBe("Bearer tok");
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ requestType: "PASSWORD_RESET", email: "user@x.com", returnOobLink: true });
      return { ok: true, json: async () => ({ email: "user@x.com", oobLink: FIREBASE_LINK }) };
    };
    const sendMail = async (m) => sent.push(m);
    const out = await requestPasswordReset({ email: "  User@X.com " }, { fetchImpl, sendMail, tokenFn: okToken });
    expect(out).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ host: "smtp.example.com", port: 465, secure: true, user: "noreply@nextechlabs.tech", to: "user@x.com", from: "AppShots <noreply@nextechlabs.tech>" });
    expect(sent[0].html).toContain("https://appshots.nextechlabs.tech/auth/action?mode=resetPassword&amp;oobCode=ABC123");
  });

  it("stays silent for unknown addresses (no enumeration) and sends nothing", async () => {
    const sent = [];
    const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "EMAIL_NOT_FOUND" } }) });
    const out = await requestPasswordReset({ email: "ghost@x.com" }, { fetchImpl, sendMail: async (m) => sent.push(m), tokenFn: okToken });
    expect(out).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });

  it("surfaces other Identity Toolkit errors", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "PERMISSION_DENIED" } }) });
    await expect(requestPasswordReset({ email: "a@x.com" }, { fetchImpl, sendMail: async () => {}, tokenFn: okToken })).rejects.toThrow(/reset-link-failed: PERMISSION_DENIED/);
  });

  it("rate-limits repeated requests for one address", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ oobLink: FIREBASE_LINK }) });
    const deps = { fetchImpl, sendMail: async () => {}, tokenFn: okToken };
    for (let i = 0; i < 3; i++) await requestPasswordReset({ email: "a@x.com" }, deps);
    await expect(requestPasswordReset({ email: "a@x.com" }, deps)).rejects.toThrow(/rate-limited/);
  });
});
