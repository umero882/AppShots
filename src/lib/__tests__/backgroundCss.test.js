import { describe, it, expect } from "vitest";
import { backgroundCss } from "../../components/ScreenCanvas.jsx";

describe("backgroundCss", () => {
  it("returns the solid color for solid backgrounds", () => {
    expect(backgroundCss({ type: "solid", solid: "#ff0000" })).toBe("#ff0000");
  });
  it("uses the AI gradient css when present", () => {
    const css = "linear-gradient(90deg, #111111, #222222)";
    expect(backgroundCss({ type: "gradient", aiGradient: { css } })).toBe(css);
  });
  it("falls back to a preset gradient when no AI css", () => {
    const out = backgroundCss({ type: "gradient", gradient: "indigo" });
    expect(out).toContain("linear-gradient");
    expect(out).toContain("#6366f1");
  });
  it("falls back to the first preset for an unknown gradient id", () => {
    const out = backgroundCss({ type: "gradient", gradient: "nope" });
    expect(out).toContain("linear-gradient");
  });
});
