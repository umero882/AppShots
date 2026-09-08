import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";

import { coverGradient, coverHues } from "../../src/lib/blog.js";
import { encodeWebp } from "./webp.mjs";
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
    expect(renderCover({ slug: "hello" }).length).toBe(WIDTH * HEIGHT * 3);
  });

  it("opens on the same colour the CSS fallback does", () => {
    // The pages paint coverGradient behind the image. If these drifted apart the
    // card would flash one colour and settle on another.
    const slug = "ai-app-screenshot-maker";
    const { from } = coverHues(slug);
    expect(coverGradient(slug)).toContain(`hsl(${from} 70% 24%)`);

    const buf = renderCover({ slug });
    const [r, g, b] = hslToRgb(from, 0.7, 0.24);
    // Top-left carries the corner glow, so compare loosely — the point is the
    // hue is the gradient's, not that no light falls on it.
    expect(Math.abs(buf[0] - r)).toBeLessThan(40);
    expect(Math.abs(buf[1] - g)).toBeLessThan(40);
    expect(Math.abs(buf[2] - b)).toBeLessThan(40);
  });

  it("gives two articles different pictures", () => {
    const a = renderCover({ slug: "ai-app-screenshot-maker" });
    const b = renderCover({ slug: "android-screenshot-generator" });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("draws the same picture for the same article, every build", () => {
    expect(Buffer.from(renderCover({ slug: "stable" })).equals(Buffer.from(renderCover({ slug: "stable" })))).toBe(true);
  });

  it("actually composes something — not a flat field", () => {
    const buf = renderCover({ slug: "ai-app-screenshot-maker" });
    const at = (x, y) => buf[(y * WIDTH + x) * 3 + 1];
    const distinct = new Set();
    for (let i = 0; i < buf.length; i += 3) distinct.add(`${buf[i]},${buf[i + 1]},${buf[i + 2]}`);
    expect(distinct.size).toBeGreaterThan(500);
    // The screenshot panels are on the right; the left carries the scrim the
    // headline is set on, and must be darker than a panel on the same row.
    expect(at(760, 315)).toBeGreaterThan(at(200, 500));
  });

  it("sets the headline, and leaves the picture alone without one", () => {
    const title = "AI App Screenshot Maker: What the AI Actually Does";
    const withText = renderCover({ slug: "ai-app-screenshot-maker", title, category: "screenshots" });
    const without = renderCover({ slug: "ai-app-screenshot-maker" });
    expect(Buffer.from(withText).equals(Buffer.from(without))).toBe(false);

    // Glyphs are near-white and nothing else on the cover is. Counting them in
    // the band the title occupies is what tells a drawn headline apart from a
    // font that failed to load, which is otherwise a silent difference.
    const bright = (buf) => {
      let n = 0;
      for (let y = 190; y < 440; y += 1) {
        for (let x = 78; x < 640; x += 1) {
          const i = (y * WIDTH + x) * 3;
          if (buf[i] > 200 && buf[i + 1] > 200 && buf[i + 2] > 200) n += 1;
        }
      }
      return n;
    };
    expect(bright(withText)).toBeGreaterThan(4000);
    expect(bright(without)).toBe(0);
  });

  it("keeps the headline inside the band the site crops to", () => {
    const buf = renderCover({
      slug: "ai-app-screenshot-maker",
      title: "AI App Screenshot Maker: What the AI Actually Does",
      category: "screenshots",
    });
    // Both places this appears crop the top and bottom away. Ink outside the
    // safe band is ink only a social card ever sees.
    const inkOutside = (() => {
      let n = 0;
      for (const y of [...range(0, 170), ...range(460, HEIGHT)]) {
        for (let x = 0; x < 700; x += 1) {
          const i = (y * WIDTH + x) * 3;
          if (buf[i] > 200 && buf[i + 1] > 200 && buf[i + 2] > 200) n += 1;
        }
      }
      return n;
    })();
    expect(inkOutside).toBe(0);
  });
});

function range(from, to) {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

describe("makeCover", () => {
  it("produces a decodable PNG at the advertised size", () => {
    const { header, pixels } = decodePng(makeCover({ slug: "ai-app-screenshot-maker" }).png);
    expect(header.width).toBe(WIDTH);
    expect(header.height).toBe(HEIGHT);
    // Buffer.equals, not toEqual: a deep-equal over 2.27M elements is slower
    // than everything else in this file put together.
    expect(Buffer.from(pixels).equals(Buffer.from(renderCover({ slug: "ai-app-screenshot-maker" })))).toBe(
      true,
    );
  });

  it("is byte-identical across calls, so a rebuild does not churn the file", () => {
    expect(makeCover({ slug: "x" }).png.equals(makeCover({ slug: "x" }).png)).toBe(true);
  });
});

describe("coverPath", () => {
  it("is where the server will serve it from", () => {
    expect(coverPath("ai-app-screenshot-maker")).toBe("/blog-covers/ai-app-screenshot-maker.png");
    expect(coverPath("ai-app-screenshot-maker", "webp")).toBe(
      "/blog-covers/ai-app-screenshot-maker.webp",
    );
  });
});

/**
 * The WebP encoder is hand-written, so "does a decoder accept it" is the only
 * question that matters and no assertion here can answer it — a decoder written
 * beside the encoder would share its misunderstandings.
 *
 * It was answered outside this file, by Chrome: both encodings of the same cover
 * were drawn to a canvas and compared, and all 756,000 pixels matched with a
 * largest channel delta of 0. Re-run that check after touching webp.mjs — write
 * the pair into dist/blog-covers/, load them in a page, and diff getImageData.
 *
 * What is left to assert here is the container and the header, which are exact,
 * cheap, and the parts a refactor is most likely to break.
 */
describe("cover WebP", () => {
  const bits = (buf, at, n) => {
    let value = 0;
    for (let i = 0; i < n; i += 1) {
      const bit = at + i;
      value |= ((buf[bit >> 3] >>> (bit & 7)) & 1) << i;
    }
    return value;
  };

  it("is a RIFF/WEBP/VP8L file whose sizes agree with its length", () => {
    const { webp } = makeCover({ slug: "ai-app-screenshot-maker", title: "A Cover" });
    expect(webp.toString("ascii", 0, 4)).toBe("RIFF");
    expect(webp.toString("ascii", 8, 12)).toBe("WEBP");
    expect(webp.toString("ascii", 12, 16)).toBe("VP8L");
    expect(webp.readUInt32LE(4)).toBe(webp.length - 8);
    // The chunk size excludes the pad byte a decoder skips.
    const chunkSize = webp.readUInt32LE(16);
    expect(chunkSize).toBeLessThanOrEqual(webp.length - 20);
    expect(webp.length - 20 - chunkSize).toBeLessThanOrEqual(1);
    expect(webp[20]).toBe(0x2f); // the VP8L signature byte
  });

  it("carries the real dimensions in its header bits", () => {
    const { webp } = makeCover({ slug: "ai-app-screenshot-maker", title: "A Cover" });
    const stream = webp.subarray(21); // past the signature
    expect(bits(stream, 0, 14) + 1).toBe(WIDTH);
    expect(bits(stream, 14, 14) + 1).toBe(HEIGHT);
    expect(bits(stream, 28, 1)).toBe(0); // opaque
    expect(bits(stream, 29, 3)).toBe(0); // version must be 0
  });

  it("beats the PNG, which is the only reason to carry two of them", () => {
    const { png, webp } = makeCover({
      slug: "ai-app-screenshot-maker",
      title: "AI App Screenshot Maker: What the AI Actually Does",
      category: "screenshots",
    });
    expect(webp.length).toBeLessThan(png.length);
  });

  it("refuses a buffer that is not the size it was told", () => {
    expect(() => encodeWebp(new Uint8Array(10), 4, 3)).toThrow(/expected 36 bytes/);
  });
});
