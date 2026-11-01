import { describe, it, expect } from "vitest";
import { accentFromPixels, brandBackground } from "../landingDraft";

const px = (n, [r, g, b], a = 255) => Array.from({ length: n }, () => [r, g, b, a]).flat();

describe("accentFromPixels", () => {
  it("ignores a white UI and finds the accent colour", () => {
    const data = new Uint8ClampedArray([...px(900, [250, 250, 250]), ...px(100, [220, 40, 40])]);
    const c = accentFromPixels(data);
    expect(c[0]).toBeGreaterThan(180);
    expect(c[1]).toBeLessThan(80);
  });
  it("picks the most common hue, not the average of all colours", () => {
    const data = new Uint8ClampedArray([...px(300, [30, 60, 220]), ...px(100, [230, 140, 20])]);
    const c = accentFromPixels(data);
    expect(c[2]).toBeGreaterThan(c[0]); // blue wins
  });
  it("returns null for greyscale or a nearly colourless image", () => {
    expect(accentFromPixels(new Uint8ClampedArray(px(1000, [128, 128, 128])))).toBeNull();
    expect(accentFromPixels(new Uint8ClampedArray([...px(990, [255, 255, 255]), ...px(10, [200, 30, 30])]))).toBeNull();
  });
  it("ignores transparent pixels", () => {
    expect(accentFromPixels(new Uint8ClampedArray(px(1000, [220, 40, 40], 0)))).toBeNull();
  });
});

describe("brandBackground", () => {
  it("is a gradient background carrying precomputed css", () => {
    const bg = brandBackground([220, 40, 40]);
    expect(bg.type).toBe("gradient");
    expect(bg.aiGradient.css).toMatch(/^linear-gradient\(135deg, rgb\(/);
  });
});

describe("accentFromPixels rejects murky results", () => {
  it("returns null for a dark brown (photo shadows)", () => {
    expect(accentFromPixels(new Uint8ClampedArray(px(1000, [90, 55, 25])))).toBeNull();
  });
  it("returns null for a dull olive", () => {
    expect(accentFromPixels(new Uint8ClampedArray(px(1000, [127, 112, 73])))).toBeNull();
  });
  it("still accepts a soft but bright pink", () => {
    expect(accentFromPixels(new Uint8ClampedArray(px(1000, [235, 146, 199])))).not.toBeNull();
  });
});
