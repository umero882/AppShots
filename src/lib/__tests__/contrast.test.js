import { describe, it, expect } from "vitest";
import { contrastRatio, passesAA, passesLargeAA } from "../contrast.js";

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
  it("returns 1 for identical colors", () => {
    expect(contrastRatio("#6366f1", "#6366f1")).toBeCloseTo(1, 2);
  });
  it("is order-independent", () => {
    expect(contrastRatio("#111827", "#f3f4f6")).toBeCloseTo(
      contrastRatio("#f3f4f6", "#111827"),
      5
    );
  });
  it("supports 3-digit hex", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 0);
  });
});

describe("thresholds", () => {
  it("passesAA true for white on dark navy", () => {
    expect(passesAA("#ffffff", "#0b1020")).toBe(true);
  });
  it("passesAA false for white on a light gray", () => {
    expect(passesAA("#ffffff", "#e5e7eb")).toBe(false);
  });
  it("passesLargeAA uses the 3:1 threshold", () => {
    // ratio between ~3 and 4.5 passes large but not normal
    const ratio = contrastRatio("#ffffff", "#6366f1");
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);
    expect(passesLargeAA("#ffffff", "#6366f1")).toBe(true);
    expect(passesAA("#ffffff", "#6366f1")).toBe(false);
  });
});
