import { describe, it, expect } from "vitest";
import { watermarkSpec } from "../export";

describe("watermarkSpec", () => {
  it("scales with the output and stays inside the canvas", () => {
    for (const [w, h] of [[1290, 2796], [1080, 1920], [3840, 1646], [640, 1136]]) {
      const s = watermarkSpec(w, h);
      expect(s.text).toBe("Made with AppShots");
      expect(s.font).toBeGreaterThanOrEqual(8);
      expect(s.h + s.bottom).toBeLessThan(h * 0.2);
    }
  });
  it("is bigger on bigger outputs", () => {
    expect(watermarkSpec(2000, 3000).font).toBeGreaterThan(watermarkSpec(1000, 2000).font);
  });
});
