import { describe, it, expect } from "vitest";
import { signRequest, listObjects, putObject, deleteObject, s3ConfigFromEnv, s3Configured } from "./s3.js";

// AWS's published SigV4 example ("GET Object", examplebucket, 2013-05-24) —
// https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
const AWS_EXAMPLE = {
  endpoint: "https://s3.amazonaws.com",
  bucket: "examplebucket",
  region: "us-east-1",
  accessKey: "AKIAIOSFODNN7EXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  virtualHost: true,
};

describe("signRequest (AWS Signature V4)", () => {
  it("reproduces AWS's documented GET Object signature exactly", () => {
    const { signature, headers, url } = signRequest(AWS_EXAMPLE, {
      method: "GET",
      key: "test.txt",
      headers: { range: "bytes=0-9" },
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toBe("https://examplebucket.s3.amazonaws.com/test.txt");
    expect(headers["x-amz-date"]).toBe("20130524T000000Z");
    expect(headers["x-amz-content-sha256"]).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    );
  });

  it("uses path-style URLs by default and encodes keys per RFC 3986 (keeping slashes)", () => {
    const cfg = { ...AWS_EXAMPLE, endpoint: "https://eu.example-object-storage.test", virtualHost: false };
    const { url } = signRequest(cfg, { method: "PUT", key: "appshots/back up (1)+x.tar.gz", body: "x" });
    expect(url).toBe("https://eu.example-object-storage.test/examplebucket/appshots/back%20up%20%281%29%2Bx.tar.gz");
  });

  it("hashes the body and sorts query parameters", () => {
    const cfg = { ...AWS_EXAMPLE, virtualHost: false };
    const a = signRequest(cfg, { method: "GET", query: { prefix: "p", "list-type": "2" }, now: new Date("2013-05-24T00:00:00Z") });
    expect(a.url).toBe("https://s3.amazonaws.com/examplebucket?list-type=2&prefix=p");
    const b = signRequest(cfg, { method: "PUT", key: "k", body: Buffer.from("hello"), now: new Date("2013-05-24T00:00:00Z") });
    expect(b.headers["x-amz-content-sha256"]).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});

describe("s3 operations over a fake fetch", () => {
  const cfg = { ...AWS_EXAMPLE, virtualHost: false };

  it("listObjects follows continuation tokens and parses entries", async () => {
    const pages = [
      `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>tok1</NextContinuationToken><Contents><Key>appshots/a.tar.gz</Key><LastModified>2026-09-01T00:00:00.000Z</LastModified><Size>10</Size></Contents></ListBucketResult>`,
      `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>appshots/b.tar.gz</Key><LastModified>2026-09-02T00:00:00.000Z</LastModified><Size>20</Size></Contents></ListBucketResult>`,
    ];
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return { ok: true, text: async () => pages.shift() };
    };
    const out = await listObjects(cfg, "appshots/", { fetchImpl });
    expect(out).toEqual([
      { key: "appshots/a.tar.gz", size: 10, lastModified: "2026-09-01T00:00:00.000Z" },
      { key: "appshots/b.tar.gz", size: 20, lastModified: "2026-09-02T00:00:00.000Z" },
    ]);
    expect(calls[1]).toContain("continuation-token=tok1");
  });

  it("putObject sends the body with content headers; deleteObject issues DELETE; errors surface the S3 code", async () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url, method: init.method, len: init.headers["content-length"], type: init.headers["content-type"] });
      return { ok: true, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    };
    await putObject(cfg, "appshots/x.tar.gz", Buffer.from("abc"), { contentType: "application/gzip", fetchImpl });
    await deleteObject(cfg, "appshots/x.tar.gz", { fetchImpl });
    expect(seen[0]).toMatchObject({ method: "PUT", len: "3", type: "application/gzip" });
    expect(seen[1]).toMatchObject({ method: "DELETE" });

    const failing = async () => ({ ok: false, status: 403, text: async () => "<Error><Code>SignatureDoesNotMatch</Code></Error>" });
    await expect(putObject(cfg, "k", "v", { fetchImpl: failing })).rejects.toThrow(/s3-put-failed: SignatureDoesNotMatch/);
  });

  it("reads config from env and reports whether it's complete", () => {
    expect(s3Configured(s3ConfigFromEnv({}))).toBe(false);
    const c = s3ConfigFromEnv({ BACKUP_S3_ENDPOINT: "https://x", BACKUP_S3_BUCKET: "b", BACKUP_S3_ACCESS_KEY: "a", BACKUP_S3_SECRET_KEY: "s" });
    expect(c.region).toBe("us-east-1");
    expect(s3Configured(c)).toBe(true);
  });
});
