import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createSign } from "crypto";
import { verifyIdTokenWithCerts } from "./firebaseAuth.js";

const PROJECT = "appshots-76a56";
const ISS = `https://securetoken.google.com/${PROJECT}`;

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function makeToken(overrides, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: "k1", typ: "JWT", ...(overrides.header || {}) };
  const payload = { aud: PROJECT, iss: ISS, sub: "uid-1", iat: now, exp: now + 3600, ...(overrides.payload || {}) };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(head + "." + body);
  return `${head}.${body}.${b64url(signer.sign(privateKey))}`;
}

describe("verifyIdTokenWithCerts", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const certs = { k1: publicKey };

  it("accepts a valid token and returns the uid", () => {
    expect(verifyIdTokenWithCerts(makeToken({}, privateKey), certs)).toBe("uid-1");
  });
  it("rejects a wrong audience (another project's token)", () => {
    expect(() => verifyIdTokenWithCerts(makeToken({ payload: { aud: "other-project" } }, privateKey), certs))
      .toThrow(/audience/);
  });
  it("rejects a wrong issuer", () => {
    expect(() => verifyIdTokenWithCerts(makeToken({ payload: { iss: "https://evil" } }, privateKey), certs))
      .toThrow(/issuer/);
  });
  it("rejects an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(() => verifyIdTokenWithCerts(makeToken({ payload: { exp: past } }, privateKey), certs))
      .toThrow(/expired/);
  });
  it("rejects an unknown key id", () => {
    expect(() => verifyIdTokenWithCerts(makeToken({ header: { kid: "nope" } }, privateKey), certs))
      .toThrow(/key-id/);
  });
  it("rejects a tampered signature", () => {
    const token = makeToken({}, privateKey);
    const tampered = token.slice(0, -6) + "AAAAAA";
    expect(() => verifyIdTokenWithCerts(tampered, certs)).toThrow();
  });
  it("rejects a non-RS256 alg", () => {
    expect(() => verifyIdTokenWithCerts(makeToken({ header: { alg: "none" } }, privateKey), certs))
      .toThrow(/alg/);
  });
});
