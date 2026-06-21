import { describe, it, expect } from "vitest";
import { textEffectStyle, TEXT_EFFECTS, GRADIENT_DEFAULT } from "../textEffects.js";

describe("TEXT_EFFECTS", () => {
  it("offers the expected presets", () => {
    expect(TEXT_EFFECTS.map((e) => e.id)).toEqual(["none", "shadow", "glow", "outline", "gradient"]);
  });
});

describe("textEffectStyle", () => {
  it("none → empty object", () => {
    expect(textEffectStyle({ effect: "none", color: "#fff" }, 40)).toEqual({});
    expect(textEffectStyle({}, 40)).toEqual({});
  });
  it("shadow → a drop textShadow scaled by size", () => {
    const s = textEffectStyle({ effect: "shadow" }, 40);
    expect(s.textShadow).toContain("rgba(0,0,0,0.45)");
  });
  it("glow → textShadow using the text color", () => {
    const s = textEffectStyle({ effect: "glow", color: "#ff0000" }, 40);
    expect(s.textShadow).toContain("#ff0000");
  });
  it("outline → text stroke whose color contrasts the fill, no shadow", () => {
    const dark = textEffectStyle({ effect: "outline", color: "#ffffff" }, 40);
    expect(dark.WebkitTextStroke).toContain("#000000"); // light text → dark stroke
    expect(dark.textShadow).toBe("none");
    const light = textEffectStyle({ effect: "outline", color: "#000000" }, 40);
    expect(light.WebkitTextStroke).toContain("#ffffff");
  });
  it("gradient → background-clip:text with transparent fill", () => {
    const s = textEffectStyle({ effect: "gradient", gradientFrom: "#111111", gradientTo: "#222222" }, 40);
    expect(s.backgroundImage).toContain("linear-gradient");
    expect(s.backgroundImage).toContain("#111111");
    expect(s.WebkitBackgroundClip).toBe("text");
    expect(s.color).toBe("transparent");
  });
  it("gradient → falls back to default colors", () => {
    const s = textEffectStyle({ effect: "gradient" }, 40);
    expect(s.backgroundImage).toContain(GRADIENT_DEFAULT.from);
    expect(s.backgroundImage).toContain(GRADIENT_DEFAULT.to);
  });
  it("tolerates a non-finite size", () => {
    expect(() => textEffectStyle({ effect: "shadow" }, undefined)).not.toThrow();
  });
});
