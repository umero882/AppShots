import { describe, it, expect } from "vitest";
import { checkSize, ALL_SIZES } from "../sizeCheck";

describe("checkSize", () => {
  it("finds an exact match", () => {
    const r = checkSize(1290, 2796);
    expect(r.exact.map((d) => d.id)).toContain("iphone-69");
  });
  it("finds same-shape sizes that only need a resize", () => {
    const r = checkSize(645, 1398); // half of 1290x2796
    expect(r.exact).toHaveLength(0);
    expect(r.scale.map((d) => d.id)).toContain("iphone-69");
  });
  it("spots a rotated image", () => {
    const r = checkSize(2796, 1290);
    expect(r.rotated.map((d) => d.id)).toContain("iphone-69");
  });
  it("returns nothing for a shape no store size uses", () => {
    const r = checkSize(1000, 1000);
    expect(r.exact.length + r.scale.length + r.rotated.length).toBe(0);
  });
  it("ignores bad input", () => {
    expect(checkSize(0, 10).exact).toEqual([]);
  });
  it("covers phones, tablets and creative placements", () => {
    expect(ALL_SIZES.length).toBeGreaterThan(15);
  });
});
