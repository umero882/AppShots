/**
 * A VP8L (WebP lossless) encoder, in plain JavaScript.
 *
 * WHY
 * ---
 * The covers were PNG, and the dashboard that watches the publishing queue
 * builds a cover's address by appending `.webp` — so the server carried a
 * redirect to paper over the mismatch. libwebp is a native module and this
 * build has no compiler; the format, though, is small enough to write.
 *
 * WHAT IT IMPLEMENTS
 * ------------------
 * The subset that encodes an opaque, photograph-free image well: the predictor
 * transform, LZ77 with hash-chain matching, and one prefix-code group. No colour
 * cache, no meta prefix codes, no colour transform — libwebp's remaining tricks,
 * and the reason a real encoder still beats this one.
 *
 * Both of the first two are load-bearing, which is worth saying because each
 * looked optional on the way in. Without the predictor a cover came out 165KB
 * against the PNG's 115KB; with it but matching only the pixel before and the
 * pixel above, 153KB. The residuals are 89% zeros — the information was never
 * the problem, finding the repeats was. Hash chains took it to 106KB.
 *
 * Written against the bitstream specification rather than from memory, because
 * three of its details are the kind you cannot guess:
 *
 *   - Prefix codes go into the stream BIT-REVERSED. The writer is LSB-first and
 *     the decoder walks the tree MSB-first, so a canonical code has to be turned
 *     round before it is written or every symbol decodes as some other symbol.
 *   - Distance code 1 is the pixel ABOVE and code 2 is the pixel to the LEFT —
 *     the first two entries of the 120-entry neighbourhood map, (0,1) and (1,0).
 *     Codes above 120 are a plain scan-line distance offset by 120, which is the
 *     escape hatch that makes the rest of that table unnecessary here.
 *   - A literal is written green, red, blue, alpha. Not ARGB order.
 *
 * The output is checked against the PNG of the same image, pixel for pixel, by
 * a real decoder — see the note in cover.test.js.
 */

export class WebpError extends Error {}

const MAX_DIMENSION = 16384; // 14-bit width and height
const GREEN_ALPHABET = 256 + 24; // literals + length prefix codes, no colour cache
const DISTANCE_ALPHABET = 40;
const MAX_COPY = 4096; // the largest value the 24 length prefix codes reach
const MIN_COPY = 3; // below this a literal is cheaper than a length+distance pair

// The neighbourhood map's first two entries: (0,1) is the row above, (1,0) is
// the pixel before. Everything else this encoder needs goes through the >120
// escape, so the other 118 entries never come up.
const DIST_CODE_ABOVE = 1;
const DIST_CODE_LEFT = 2;

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

/** LSB-first bit writer: the first bit written is bit 0 of the first byte. */
class BitWriter {
  constructor(capacity = 1 << 16) {
    this.buf = new Uint8Array(capacity);
    this.length = 0;
    this.acc = 0;
    this.bits = 0;
  }

  #grow() {
    if (this.length < this.buf.length) return;
    const next = new Uint8Array(this.buf.length * 2);
    next.set(this.buf);
    this.buf = next;
  }

  put(value, n) {
    for (let i = 0; i < n; i += 1) {
      this.acc |= ((value >>> i) & 1) << this.bits;
      this.bits += 1;
      if (this.bits === 8) {
        this.#grow();
        this.buf[this.length] = this.acc;
        this.length += 1;
        this.acc = 0;
        this.bits = 0;
      }
    }
  }

  finish() {
    if (this.bits > 0) {
      this.#grow();
      this.buf[this.length] = this.acc;
      this.length += 1;
      this.acc = 0;
      this.bits = 0;
    }
    return Buffer.from(this.buf.subarray(0, this.length));
  }
}

function reverseBits(code, length) {
  let out = 0;
  for (let i = 0; i < length; i += 1) out |= ((code >>> (length - 1 - i)) & 1) << i;
  return out;
}

// ---------------------------------------------------------------------------
// Prefix (Huffman) codes
// ---------------------------------------------------------------------------

/**
 * Code lengths for `freqs`, never longer than `limit`.
 *
 * Over-long codes are fixed by halving the frequencies and rebuilding, which
 * flattens the distribution until it fits. Crude next to package-merge, and it
 * converges in a handful of rounds because an alphabet of equal frequencies
 * needs only ceil(log2(n)) bits — nine, here, against a limit of fifteen.
 */
export function codeLengths(freqs, limit = 15) {
  const n = freqs.length;
  const lengths = new Uint8Array(n);
  let work = Array.from(freqs);

  for (let round = 0; round < 40; round += 1) {
    const used = [];
    for (let i = 0; i < n; i += 1) if (work[i] > 0) used.push(i);

    if (used.length === 0) return lengths; // caller writes an empty code
    if (used.length === 1) {
      // A single leaf is a complete tree by fiat: length 1, and it costs no
      // bits to decode.
      lengths[used[0]] = 1;
      return lengths;
    }

    // Huffman by repeated extraction of the two smallest weights.
    const nodes = used.map((symbol) => ({ weight: work[symbol], symbol, left: null, right: null }));
    const queue = nodes.slice().sort((a, b) => a.weight - b.weight);
    while (queue.length > 1) {
      const a = queue.shift();
      const b = queue.shift();
      const merged = { weight: a.weight + b.weight, symbol: -1, left: a, right: b };
      // Insertion point, keeping the queue sorted; ties go last so the tree
      // stays as balanced as the weights allow.
      let lo = 0;
      let hi = queue.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (queue[mid].weight <= merged.weight) lo = mid + 1;
        else hi = mid;
      }
      queue.splice(lo, 0, merged);
    }

    lengths.fill(0);
    let deepest = 0;
    const walk = (node, depth) => {
      if (node.symbol >= 0) {
        lengths[node.symbol] = Math.max(1, depth);
        deepest = Math.max(deepest, Math.max(1, depth));
        return;
      }
      walk(node.left, depth + 1);
      walk(node.right, depth + 1);
    };
    walk(queue[0], 0);
    if (deepest <= limit) return lengths;

    work = work.map((f) => (f > 0 ? Math.max(1, Math.floor(f / 2)) : 0));
  }
  throw new WebpError("could not fit the prefix code inside the length limit");
}

/**
 * Canonical codes for `lengths`, already bit-reversed for the LSB-first writer.
 */
export function canonicalCodes(lengths) {
  const codes = new Int32Array(lengths.length);
  const maxLength = lengths.reduce((m, l) => Math.max(m, l), 0);
  if (maxLength === 0) return codes;

  const countByLength = new Int32Array(maxLength + 1);
  for (const l of lengths) if (l) countByLength[l] += 1;

  const nextCode = new Int32Array(maxLength + 2);
  let code = 0;
  for (let l = 1; l <= maxLength; l += 1) {
    code = (code + countByLength[l - 1]) << 1;
    nextCode[l] = code;
  }
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const l = lengths[symbol];
    if (!l) continue;
    codes[symbol] = reverseBits(nextCode[l], l);
    nextCode[l] += 1;
  }
  return codes;
}

const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** Run-length encode code lengths into the 19-symbol code-length alphabet. */
export function packCodeLengths(lengths) {
  const out = [];
  let i = 0;
  while (i < lengths.length) {
    const value = lengths[i];
    let run = 1;
    while (i + run < lengths.length && lengths[i + run] === value) run += 1;
    i += run; // the whole run is consumed here; `run` is now a counter to spend

    if (value === 0) {
      while (run >= 11) {
        const take = Math.min(run, 138);
        out.push({ symbol: 18, extraBits: 7, extra: take - 11 });
        run -= take;
      }
      while (run >= 3) {
        const take = Math.min(run, 10);
        out.push({ symbol: 17, extraBits: 3, extra: take - 3 });
        run -= take;
      }
      for (let k = 0; k < run; k += 1) out.push({ symbol: 0, extraBits: 0, extra: 0 });
    } else {
      // Symbol 16 repeats the PREVIOUS length, so the value itself is written
      // once before any repeats of it.
      out.push({ symbol: value, extraBits: 0, extra: 0 });
      run -= 1;
      while (run >= 3) {
        const take = Math.min(run, 6);
        out.push({ symbol: 16, extraBits: 2, extra: take - 3 });
        run -= take;
      }
      for (let k = 0; k < run; k += 1) out.push({ symbol: value, extraBits: 0, extra: 0 });
    }
  }
  return out;
}

/**
 * The lengths to WRITE symbols with, which is not always the lengths declared
 * in the header.
 *
 * A prefix code with a single symbol is declared with length 1 and then costs
 * NOTHING to decode — the decoder knows the answer without reading. Writing the
 * one bit its declared length implies puts a bit into the stream that the
 * decoder never takes back out, and everything after it decodes as noise. The
 * alpha code hits this on every opaque image, which is every image here.
 */
function emissionLengths(lengths) {
  let used = 0;
  for (const l of lengths) if (l) used += 1;
  return used <= 1 ? new Uint8Array(lengths.length) : lengths;
}

/** Write one prefix code's definition into the stream. */
function writePrefixCode(bw, lengths, alphabetSize) {
  const used = [];
  for (let i = 0; i < lengths.length && used.length < 3; i += 1) if (lengths[i]) used.push(i);

  // The simple form: one or two symbols, both inside [0..255].
  if (used.length <= 2 && (used.length === 0 || used[used.length - 1] < 256)) {
    bw.put(1, 1); // simple
    if (used.length === 0) {
      bw.put(0, 1); // one symbol...
      bw.put(0, 1); // ...written in one bit...
      bw.put(0, 1); // ...symbol 0. An empty code is a code for nothing.
      return;
    }
    bw.put(used.length - 1, 1);
    if (used[0] <= 1) {
      bw.put(0, 1);
      bw.put(used[0], 1);
    } else {
      bw.put(1, 1);
      bw.put(used[0], 8);
    }
    if (used.length === 2) bw.put(used[1], 8);
    return;
  }

  bw.put(0, 1); // normal

  const packed = packCodeLengths(Array.from(lengths.subarray(0, alphabetSize)));
  const clFreqs = new Array(19).fill(0);
  for (const item of packed) clFreqs[item.symbol] += 1;
  const clLengths = codeLengths(clFreqs, 7); // written in 3 bits each
  const clCodes = canonicalCodes(clLengths);

  let numCodeLengths = 19;
  while (numCodeLengths > 4 && clLengths[CODE_LENGTH_ORDER[numCodeLengths - 1]] === 0) {
    numCodeLengths -= 1;
  }
  bw.put(numCodeLengths - 4, 4);
  for (let i = 0; i < numCodeLengths; i += 1) bw.put(clLengths[CODE_LENGTH_ORDER[i]], 3);

  // 0 = "read code lengths for the whole alphabet", so exactly alphabetSize of
  // them must follow. packCodeLengths was given exactly that many.
  bw.put(0, 1);
  const clEmit = emissionLengths(clLengths);
  for (const item of packed) {
    bw.put(clCodes[item.symbol], clEmit[item.symbol]);
    if (item.extraBits) bw.put(item.extra, item.extraBits);
  }
}

// ---------------------------------------------------------------------------
// Length and distance prefix coding
// ---------------------------------------------------------------------------

/**
 * The scheme the spec decodes as:
 *   if (prefix_code < 4) return prefix_code + 1;
 *   extra_bits = (prefix_code - 2) >> 1;
 *   offset = (2 + (prefix_code & 1)) << extra_bits;
 *   return offset + ReadBits(extra_bits) + 1;
 * run backwards, for a value >= 1.
 */
export function prefixEncode(value) {
  if (value < 1) throw new WebpError(`prefix coding needs a positive value, got ${value}`);
  const n = value - 1;
  if (n < 4) return { code: n, extraBits: 0, extra: 0 };
  let highest = 31 - Math.clz32(n);
  const extraBits = highest - 1;
  const second = (n >>> extraBits) & 1;
  const code = 2 * highest + second;
  const offset = (2 + (code & 1)) << extraBits;
  return { code, extraBits, extra: n - offset };
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * RGB (3 bytes per pixel) -> a complete .webp file.
 *
 * The image is treated as opaque: alpha is 255 everywhere, which makes its
 * prefix code a single symbol costing nothing per pixel, and lets
 * `alpha_is_used` be 0.
 */
export function encodeWebp(rgb, width, height) {
  if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new WebpError(`unsupported size ${width}x${height}`);
  }
  if (rgb.length !== width * height * 3) {
    throw new WebpError(`expected ${width * height * 3} bytes, got ${rgb.length}`);
  }

  const count = width * height;
  // One 32-bit value per pixel makes matching a single comparison. Alpha is a
  // real 255 rather than 0: the predictor's own starting value is 0xff000000,
  // so an image built with alpha 0 would come back out fully transparent.
  const pixels = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) {
    pixels[i] = (0xff000000 | (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2]) >>> 0;
  }

  const mode = bestPredictor(pixels, width, height);
  const residuals = applyPredictor(pixels, width, height, mode);

  const bw = new BitWriter(count);
  bw.put(width - 1, 14);
  bw.put(height - 1, 14);
  bw.put(0, 1); // alpha_is_used — a hint, and every pixel here is opaque
  bw.put(0, 3); // version

  // One transform: the predictor. Without it the gradient costs far more than
  // it does in a PNG, whose row filters do the same job.
  bw.put(1, 1); // a transform follows
  bw.put(0, 2); // PREDICTOR_TRANSFORM
  bw.put(PREDICTOR_SIZE_BITS - 2, 3);
  const blocks = 1 << PREDICTOR_SIZE_BITS;
  const modesWide = Math.ceil(width / blocks);
  const modesHigh = Math.ceil(height / blocks);
  const modeImage = new Uint32Array(modesWide * modesHigh).fill(
    (0xff000000 | (mode << 8)) >>> 0,
  );
  // A sub-resolution image carries no transforms and no meta-prefix bit — not
  // even the 0 that would end a transform list.
  writeImageData(bw, modeImage, modesWide, modeImage.length, { metaPrefix: false });

  bw.put(0, 1); // the main image's transform list ends here
  writeImageData(bw, residuals, width, count, { metaPrefix: true });

  return container(bw.finish());
}

/**
 * How many bits the block covers. 512 keeps the mode image at 3x2 for a
 * 1200x630 cover — small enough that one mode for the whole picture costs
 * almost nothing to say.
 */
const PREDICTOR_SIZE_BITS = 9;

/** Mode 1 = L, mode 2 = T, mode 12 = clamp(L + T - TL). */
const PREDICTOR_MODES = [1, 2, 12];

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function predict(mode, L, T, TL) {
  if (mode === 1) return L;
  if (mode === 2) return T;
  let out = 0;
  for (let shift = 0; shift < 32; shift += 8) {
    const value = clamp(((L >>> shift) & 0xff) + ((T >>> shift) & 0xff) - ((TL >>> shift) & 0xff));
    out |= value << shift;
  }
  return out >>> 0;
}

function subtract(actual, predicted) {
  let out = 0;
  for (let shift = 0; shift < 32; shift += 8) {
    out |= (((actual >>> shift) & 0xff) - ((predicted >>> shift) & 0xff) + 256) % 256 << shift;
  }
  return out >>> 0;
}

/**
 * The residual image for one predictor mode.
 *
 * The edge rules override the mode entirely: the first pixel is predicted from
 * opaque black, the rest of the first row from the pixel before it, and the
 * first pixel of every other row from the pixel above. Missing those is the
 * classic way a decoded image comes out sheared.
 */
export function applyPredictor(pixels, width, height, mode) {
  const out = new Uint32Array(pixels.length);
  out[0] = subtract(pixels[0], 0xff000000);
  for (let x = 1; x < width; x += 1) out[x] = subtract(pixels[x], pixels[x - 1]);
  for (let y = 1; y < height; y += 1) {
    const row = y * width;
    out[row] = subtract(pixels[row], pixels[row - width]);
    for (let x = 1; x < width; x += 1) {
      const i = row + x;
      out[i] = subtract(pixels[i], predict(mode, pixels[i - 1], pixels[i - width], pixels[i - width - 1]));
    }
  }
  return out;
}

/**
 * The mode leaving the most residuals at exactly zero.
 *
 * A crude proxy for entropy, and the right one here: a zero residual extends a
 * backward reference, and long copies are where this format's compression
 * actually comes from.
 */
function bestPredictor(pixels, width, height) {
  let best = PREDICTOR_MODES[0];
  let bestZeros = -1;
  for (const mode of PREDICTOR_MODES) {
    const residuals = applyPredictor(pixels, width, height, mode);
    let zeros = 0;
    for (let i = 0; i < residuals.length; i += 1) if (residuals[i] === 0xff000000 >>> 0 || residuals[i] === 0) zeros += 1;
    if (zeros > bestZeros) {
      bestZeros = zeros;
      best = mode;
    }
  }
  return best;
}

function writeImageData(bw, pixels, width, count, { metaPrefix }) {
  const tokens = emitTokens(pixels, width, count);

  // Histograms, over the tokens rather than the pixels: a copy costs one green
  // symbol and one distance symbol, and counting pixels would size the codes
  // for a stream that is not the one being written.
  const greenFreq = new Array(GREEN_ALPHABET).fill(0);
  const redFreq = new Array(256).fill(0);
  const blueFreq = new Array(256).fill(0);
  const alphaFreq = new Array(256).fill(0);
  const distFreq = new Array(DISTANCE_ALPHABET).fill(0);
  for (const t of tokens) {
    if (t.copy) {
      greenFreq[256 + t.lengthCode] += 1;
      distFreq[t.distCode] += 1;
    } else {
      greenFreq[(t.pixel >>> 8) & 0xff] += 1;
      redFreq[(t.pixel >>> 16) & 0xff] += 1;
      blueFreq[t.pixel & 0xff] += 1;
      alphaFreq[(t.pixel >>> 24) & 0xff] += 1;
    }
  }

  const greenLengths = codeLengths(greenFreq);
  const redLengths = codeLengths(redFreq);
  const blueLengths = codeLengths(blueFreq);
  const alphaLengths = codeLengths(alphaFreq);
  const distLengths = codeLengths(distFreq);
  const green = canonicalCodes(greenLengths);
  const red = canonicalCodes(redLengths);
  const blue = canonicalCodes(blueLengths);
  const alpha = canonicalCodes(alphaLengths);
  const dist = canonicalCodes(distLengths);

  bw.put(0, 1); // no colour cache
  if (metaPrefix) bw.put(0, 1); // one prefix-code group for the whole image

  writePrefixCode(bw, greenLengths, GREEN_ALPHABET);
  writePrefixCode(bw, redLengths, 256);
  writePrefixCode(bw, blueLengths, 256);
  writePrefixCode(bw, alphaLengths, 256);
  writePrefixCode(bw, distLengths, DISTANCE_ALPHABET);

  const greenEmit = emissionLengths(greenLengths);
  const redEmit = emissionLengths(redLengths);
  const blueEmit = emissionLengths(blueLengths);
  const alphaEmit = emissionLengths(alphaLengths);
  const distEmit = emissionLengths(distLengths);

  for (const t of tokens) {
    if (t.copy) {
      const symbol = 256 + t.lengthCode;
      bw.put(green[symbol], greenEmit[symbol]);
      if (t.lengthExtraBits) bw.put(t.lengthExtra, t.lengthExtraBits);
      bw.put(dist[t.distCode], distEmit[t.distCode]);
      if (t.distExtraBits) bw.put(t.distExtra, t.distExtraBits);
    } else {
      // Green, red, blue, alpha — in that order, which is not the order the
      // channels are packed in.
      const g = (t.pixel >>> 8) & 0xff;
      const r = (t.pixel >>> 16) & 0xff;
      const b = t.pixel & 0xff;
      const a = (t.pixel >>> 24) & 0xff;
      bw.put(green[g], greenEmit[g]);
      bw.put(red[r], redEmit[r]);
      bw.put(blue[b], blueEmit[b]);
      bw.put(alpha[a], alphaEmit[a]);
    }
  }
}

/**
 * Literals and copies for the whole image.
 *
 * Two candidate distances, both of which the neighbourhood map gives a one- or
 * two-bit code: the pixel before, which covers a horizontal run, and the pixel
 * one row up, which covers a gradient that barely changes between rows. The
 * longer match wins.
 */
const HASH_BITS = 17;
// 128 costs ~60ms more per cover than 24 and takes 110KB to 106KB. A build
// step that runs once per article can afford it.
const MAX_CHAIN = 128;

/** The distance code for a scan-line distance, cheapest form first. */
function distanceCode(distance, width) {
  if (distance === width) return DIST_CODE_ABOVE;
  if (distance === 1) return DIST_CODE_LEFT;
  // Everything else goes through the escape: codes above 120 are a plain
  // scan-line distance offset by 120, which is what makes the other 118 entries
  // of the neighbourhood table unnecessary.
  return distance + 120;
}

function emitTokens(pixels, width, count) {
  const tokens = [];
  // Hash chains over three-pixel keys — the standard match finder. Without it
  // only the pixel before and the pixel above are ever candidates, which finds
  // the runs and misses every repeat, and repeats are most of a picture like
  // this one.
  const head = new Int32Array(1 << HASH_BITS).fill(-1);
  const prev = new Int32Array(count).fill(-1);
  const hashAt = (i) =>
    (Math.imul(pixels[i], 0x9e3779b1) ^
      Math.imul(pixels[i + 1], 0x85ebca6b) ^
      Math.imul(pixels[i + 2], 0xc2b2ae35)) >>>
    (32 - HASH_BITS);

  const matchLength = (i, distance, limit) => {
    let length = 0;
    while (length < limit && pixels[i + length] === pixels[i + length - distance]) length += 1;
    return length;
  };

  let i = 0;
  while (i < count) {
    const limit = Math.min(MAX_COPY, count - i);
    let bestLength = 0;
    let bestDistance = 0;

    // The two cheap distances first: a run, and the row above.
    for (const distance of [1, width]) {
      if (i < distance) continue;
      const length = matchLength(i, distance, limit);
      if (length > bestLength) {
        bestLength = length;
        bestDistance = distance;
      }
    }

    if (i + 2 < count) {
      let candidate = head[hashAt(i)];
      for (let step = 0; step < MAX_CHAIN && candidate >= 0; step += 1) {
        const distance = i - candidate;
        if (distance > 0) {
          const length = matchLength(i, distance, limit);
          // Strictly longer only: a tie is never worth a longer distance code.
          if (length > bestLength) {
            bestLength = length;
            bestDistance = distance;
          }
        }
        candidate = prev[candidate];
      }
    }

    // Every position goes into the chain, including the ones a copy skips over —
    // a match that starts inside a copied run is still a match later.
    const advance = bestLength >= MIN_COPY ? bestLength : 1;
    for (let k = 0; k < advance; k += 1) {
      const at = i + k;
      if (at + 2 >= count) break;
      const h = hashAt(at);
      prev[at] = head[h];
      head[h] = at;
    }

    if (bestLength >= MIN_COPY) {
      const bestDistCode = distanceCode(bestDistance, width);
      const len = prefixEncode(bestLength);
      const d = prefixEncode(bestDistCode);
      tokens.push({
        copy: true,
        lengthCode: len.code,
        lengthExtraBits: len.extraBits,
        lengthExtra: len.extra,
        distCode: d.code,
        distExtraBits: d.extraBits,
        distExtra: d.extra,
      });
      i += bestLength;
    } else {
      tokens.push({ copy: false, pixel: pixels[i] });
      i += 1;
    }
  }
  return tokens;
}

function container(payload) {
  const signed = Buffer.concat([Buffer.from([0x2f]), payload]);
  const padded = signed.length % 2 === 1 ? Buffer.concat([signed, Buffer.alloc(1)]) : signed;
  const out = Buffer.alloc(12 + 8 + padded.length);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(4 + 8 + padded.length, 4); // everything after this field
  out.write("WEBP", 8, "ascii");
  out.write("VP8L", 12, "ascii");
  out.writeUInt32LE(signed.length, 16); // the chunk's real size, before padding
  padded.copy(out, 20);
  return out;
}
