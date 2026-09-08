/**
 * Just enough TrueType to put a headline on a cover image.
 *
 * WHY BY HAND
 * -----------
 * Drawing text needs glyph outlines, and every off-the-shelf way to get them
 * into a build — node-canvas, resvg, sharp, a headless Chrome — is a native
 * binary. This build runs in `node:22-alpine` and the server ships with no
 * node_modules at all; adding a compiled dependency to that path to draw a
 * picture is a deploy that can fail on an architecture nobody tested. The font
 * is already a dependency (@fontsource/inter, which the app self-hosts so
 * exports embed it), so the outlines are already on disk at build time. What was
 * missing was the reader.
 *
 * WHAT IT SUPPORTS
 * ----------------
 * WOFF1 (per-table zlib — WOFF2's Brotli glyf transform is a different and much
 * larger job), TrueType `glyf` outlines, `cmap` formats 4 and 12, simple and
 * composite glyphs, and horizontal advances from `hmtx`. No kerning: Inter puts
 * its pair adjustments in GPOS, and a headline set without them is very slightly
 * loose rather than wrong. No hinting, no shaping, no bidi — this sets Latin
 * headlines at 40px and up, where none of that shows.
 *
 * Anything it cannot do, it says so by throwing. The caller draws a cover
 * without a title rather than a cover with mojibake on it.
 */

import { inflateSync } from "node:zlib";

export class FontError extends Error {}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

/**
 * WOFF1 -> { tag: Buffer } of the raw SFNT tables.
 *
 * WOFF1 is a table directory plus, per table, either zlib-compressed or stored
 * bytes — "stored" being signalled by the compressed length equalling the
 * original, which is the one detail that bites if you assume it is always
 * compressed.
 */
export function decodeWoff(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "wOFF") {
    throw new FontError("not a WOFF file");
  }
  const flavor = buffer.readUInt32BE(4);
  if (flavor !== 0x00010000 && flavor !== 0x74727565) {
    throw new FontError(`not TrueType outlines (flavor 0x${flavor.toString(16)})`);
  }
  const numTables = buffer.readUInt16BE(12);
  const tables = new Map();
  for (let i = 0; i < numTables; i += 1) {
    const at = 44 + i * 20;
    const tag = buffer.toString("ascii", at, at + 4);
    const offset = buffer.readUInt32BE(at + 4);
    const compLength = buffer.readUInt32BE(at + 8);
    const origLength = buffer.readUInt32BE(at + 12);
    const raw = buffer.subarray(offset, offset + compLength);
    tables.set(tag, compLength >= origLength ? raw : inflateSync(raw));
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function parseCmap(cmap) {
  // Prefer a full-Unicode subtable, then the BMP one. Symbol (3,0) is skipped:
  // it maps into a private-use area and would silently produce wrong glyphs.
  const numTables = cmap.readUInt16BE(2);
  let best = null;
  for (let i = 0; i < numTables; i += 1) {
    const at = 4 + i * 8;
    const platform = cmap.readUInt16BE(at);
    const encoding = cmap.readUInt16BE(at + 2);
    const offset = cmap.readUInt32BE(at + 4);
    const format = cmap.readUInt16BE(offset);
    const rank =
      (platform === 3 && encoding === 10) || (platform === 0 && format === 12)
        ? 3
        : (platform === 3 && encoding === 1) || platform === 0
          ? 2
          : 0;
    if (rank && (!best || rank > best.rank)) best = { rank, offset, format };
  }
  if (!best) throw new FontError("no usable cmap subtable");

  const map = new Map();
  const { offset, format } = best;
  if (format === 4) {
    const segCount = cmap.readUInt16BE(offset + 6) / 2;
    const ends = offset + 14;
    const starts = ends + segCount * 2 + 2;
    const deltas = starts + segCount * 2;
    const ranges = deltas + segCount * 2;
    for (let s = 0; s < segCount; s += 1) {
      const end = cmap.readUInt16BE(ends + s * 2);
      const start = cmap.readUInt16BE(starts + s * 2);
      const delta = cmap.readInt16BE(deltas + s * 2);
      const rangeOffset = cmap.readUInt16BE(ranges + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c !== 0x10000; c += 1) {
        let glyph;
        if (rangeOffset === 0) {
          glyph = (c + delta) & 0xffff;
        } else {
          const at = ranges + s * 2 + rangeOffset + (c - start) * 2;
          if (at + 1 >= cmap.length) continue;
          glyph = cmap.readUInt16BE(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) map.set(c, glyph);
      }
    }
  } else if (format === 12) {
    const nGroups = cmap.readUInt32BE(offset + 12);
    for (let g = 0; g < nGroups; g += 1) {
      const at = offset + 16 + g * 12;
      const start = cmap.readUInt32BE(at);
      const end = cmap.readUInt32BE(at + 4);
      const startGlyph = cmap.readUInt32BE(at + 8);
      for (let c = start; c <= end; c += 1) map.set(c, startGlyph + (c - start));
    }
  } else {
    throw new FontError(`unsupported cmap format ${format}`);
  }
  return map;
}

/** Parse the tables a headline needs. Throws rather than returning something half-built. */
export function parseFont(buffer) {
  const tables = decodeWoff(buffer);
  for (const tag of ["head", "maxp", "hhea", "hmtx", "cmap", "loca", "glyf"]) {
    if (!tables.has(tag)) throw new FontError(`font has no ${tag} table`);
  }
  const head = tables.get("head");
  const unitsPerEm = head.readUInt16BE(18);
  const indexToLocFormat = head.readInt16BE(50);
  const numGlyphs = tables.get("maxp").readUInt16BE(4);
  const hhea = tables.get("hhea");
  const numberOfHMetrics = hhea.readUInt16BE(34);

  const loca = tables.get("loca");
  const offsets = new Uint32Array(numGlyphs + 1);
  for (let i = 0; i <= numGlyphs; i += 1) {
    offsets[i] = indexToLocFormat === 0 ? loca.readUInt16BE(i * 2) * 2 : loca.readUInt32BE(i * 4);
  }

  return {
    unitsPerEm,
    ascender: hhea.readInt16BE(4),
    descender: hhea.readInt16BE(6),
    numGlyphs,
    numberOfHMetrics,
    cmap: parseCmap(tables.get("cmap")),
    hmtx: tables.get("hmtx"),
    glyf: tables.get("glyf"),
    loca: offsets,
  };
}

export function glyphFor(font, codePoint) {
  return font.cmap.get(codePoint) ?? 0;
}

export function advanceOf(font, glyphId) {
  const last = font.numberOfHMetrics - 1;
  const i = Math.min(glyphId, last);
  return font.hmtx.readUInt16BE(i * 4);
}

// ---------------------------------------------------------------------------
// Outlines
// ---------------------------------------------------------------------------

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME_OR_POSITIVE = 0x10;
const Y_SAME_OR_POSITIVE = 0x20;

const ARG_1_AND_2_ARE_WORDS = 0x0001;
const ARGS_ARE_XY_VALUES = 0x0002;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;

/**
 * One glyph as contours of {x, y, on} points in FONT UNITS, y up.
 *
 * `depth` stops a composite glyph that references itself from recursing until
 * the stack goes — a corrupt font should not take the build down.
 */
export function glyphContours(font, glyphId, depth = 0) {
  if (glyphId >= font.numGlyphs || depth > 5) return [];
  const start = font.loca[glyphId];
  const end = font.loca[glyphId + 1];
  if (end <= start) return []; // no outline — a space, for instance
  const g = font.glyf.subarray(start, end);
  const numberOfContours = g.readInt16BE(0);

  if (numberOfContours < 0) return compositeContours(font, g, depth);

  const endPts = [];
  for (let i = 0; i < numberOfContours; i += 1) endPts.push(g.readUInt16BE(10 + i * 2));
  const numPoints = numberOfContours ? endPts[endPts.length - 1] + 1 : 0;

  let at = 10 + numberOfContours * 2;
  at += 2 + g.readUInt16BE(at); // skip the hinting programme

  const flags = new Uint8Array(numPoints);
  for (let i = 0; i < numPoints; ) {
    const flag = g[at];
    at += 1;
    flags[i] = flag;
    i += 1;
    if (flag & REPEAT) {
      let repeat = g[at];
      at += 1;
      while (repeat-- > 0 && i < numPoints) {
        flags[i] = flag;
        i += 1;
      }
    }
  }

  const xs = new Int16Array(numPoints);
  let x = 0;
  for (let i = 0; i < numPoints; i += 1) {
    const flag = flags[i];
    if (flag & X_SHORT) {
      const d = g[at];
      at += 1;
      x += flag & X_SAME_OR_POSITIVE ? d : -d;
    } else if (!(flag & X_SAME_OR_POSITIVE)) {
      x += g.readInt16BE(at);
      at += 2;
    }
    xs[i] = x;
  }
  const ys = new Int16Array(numPoints);
  let y = 0;
  for (let i = 0; i < numPoints; i += 1) {
    const flag = flags[i];
    if (flag & Y_SHORT) {
      const d = g[at];
      at += 1;
      y += flag & Y_SAME_OR_POSITIVE ? d : -d;
    } else if (!(flag & Y_SAME_OR_POSITIVE)) {
      y += g.readInt16BE(at);
      at += 2;
    }
    ys[i] = y;
  }

  const contours = [];
  let from = 0;
  for (const to of endPts) {
    const points = [];
    for (let i = from; i <= to; i += 1) {
      points.push({ x: xs[i], y: ys[i], on: (flags[i] & ON_CURVE) !== 0 });
    }
    if (points.length) contours.push(points);
    from = to + 1;
  }
  return contours;
}

function compositeContours(font, g, depth) {
  const out = [];
  let at = 10;
  for (;;) {
    const flags = g.readUInt16BE(at);
    const glyphIndex = g.readUInt16BE(at + 2);
    at += 4;
    let dx;
    let dy;
    if (flags & ARG_1_AND_2_ARE_WORDS) {
      dx = g.readInt16BE(at);
      dy = g.readInt16BE(at + 2);
      at += 4;
    } else {
      dx = g.readInt8(at);
      dy = g.readInt8(at + 1);
      at += 2;
    }
    let a = 1;
    let b = 0;
    let c = 0;
    let d = 1;
    const f2dot14 = (o) => g.readInt16BE(o) / 16384;
    if (flags & WE_HAVE_A_SCALE) {
      a = d = f2dot14(at);
      at += 2;
    } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
      a = f2dot14(at);
      d = f2dot14(at + 2);
      at += 4;
    } else if (flags & WE_HAVE_A_TWO_BY_TWO) {
      a = f2dot14(at);
      b = f2dot14(at + 2);
      c = f2dot14(at + 4);
      d = f2dot14(at + 6);
      at += 8;
    }
    // Point-matched components (no ARGS_ARE_XY_VALUES) need the assembled
    // outline to resolve against; they do not occur in Latin text, so the
    // component is placed unshifted rather than guessed at.
    const ox = flags & ARGS_ARE_XY_VALUES ? dx : 0;
    const oy = flags & ARGS_ARE_XY_VALUES ? dy : 0;
    for (const contour of glyphContours(font, glyphIndex, depth + 1)) {
      out.push(
        contour.map((p) => ({
          x: a * p.x + c * p.y + ox,
          y: b * p.x + d * p.y + oy,
          on: p.on,
        })),
      );
    }
    if (!(flags & MORE_COMPONENTS)) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rasterising
// ---------------------------------------------------------------------------

/**
 * Contours -> closed polygons in PIXEL space, y DOWN, at `scale`.
 *
 * TrueType curves are quadratic, and two consecutive off-curve points imply an
 * on-curve point at their midpoint — the compact form nearly every glyph is
 * stored in. Missing that is the classic way outlines come out as spikes.
 */
export function flatten(contours, scale, steps = 8) {
  const polys = [];
  for (const contour of contours) {
    if (contour.length < 2) continue;

    // Rotate so the run starts on-curve; if none is, use the implied midpoint.
    const startIndex = contour.findIndex((p) => p.on);
    let points;
    if (startIndex === -1) {
      const a = contour[0];
      const b = contour[contour.length - 1];
      points = [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true }, ...contour];
    } else {
      points = [...contour.slice(startIndex), ...contour.slice(0, startIndex)];
    }

    const at = (i) => points[i % points.length];
    const px = (p) => ({ x: p.x * scale, y: -p.y * scale });
    const poly = [px(points[0])];
    let i = 1;
    while (i <= points.length) {
      const p = at(i);
      if (p.on) {
        poly.push(px(p));
        i += 1;
        continue;
      }
      const next = at(i + 1);
      const end = next.on ? next : { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 };
      const from = poly[poly.length - 1];
      const ctrl = px(p);
      const to = px(end);
      for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        const u = 1 - t;
        poly.push({
          x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x,
          y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y,
        });
      }
      i += next.on ? 2 : 1;
    }
    if (poly.length > 2) polys.push(poly);
  }
  return polys;
}

const SUBSAMPLES = 5;

/**
 * Polygons -> an 8-bit coverage mask, with its offset from the origin.
 *
 * Scanline fill, non-zero winding, five sub-scanlines per row and exact
 * horizontal coverage at the span ends. Non-zero rather than even-odd matters:
 * the counter of an 'o' is wound the other way, and even-odd would fill it.
 */
export function rasterize(polys) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return { width: 0, height: 0, left: 0, top: 0, mask: new Uint8Array(0) };

  const left = Math.floor(minX) - 1;
  const top = Math.floor(minY) - 1;
  const width = Math.ceil(maxX) - left + 2;
  const height = Math.ceil(maxY) - top + 2;
  const cover = new Float32Array(width * height);

  const edges = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a.y !== b.y) edges.push({ ax: a.x - left, ay: a.y - top, bx: b.x - left, by: b.y - top });
    }
  }

  const crossings = [];
  for (let row = 0; row < height; row += 1) {
    for (let s = 0; s < SUBSAMPLES; s += 1) {
      const y = row + (s + 0.5) / SUBSAMPLES;
      crossings.length = 0;
      for (const e of edges) {
        const { ay, by } = e;
        if (y < Math.min(ay, by) || y >= Math.max(ay, by)) continue;
        const t = (y - ay) / (by - ay);
        crossings.push({ x: e.ax + t * (e.bx - e.ax), dir: by > ay ? 1 : -1 });
      }
      if (crossings.length < 2) continue;
      crossings.sort((p, q) => p.x - q.x);

      let winding = 0;
      for (let i = 0; i < crossings.length - 1; i += 1) {
        winding += crossings[i].dir;
        if (winding === 0) continue;
        const x0 = crossings[i].x;
        const x1 = crossings[i + 1].x;
        if (x1 <= x0) continue;
        const first = Math.max(0, Math.floor(x0));
        const last = Math.min(width - 1, Math.ceil(x1) - 1);
        for (let px = first; px <= last; px += 1) {
          // How much of this pixel the span covers, horizontally.
          const overlap = Math.min(x1, px + 1) - Math.max(x0, px);
          if (overlap > 0) cover[row * width + px] += overlap / SUBSAMPLES;
        }
      }
    }
  }

  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = Math.max(0, Math.min(255, Math.round(cover[i] * 255)));
  }
  return { width, height, left, top, mask };
}

// ---------------------------------------------------------------------------
// Setting a headline
// ---------------------------------------------------------------------------

/** Width of a string in pixels at `size`, advances only. */
export function measure(font, text, size) {
  const scale = size / font.unitsPerEm;
  let width = 0;
  for (const ch of text) width += advanceOf(font, glyphFor(font, ch.codePointAt(0))) * scale;
  return width * (1 + LETTER_SPACING);
}

// A touch of negative-free tracking. Inter's pair kerning lives in GPOS, which
// this does not read; a hair of extra space reads better than the collisions
// unkerned pairs like "Ta" would otherwise show at headline size.
const LETTER_SPACING = 0.005;

/**
 * Greedy word wrap. Returns null when even a single word will not fit, so the
 * caller can drop a size rather than emit a line that overhangs the canvas.
 */
export function wrap(font, text, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  for (const word of words) {
    if (measure(font, word, size) > maxWidth) return null;
    const candidate = line ? `${line} ${word}` : word;
    if (measure(font, candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The largest size from `sizes` at which `text` fits `maxLines` lines of
 * `maxWidth`, with the wrapped lines. Null when none of them do.
 */
export function fitText(font, text, { maxWidth, maxLines, sizes }) {
  for (const size of sizes) {
    const lines = wrap(font, text, size, maxWidth);
    if (lines && lines.length <= maxLines) return { size, lines };
  }
  return null;
}

/** Cache: a cover sets the same glyph at the same size many times over. */
const MASKS = new Map();

function maskFor(font, glyphId, size) {
  const key = `${glyphId}@${size}`;
  let mask = MASKS.get(key);
  if (!mask) {
    mask = rasterize(flatten(glyphContours(font, glyphId), size / font.unitsPerEm));
    MASKS.set(key, mask);
  }
  return mask;
}

/**
 * Draws one line into an RGB buffer at a baseline, blending `color`.
 *
 * `blend` is passed in rather than imported so this module stays about fonts
 * and the cover keeps its own compositing.
 */
export function drawLine(
  font,
  text,
  { buf, width, height, x, baseline, size, color, alpha = 1, tracking = 0, blend },
) {
  const scale = size / font.unitsPerEm;
  let penX = x;
  for (const ch of text) {
    const glyphId = glyphFor(font, ch.codePointAt(0));
    const mask = maskFor(font, glyphId, size);
    if (mask.width) {
      const originX = Math.round(penX) + mask.left;
      const originY = Math.round(baseline) + mask.top;
      for (let row = 0; row < mask.height; row += 1) {
        const py = originY + row;
        if (py < 0 || py >= height) continue;
        for (let col = 0; col < mask.width; col += 1) {
          const a = mask.mask[row * mask.width + col];
          if (!a) continue;
          const px = originX + col;
          if (px < 0 || px >= width) continue;
          blend(buf, (py * width + px) * 3, color, (a / 255) * alpha);
        }
      }
    }
    penX += advanceOf(font, glyphId) * scale * (1 + LETTER_SPACING) + tracking * size;
  }
  return penX;
}
