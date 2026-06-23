import { describe, it, expect } from "vitest";
import { homography, cssMatrix3d, defaultCorners, cornersToPx } from "../warp.js";

describe("homography", () => {
  it("is identity when src maps to itself", () => {
    const rect = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const [a, b, c, d, e, f, g, h] = homography(rect, rect);
    expect(a).toBeCloseTo(1);
    expect(e).toBeCloseTo(1);
    for (const v of [b, c, d, f, g, h]) expect(v).toBeCloseTo(0);
  });
  it("captures a pure translation", () => {
    const src = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const dst = src.map(([x, y]) => [x + 10, y + 20]);
    const [, , c, , , f] = homography(src, dst);
    expect(c).toBeCloseTo(10);
    expect(f).toBeCloseTo(20);
  });
  it("maps each source corner onto its destination", () => {
    const src = [[0, 0], [200, 0], [200, 300], [0, 300]];
    const dst = [[20, 5], [180, 30], [160, 280], [40, 260]];
    const [a, b, c, d, e, f, g, h] = homography(src, dst);
    for (let i = 0; i < 4; i++) {
      const [sx, sy] = src[i];
      const w = g * sx + h * sy + 1;
      const x = (a * sx + b * sy + c) / w;
      const y = (d * sx + e * sy + f) / w;
      expect(x).toBeCloseTo(dst[i][0], 3);
      expect(y).toBeCloseTo(dst[i][1], 3);
    }
  });
});

describe("cssMatrix3d", () => {
  it("returns the identity matrix3d when corners equal the element rect", () => {
    const m = cssMatrix3d(100, 100, [[0, 0], [100, 0], [100, 100], [0, 100]]);
    expect(m).toBe("matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)");
  });
  it("encodes a translation in the last column", () => {
    const m = cssMatrix3d(100, 100, [[10, 20], [110, 20], [110, 120], [10, 120]]);
    expect(m).toContain("10,20,0,1)");
  });
});

describe("corner helpers", () => {
  it("defaultCorners is a centered quad of 4 points", () => {
    const c = defaultCorners();
    expect(c).toHaveLength(4);
    c.forEach((p) => expect(p).toHaveLength(2));
  });
  it("cornersToPx scales normalized corners to the canvas", () => {
    expect(cornersToPx([[0, 0], [1, 0], [1, 1], [0, 1]], 300, 600)).toEqual([[0, 0], [300, 0], [300, 600], [0, 600]]);
  });
});
