import { describe, it, expect, beforeEach } from "vitest";
import { generateKeyPairSync, createVerify } from "crypto";
import { buildJwt, parseServiceAccount, serviceAccountToken, _clearTokenCache } from "./googleToken.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const sa = { client_email: "mailer@proj.iam.gserviceaccount.com", private_key: privateKey, token_uri: "https://oauth2.googleapis.com/token" };
const b64urlJson = (s) => JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));

describe("buildJwt", () => {
  it("produces an RS256 JWT with the right claims and a verifiable signature", () => {
    const jwt = buildJwt(sa, "scope-a scope-b", 1_700_000_000);
    const [h, c, sig] = jwt.split(".");
    expect(b64urlJson(h)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(b64urlJson(c)).toEqual({
      iss: sa.client_email,
      scope: "scope-a scope-b",
      aud: sa.token_uri,
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"))).toBe(true);
  });
});

describe("parseServiceAccount", () => {
  it("accepts raw JSON and base64 JSON; rejects garbage", () => {
    const json = JSON.stringify(sa);
    expect(parseServiceAccount(json).client_email).toBe(sa.client_email);
    expect(parseServiceAccount(Buffer.from(json).toString("base64")).client_email).toBe(sa.client_email);
    expect(parseServiceAccount("")).toBeNull();
    expect(parseServiceAccount("not json")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ foo: 1 }))).toBeNull();
  });
});

describe("serviceAccountToken", () => {
  beforeEach(() => _clearTokenCache());

  it("exchanges the assertion and caches the token until expiry", async () => {
    let calls = 0;
    const fetchImpl = async (url, init) => {
      calls++;
      expect(url).toBe(sa.token_uri);
      expect(init.body).toMatch(/^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/);
      return { ok: true, json: async () => ({ access_token: "tok-1", expires_in: 3600 }) };
    };
    expect(await serviceAccountToken(sa, "s", { fetchImpl })).toBe("tok-1");
    expect(await serviceAccountToken(sa, "s", { fetchImpl })).toBe("tok-1");
    expect(calls).toBe(1);
  });

  it("throws a descriptive error when Google rejects the assertion", async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant", error_description: "Invalid JWT Signature." }) });
    await expect(serviceAccountToken(sa, "s", { fetchImpl })).rejects.toThrow(/google-token-failed: Invalid JWT Signature/);
  });
});
