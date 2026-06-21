import { describe, it, expect } from "vitest";
import { crc32, createZip } from "../zip.js";

const bytes = (s) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("matches the standard check value for '123456789'", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });
  it("is 0 for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("createZip", () => {
  it("produces a Blob with the ZIP local-header signature", async () => {
    const blob = createZip([{ name: "a.txt", data: bytes("hello") }]);
    expect(blob.type).toBe("application/zip");
    const u8 = new Uint8Array(await blob.arrayBuffer());
    // PK\x03\x04
    expect([u8[0], u8[1], u8[2], u8[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("records every file in the end-of-central-directory count", async () => {
    const blob = createZip([
      { name: "1.png", data: bytes("aaa") },
      { name: "2.png", data: bytes("bbbb") },
      { name: "3.png", data: bytes("c") },
    ]);
    const u8 = new Uint8Array(await blob.arrayBuffer());
    // EOCD signature is the last 22 bytes; entry count at offset +8
    const eocd = u8.length - 22;
    expect([u8[eocd], u8[eocd + 1], u8[eocd + 2], u8[eocd + 3]]).toEqual([0x50, 0x4b, 0x05, 0x06]);
    const dv = new DataView(u8.buffer);
    expect(dv.getUint16(eocd + 10, true)).toBe(3); // total entries
  });

  it("embeds the file names", async () => {
    const blob = createZip([{ name: "shot-1.png", data: bytes("x") }]);
    const text = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain("shot-1.png");
  });
});
