import { describe, expect, it } from "vitest";

import { applyPredictor, canonicalCodes, codeLengths, packCodeLengths, prefixEncode } from "./webp.mjs";

describe("prefixEncode", () => {
  /**
   * The decoder, straight from the specification. Encoding is the inverse, and
   * running the real thing backwards is the only way to be sure — the formula
   * is asymmetric enough that an off-by-one reads as plausible in both
   * directions.
   */
  const decode = (code, extra) => {
    if (code < 4) return code + 1;
    const extraBits = (code - 2) >> 1;
    const offset = (2 + (code & 1)) << extraBits;
    return offset + extra + 1;
  };

  it("round-trips every value a length or distance can take", () => {
    for (const value of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 16, 17, 100, 4095, 4096, 756120]) {
      const { code, extraBits, extra } = prefixEncode(value);
      expect(extra, `${value} extra fits its field`).toBeLessThan(1 << extraBits || 1);
      expect(decode(code, extra), `value ${value}`).toBe(value);
    }
  });

  it("matches the ranges the specification tabulates", () => {
    // Code 7 covers 13..16 with 2 extra bits; code 23 covers 3073..4096 with
    // 10. The boundary is worth pinning: the top of one code's range and the
    // bottom of the next differ by one, and reading it off by one puts every
    // long copy in the wrong bucket while still decoding to a plausible number.
    expect(prefixEncode(13).code).toBe(7);
    expect(prefixEncode(13).extraBits).toBe(2);
    expect(prefixEncode(16).code).toBe(7);
    expect(prefixEncode(17).code).toBe(8);
    expect(prefixEncode(3072).code).toBe(22);
    expect(prefixEncode(3073).code).toBe(23);
    expect(prefixEncode(3073).extraBits).toBe(10);
    expect(prefixEncode(4096).code).toBe(23);
  });

  it("rejects a value the scheme cannot express", () => {
    expect(() => prefixEncode(0)).toThrow(/positive value/);
  });
});

describe("codeLengths", () => {
  it("gives a single symbol length 1 — the complete tree that costs no bits", () => {
    const lengths = codeLengths([0, 0, 7, 0]);
    expect(Array.from(lengths)).toEqual([0, 0, 1, 0]);
  });

  it("leaves an unused alphabet entirely unset", () => {
    expect(Array.from(codeLengths([0, 0, 0]))).toEqual([0, 0, 0]);
  });

  it("is a complete prefix code: the Kraft sum is exactly one", () => {
    const freqs = [5, 1, 1, 9, 40, 3, 3, 2, 17];
    const lengths = codeLengths(freqs);
    const kraft = Array.from(lengths).reduce((sum, l) => sum + (l ? 2 ** -l : 0), 0);
    expect(kraft).toBeCloseTo(1, 10);
  });

  it("gives shorter codes to commoner symbols", () => {
    const lengths = codeLengths([1, 100, 1, 1]);
    expect(lengths[1]).toBeLessThan(lengths[0]);
  });

  it("honours the length limit even on a pathological distribution", () => {
    // Fibonacci weights are the classic way to force a deep tree.
    const freqs = [1, 1];
    for (let i = 2; i < 40; i += 1) freqs.push(freqs[i - 1] + freqs[i - 2]);
    const lengths = codeLengths(freqs, 15);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(15);
    const kraft = Array.from(lengths).reduce((sum, l) => sum + (l ? 2 ** -l : 0), 0);
    expect(kraft).toBeCloseTo(1, 10);
  });

  it("fits the 3-bit field the code-length code is written in", () => {
    const freqs = new Array(19).fill(0).map((_, i) => (i + 1) ** 3);
    expect(Math.max(...codeLengths(freqs, 7))).toBeLessThanOrEqual(7);
  });
});

describe("canonicalCodes", () => {
  it("is prefix-free once the bits are turned back round", () => {
    const lengths = codeLengths([8, 4, 2, 1, 1]);
    const codes = canonicalCodes(lengths);
    // Codes are stored reversed for the LSB-first writer, so undo that before
    // checking the property that matters.
    const unreverse = (code, length) => {
      let out = 0;
      for (let i = 0; i < length; i += 1) out |= ((code >>> i) & 1) << (length - 1 - i);
      return out;
    };
    const seen = [];
    for (let s = 0; s < lengths.length; s += 1) {
      if (!lengths[s]) continue;
      seen.push({ bits: unreverse(codes[s], lengths[s]), length: lengths[s] });
    }
    for (const a of seen) {
      for (const b of seen) {
        if (a === b || a.length > b.length) continue;
        // No code may be a prefix of another.
        expect(b.bits >>> (b.length - a.length), "prefix collision").not.toBe(a.bits);
      }
    }
  });
});

describe("packCodeLengths", () => {
  const expand = (packed) => {
    const out = [];
    for (const { symbol, extra } of packed) {
      if (symbol === 16) for (let i = 0; i < extra + 3; i += 1) out.push(out[out.length - 1]);
      else if (symbol === 17) for (let i = 0; i < extra + 3; i += 1) out.push(0);
      else if (symbol === 18) for (let i = 0; i < extra + 11; i += 1) out.push(0);
      else out.push(symbol);
    }
    return out;
  };

  it("round-trips through the run codes it emits", () => {
    for (const lengths of [
      [3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
      [0],
      [1, 2, 3, 4],
      new Array(200).fill(0),
      new Array(300).fill(7),
      [5, ...new Array(150).fill(0), 5],
    ]) {
      expect(expand(packCodeLengths(lengths)), JSON.stringify(lengths.slice(0, 6))).toEqual(lengths);
    }
  });

  it("emits exactly as many lengths as the alphabet has", () => {
    // The stream says "read the whole alphabet", so a run code that overshot
    // would desynchronise everything after it.
    const lengths = new Array(280).fill(0);
    lengths[0] = 4;
    lengths[279] = 4;
    expect(expand(packCodeLengths(lengths)).length).toBe(280);
  });
});

describe("applyPredictor", () => {
  it("predicts the first pixel from opaque black", () => {
    const pixels = new Uint32Array([0xff000000]);
    expect(applyPredictor(pixels, 1, 1, 1)[0]).toBe(0);
  });

  it("uses the pixel before across the top row, whatever the mode", () => {
    const pixels = new Uint32Array([0xff102030, 0xff102030, 0xff102030]);
    const residuals = applyPredictor(pixels, 3, 1, 2 /* mode 2 is T, and is overridden */);
    expect(residuals[1]).toBe(0);
    expect(residuals[2]).toBe(0);
  });

  it("uses the pixel above down the first column", () => {
    const pixels = new Uint32Array([0xff102030, 0xff000000, 0xff102030, 0xff000000]);
    const residuals = applyPredictor(pixels, 2, 2, 1 /* mode 1 is L, and is overridden */);
    expect(residuals[2]).toBe(0);
  });

  it("wraps each channel independently, so a residual is always a byte", () => {
    // White, then black: each colour channel is 0x00 - 0xff = -255, which must
    // come back as 1 rather than as a negative that would corrupt the byte
    // above it. Alpha is unchanged, so it stays 0.
    const residuals = applyPredictor(new Uint32Array([0xffffffff, 0xff000000]), 2, 1, 1);
    expect(residuals[1]).toBe(0x00010101);

    // ...and the other way round, where each channel is +255.
    const back = applyPredictor(new Uint32Array([0xff000000, 0xffffffff]), 2, 1, 1);
    expect(back[1]).toBe(0x00ffffff);
  });
});
