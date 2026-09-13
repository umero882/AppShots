import { describe, it, expect } from "vitest";
import { canonicalRedirect, bareHost } from "./canonicalHost.js";

const NEW = "appshotspreview.com";
const req = (over = {}) => ({ method: "GET", host: "appshots.nextechlabs.tech", url: "/pricing?ref=x", ...over });

describe("bareHost", () => {
  it("drops the port and case, keeps an IPv6 literal's brackets", () => {
    expect(bareHost("AppShotsPreview.com:443")).toBe(NEW);
    expect(bareHost(" example.com ")).toBe("example.com");
    expect(bareHost("[::1]:3000")).toBe("[::1]");
    expect(bareHost(undefined)).toBe("");
  });
});

describe("canonicalRedirect", () => {
  it("sends the old host to the same path and query on the canonical one", () => {
    expect(canonicalRedirect(req(), NEW)).toBe(`https://${NEW}/pricing?ref=x`);
    expect(canonicalRedirect(req({ url: "/" }), NEW)).toBe(`https://${NEW}/`);
  });

  it("collapses www onto the bare domain", () => {
    expect(canonicalRedirect(req({ host: `www.${NEW}` }), NEW)).toBe(`https://${NEW}/pricing?ref=x`);
  });

  it("serves the canonical host itself, whatever the port or case", () => {
    expect(canonicalRedirect(req({ host: NEW }), NEW)).toBeNull();
    expect(canonicalRedirect(req({ host: `${NEW.toUpperCase()}:443` }), NEW)).toBeNull();
  });

  it("is off when CANONICAL_HOST is unset (local dev, tests)", () => {
    expect(canonicalRedirect(req(), "")).toBeNull();
    expect(canonicalRedirect(req(), undefined)).toBeNull();
  });

  it("never redirects a POST — Stripe counts a 301 as a failed webhook delivery", () => {
    expect(canonicalRedirect(req({ method: "POST", url: "/api/stripe/webhook" }), NEW)).toBeNull();
    expect(canonicalRedirect(req({ method: "POST", url: "/pricing" }), NEW)).toBeNull();
  });

  it("leaves the API and the health checks alone", () => {
    expect(canonicalRedirect(req({ url: "/api/capabilities" }), NEW)).toBeNull();
    expect(canonicalRedirect(req({ url: "/healthz" }), NEW)).toBeNull();
    expect(canonicalRedirect(req({ url: "/readyz?deep=1" }), NEW)).toBeNull();
  });

  it("ignores localhost and IP literals (Docker health check, someone on the box)", () => {
    for (const host of ["localhost:3000", "127.0.0.1", "[::1]:3000", "76.13.240.144:3000"]) {
      expect(canonicalRedirect(req({ host }), NEW), host).toBeNull();
    }
  });

  it("ignores a request with no Host header at all", () => {
    expect(canonicalRedirect(req({ host: undefined }), NEW)).toBeNull();
  });

  it("HEAD redirects like GET", () => {
    expect(canonicalRedirect(req({ method: "HEAD" }), NEW)).toBe(`https://${NEW}/pricing?ref=x`);
  });
});
