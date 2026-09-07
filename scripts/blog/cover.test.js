import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";

import { coverGradient, coverHues } from "../../src/lib/blog.js";
import {
  HEIGHT,
  WIDTH,
  coverPath,
  encodePng,
  hslToRgb,
  makeCover,
  renderCover,
} from "./cover.mjs";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Reads a PNG back the long way — chunk lengths, CRCs, inflate, un-filter — so
 * the encoder is checked against the format rather than against itself. If any
 * of it is wrong the image is a broken file on the blog and in every social
 * card, which is not something a snapshot of our own output would catch.
 */
function decodePng(png) {
  expect(png.subarray(0, 8)).toEqual(SIGNATURE);

  const chunks = [];
  let at = 8;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    const stated = png.readUInt32BE(at + 8 + length);
    chunks.push({ type, data, stated, covered: png.subarray(at + 4, at + 8 + length) });
    at += 12 + length;
  }
  expect(at, "chunks do not add up to the file length").toBe(png.length);

  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  for (const { type, covered, stated } of chunks) {
    let c = 0xffffffff;
    for (const byte of covered) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    expect((c ^ 0xffffffff) >>> 0, `${type} CRC`).toBe(stated);
  }

  expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
  const ihdr = chunks[0].data;
  const header = {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    depth: ihdr[8],
    colorType: ihdr[9],
    interlace: ihdr[12],
  };

  const stride = header.width * 3;
  const raw = inflateSync(chunks[1].data);
  expect(raw.length).toBe((stride + 1) * header.height);

  const pixels = new Uint8Array(stride * header.height);
  const filters = new Set();
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    filters.add(filter);
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const above = y > 0 ? pixels[dst - stride + i] : 0;
      pixels[dst + i] = filter === 2 ? (raw[src + i] + above) & 0xff : raw[src + i];
    }
  }
  return { header, pixels, filters };
}

describe("encodePng", () => {
  it("round-trips pixels through a file a decoder would accept", () => {
    // A tiny image with a hard edge, so a filter mistake cannot average away.
    const w = 4;
    const h = 3;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i += 1) {
      rgb[i * 3] = i * 20;
      rgb[i * 3 + 1] = 255 - i * 20;
      rgb[i * 3 + 2] = i % 2 ? 0 : 255;
    }
    const { header, pixels, filters } = decodePng(encodePng(rgb, w, h));
    expect(header).toEqual({ width: w, height: h, depth: 8, colorType: 2, interlace: 0 });
    expect(pixels).toEqual(rgb);
    // Only the two filters the encoder claims to emit.
    for (const f of filters) expect([0, 2]).toContain(f);
  });

  it("refuses a buffer that is not the size it was told", () => {
    expect(() => encodePng(new Uint8Array(10), 4, 3)).toThrow(/expected 36 bytes/);
  });
});

describe("renderCover", () => {
  it("is the size every social network crops to", () => {
    expect([WIDTH, HEIGHT]).toEqual([1200, 630]);
    expect(renderCover("hello").length).toBe(WIDTH * HEIGHT * 3);
  });

  it("opens on the same colour the CSS fallback does", () => {
    // The pages paint coverGradient behind the image. If these drifted apart the
    // card would flash one colour and settle on another.
    const slug = "ai-app-screenshot-maker";
    const { from } = coverHues(slug);
    expect(coverGradient(slug)).toContain(`hsl(${from} 70% 24%)`);

    const buf = renderCover(slug);
    const [r, g, b] = hslToRgb(from, 0.7, 0.24);
    // Top-left carries the corner glow, so compare loosely — the point is the
    // hue is the gradient's, not that no light falls on it.
    expect(Math.abs(buf[0] - r)).toBeLessThan(40);
    expect(Math.abs(buf[1] - g)).toBeLessThan(40);
    expect(Math.abs(buf[2] - b)).toBeLessThan(40);
  });

  it("gives two articles different pictures", () => {
    const a = renderCover("ai-app-screenshot-maker");
    const b = renderCover("android-screenshot-generator");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("draws the same picture for the same article, every build", () => {
    expect(Buffer.from(renderCover("stable")).equals(Buffer.from(renderCover("stable")))).toBe(true);
  });

  it("actually composes something — not a flat field", () => {
    const buf = renderCover("ai-app-screenshot-maker");
    // A panel sits over the middle-left; it must be lighter than the same row
    // far to the right, where the field is darker and no panel reaches.
    const at = (x, y) => buf[(y * WIDTH + x) * 3 + 1];
    const distinct = new Set();
    for (let i = 0; i < buf.length; i += 3) distinct.add(`${buf[i]},${buf[i + 1]},${buf[i + 2]}`);
    expect(distinct.size).toBeGreaterThan(500);
    expect(at(200, 315)).toBeGreaterThan(at(1190, 315));
  });
});

describe("makeCover", () => {
  it("produces a decodable PNG at the advertised size", () => {
    const { header, pixels } = decodePng(makeCover("ai-app-screenshot-maker"));
    expect(header.width).toBe(WIDTH);
    expect(header.height).toBe(HEIGHT);
    // Buffer.equals, not toEqual: a deep-equal over 2.27M elements is slower
    // than everything else in this file put together.
    expect(Buffer.from(pixels).equals(Buffer.from(renderCover("ai-app-screenshot-maker")))).toBe(
      true,
    );
  });

  it("is byte-identical across calls, so a rebuild does not churn the file", () => {
    expect(makeCover("x").equals(makeCover("x"))).toBe(true);
  });
});

describe("coverPath", () => {
  it("is where the server will serve it from", () => {
    expect(coverPath("ai-app-screenshot-maker")).toBe("/blog-covers/ai-app-screenshot-maker.png");
  });
});
