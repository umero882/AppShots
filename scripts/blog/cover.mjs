/**
 * Draws a cover image for an article, from nothing but its slug.
 *
 * WHY THIS EXISTS
 * ---------------
 * Nothing drew covers for AppShots, so every article shared one generic
 * og-cover.png. A social card is mostly image: ten articles posting the same
 * picture look like ten copies of the same link, and the one thing that makes
 * someone click — "this is a different article" — was missing. The blog pages
 * had a CSS gradient fallback, which a browser can render and a Facebook
 * crawler cannot.
 *
 * WHY IT DRAWS NO TEXT
 * --------------------
 * Rasterising a headline means a font rasteriser, and the runtime image here is
 * built inside `node:22-alpine` with no Chrome and no native modules — the whole
 * server ships without node_modules on purpose. Adding a native rasteriser to
 * the build to put words on a picture that already appears beside the words
 * would be paying a deploy risk for a duplicate. Every social card shows the
 * title as text next to the image; the image's job is to be recognisably this
 * article and recognisably AppShots.
 *
 * So it is composition instead: the product makes App Store screenshot sets, and
 * the cover is a screenshot set — staggered panels over a two-tone field, with
 * the hues and the stagger both derived from the slug. Same article, same cover,
 * every build, on any machine.
 *
 * PNG, by hand, because zlib is the only part that is hard and node has it.
 * Colour type 2 (truecolour, 8-bit), adaptive None/Up row filters.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";

import { coverHues } from "../../src/lib/blog.js";
import { drawLine, fitText, parseFont } from "./font.mjs";
import { encodeWebp } from "./webp.mjs";

/** Facebook, X and LinkedIn all read 1.91:1. This is that, at the size they cache. */
export const WIDTH = 1200;
export const HEIGHT = 630;

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  // The CRC covers the type and the data, never the length.
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * @param {Uint8Array} rgb  width*height*3, row-major
 * @returns {Buffer} a complete PNG file
 */
export function encodePng(rgb, width = WIDTH, height = HEIGHT) {
  const stride = width * 3;
  if (rgb.length !== stride * height) {
    throw new Error(`encodePng: expected ${stride * height} bytes, got ${rgb.length}`);
  }

  const raw = Buffer.alloc((stride + 1) * height);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    // Row 0 has nothing above it to subtract, and a gradient's vertical delta is
    // near-constant, so Up collapses most rows to a flat run zlib eats whole.
    // Picked per row rather than assumed: a row of panels is flatter left-right.
    let filter = 0;
    if (y > 0) {
      let none = 0;
      let up = 0;
      for (let i = 0; i < stride; i += 1) {
        const v = rgb[row + i];
        const d = (v - rgb[row - stride + i]) & 0xff;
        none += v < 128 ? v : 256 - v;
        up += d < 128 ? d : 256 - d;
      }
      if (up <= none) filter = 2;
    }
    raw[at] = filter;
    at += 1;
    if (filter === 2) {
      for (let i = 0; i < stride; i += 1) {
        raw[at + i] = (rgb[row + i] - rgb[row - stride + i]) & 0xff;
      }
    } else {
      for (let i = 0; i < stride; i += 1) raw[at + i] = rgb[row + i];
    }
    at += stride;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    // Level 6, not 9. On this image 9 costs 271ms to save 12KB against 6's 23ms,
    // and this runs once per article on every deploy — a build that pauses for
    // ten seconds to shave a few KB off a picture is the wrong trade.
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

/** h in degrees, s and l in 0..1. */
export function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function blend(buf, index, [r, g, b], alpha) {
  if (alpha <= 0) return;
  const keep = 1 - alpha;
  buf[index] = Math.round(buf[index] * keep + r * alpha);
  buf[index + 1] = Math.round(buf[index + 1] * keep + g * alpha);
  buf[index + 2] = Math.round(buf[index + 2] * keep + b * alpha);
}

/**
 * A rounded rectangle, alpha-blended, with the corner arc antialiased by
 * distance so a 630px-tall panel does not show stair-steps when the blog index
 * crops it to 144.
 */
function roundRect(buf, { x, y, w, h, radius, color, alpha, width = WIDTH, height = HEIGHT }) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + w));
  const y1 = Math.min(height, Math.ceil(y + h));
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      // Distance outside the rounded shape: 0 inside, growing across the edge.
      const dx = Math.max(x + r - (px + 0.5), px + 0.5 - (x + w - r), 0);
      const dy = Math.max(y + r - (py + 0.5), py + 0.5 - (y + h - r), 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const coverage = dist <= r ? 1 : Math.max(0, 1 - (dist - r));
      if (coverage > 0) blend(buf, (py * width + px) * 3, color, alpha * coverage);
    }
  }
}

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

// ---------------------------------------------------------------------------
// The headline
// ---------------------------------------------------------------------------

/**
 * Inter, the typeface the site already sets everything in and already ships as
 * a dependency so exports can embed it. Read once and kept.
 *
 * A failure here is deliberately not fatal. The font is a build-time file and
 * the cover is decoration: if it ever moves, the covers lose their titles and
 * the blog keeps working, rather than the deploy stopping over a picture. It
 * says so once, loudly, so it cannot go unnoticed for long.
 */
let fontCache;
function inter() {
  if (fontCache !== undefined) return fontCache;
  try {
    const require = createRequire(import.meta.url);
    const file = require.resolve("@fontsource/inter/files/inter-latin-700-normal.woff");
    fontCache = parseFont(readFileSync(file));
  } catch (error) {
    console.warn(`[cover] no headline font — ${error.message}`);
    fontCache = null;
  }
  return fontCache;
}

function drawHeadline(buf, { width, height, title, category, hue }) {
  const font = inter();
  if (!font || !String(title).trim()) return;

  const fitted = fitText(font, title, {
    maxWidth: TITLE_WIDTH,
    maxLines: TITLE_MAX_LINES,
    sizes: TITLE_SIZES,
  });
  // A title no size will wrap into three lines is a title long enough that
  // shrinking it further would be unreadable on a card anyway.
  if (!fitted) return;

  const { size, lines } = fitted;
  const leading = size * 1.16;
  const eyebrow = String(category || "").trim().toUpperCase();
  const eyebrowSize = 23;
  const eyebrowGap = eyebrow ? eyebrowSize * 1.9 : 0;

  // Centred in the safe band rather than on the canvas, so the crop the site
  // applies takes equal amounts off a block that is already where it will be
  // seen.
  const blockHeight = eyebrowGap + (lines.length - 1) * leading + size;
  let baseline = (SAFE_TOP + SAFE_BOTTOM) / 2 - blockHeight / 2 + size * 0.82;

  if (eyebrow) {
    drawLine(font, eyebrow, {
      buf,
      width,
      height,
      x: TITLE_LEFT,
      baseline: baseline - eyebrowGap + eyebrowSize * 0.1,
      size: eyebrowSize,
      // Light enough to read as a label rather than a second headline, tinted
      // toward the cover's own second hue so it belongs to the picture.
      color: hslToRgb(hue, 0.75, 0.76),
      alpha: 0.95,
      tracking: 0.12,
      blend,
    });
  }

  for (const line of lines) {
    // A soft drop shadow: the panels behind the headline are lighter than the
    // field, and white on white is where a cover stops being legible.
    drawLine(font, line, {
      buf, width, height,
      x: TITLE_LEFT + 2,
      baseline: baseline + 3,
      size,
      color: BLACK,
      alpha: 0.32,
      blend,
    });
    drawLine(font, line, {
      buf, width, height,
      x: TITLE_LEFT,
      baseline,
      size,
      color: WHITE,
      alpha: 0.97,
      blend,
    });
    baseline += leading;
  }
}

/**
 * One screenshot panel: the frame, a lighter band where a screenshot's headline
 * sits, and two content bars. Deliberately faint — this reads as texture at card
 * size and as a screenshot set at full size.
 */
function panel(buf, { x, y, w, h, alpha }) {
  roundRect(buf, { x, y, w, h, radius: 22, color: WHITE, alpha });
  roundRect(buf, {
    x: x + w * 0.12,
    y: y + h * 0.1,
    w: w * 0.76,
    h: Math.max(6, h * 0.045),
    radius: 4,
    color: WHITE,
    alpha: alpha * 1.9,
  });
  roundRect(buf, {
    x: x + w * 0.12,
    y: y + h * 0.19,
    w: w * 0.5,
    h: Math.max(5, h * 0.032),
    radius: 4,
    color: WHITE,
    alpha: alpha * 1.3,
  });
  roundRect(buf, {
    x: x + w * 0.12,
    y: y + h * 0.32,
    w: w * 0.76,
    h: h * 0.5,
    radius: 14,
    color: WHITE,
    alpha: alpha * 0.8,
  });
}

/**
 * The safe band. Both places the cover appears crop it: the blog index to a
 * 144px strip and the article header to ~192px, both with object-cover, which
 * takes the crop out of the top and bottom. A headline outside roughly y 175 to
 * y 455 is a headline nobody on the site ever reads — only the social card,
 * which is the one place it is shown whole.
 */
const SAFE_TOP = 175;
const SAFE_BOTTOM = 455;

/** Tried largest first; the first that fits three lines wins. */
const TITLE_SIZES = [72, 64, 58, 52, 46, 40];
const TITLE_LEFT = 78;
const TITLE_WIDTH = 560;
const TITLE_MAX_LINES = 3;

/**
 * The cover for one article as raw RGB.
 *
 * Split from the encoder so the composition can be asserted pixel by pixel in a
 * test without decoding a PNG.
 */
export function renderCover(
  { slug, title = "", category = "" },
  { width = WIDTH, height = HEIGHT } = {},
) {
  const { from, to } = coverHues(slug);
  const start = hslToRgb(from, 0.7, 0.24);
  const end = hslToRgb(to, 0.65, 0.14);
  const buf = new Uint8Array(width * height * 3);

  // Diagonal two-tone field, matching the CSS fallback the pages draw when an
  // image has not loaded — so the swap is invisible rather than a colour jump.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x / width + y / height) / 2;
      const i = (y * width + x) * 3;
      buf[i] = Math.round(start[0] + (end[0] - start[0]) * t);
      buf[i + 1] = Math.round(start[1] + (end[1] - start[1]) * t);
      buf[i + 2] = Math.round(start[2] + (end[2] - start[2]) * t);
    }
  }

  // A light source off the top-left corner, so the panels have something to sit
  // in and the field is not a flat ramp.
  const glowX = width * 0.12;
  const glowY = height * -0.1;
  const glowR = width * 0.75;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - glowX;
      const dy = y - glowY;
      const d = Math.sqrt(dx * dx + dy * dy) / glowR;
      if (d < 1) blend(buf, (y * width + x) * 3, WHITE, 0.13 * (1 - d) ** 2);
    }
  }

  // The screenshot set, on the right, with the last panel running off the edge —
  // a set continues past the frame, and a row of three centred boxes reads as a
  // diagram. The headline gets the left.
  const seed = from;
  const panelW = width * 0.13;
  const panelH = height * 0.68;
  const step = width * 0.152;
  const left = width * 0.585;
  for (let n = 0; n < 4; n += 1) {
    const lift = ((seed + n * 97) % 5) / 4; // 0..1, stable per slug
    panel(buf, {
      x: left + n * step,
      y: height * 0.17 + lift * height * 0.13 - (n % 2 ? height * 0.07 : 0),
      w: panelW,
      h: panelH,
      alpha: 0.07 + (n % 3) * 0.022,
    });
  }

  // A scrim under the headline. The gradient is dark, but the panels are not,
  // and a title must not depend on which hue the slug happened to land on.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width * 0.62; x += 1) {
      const t = 1 - x / (width * 0.62);
      blend(buf, (y * width + x) * 3, BLACK, 0.3 * t ** 1.5);
    }
  }

  drawHeadline(buf, { width, height, title, category, hue: to });

  // Grounds the composition and keeps the bottom edge from glowing when the
  // blog index crops the middle out.
  for (let y = 0; y < height; y += 1) {
    const t = y / height;
    if (t < 0.55) continue;
    const alpha = ((t - 0.55) / 0.45) ** 2 * 0.35;
    for (let x = 0; x < width; x += 1) blend(buf, (y * width + x) * 3, BLACK, alpha);
  }

  return buf;
}

/**
 * Both encodings of one article's cover.
 *
 * Two formats on purpose. WebP is about 8% smaller and every browser worth
 * serving reads it, so it is what the page asks for first. PNG is what goes in
 * og:image: a social card is scraped by whatever the sharer's platform runs, and
 * a preview that silently fails to render is worse than a slightly larger file.
 * The picture is identical either way — verified pixel for pixel against a real
 * decoder, see cover.test.js.
 */
export function makeCover(post) {
  const rgb = renderCover(post);
  return { png: encodePng(rgb, WIDTH, HEIGHT), webp: encodeWebp(rgb, WIDTH, HEIGHT) };
}

/** Where the cover for a slug is served from, per format. */
export function coverPath(slug, format = "png") {
  return `/blog-covers/${slug}.${format}`;
}
