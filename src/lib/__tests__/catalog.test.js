import { describe, it, expect } from "vitest";
import {
  TEMPLATES, TEMPLATE_CATEGORIES, worstContrast, backgroundColors,
} from "../galleryTemplates.js";
import { DEVICES } from "../devices.js";
import { LAYOUTS, FONTS } from "../templates.js";

const deviceIds = new Set(DEVICES.map((d) => d.id));
const layoutIds = new Set(LAYOUTS.map((l) => l.id));
const fontIds = new Set(FONTS.map((f) => f.id));

describe("template catalog", () => {
  it("has the six categories", () => {
    expect(TEMPLATE_CATEGORIES).toEqual([
      "Minimal", "Bold", "Playful", "Dark", "Editorial", "Vibrant",
    ]);
  });

  it("ships at least 24 templates with unique ids", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(24);
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has roughly even coverage (>=3 per category)", () => {
    for (const cat of TEMPLATE_CATEGORIES) {
      const n = TEMPLATES.filter((t) => t.category === cat).length;
      expect(n, `category ${cat}`).toBeGreaterThanOrEqual(3);
    }
  });

  for (const t of TEMPLATES) {
    it(`${t.id} is well-formed`, () => {
      expect(TEMPLATE_CATEGORIES).toContain(t.category);
      expect(deviceIds.has(t.style.deviceId)).toBe(true);
      expect(layoutIds.has(t.style.layoutId)).toBe(true);
      expect(fontIds.has(t.style.text.font)).toBe(true);
      expect(t.screens.length).toBeGreaterThanOrEqual(2);
      expect(t.screens.length).toBeLessThanOrEqual(3);
      for (const s of t.screens) {
        expect(typeof s.heading).toBe("string");
        expect(s.image.startsWith("data:image/svg+xml,")).toBe(true);
      }
    });

    it(`${t.id} passes large-text AA contrast (>=3:1)`, () => {
      const ratio = worstContrast(t.style.text.color, t.style.background);
      expect(ratio, `${t.id} ratio`).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("backgroundColors", () => {
  it("returns the solid for solid backgrounds", () => {
    expect(backgroundColors({ type: "solid", solid: "#abcdef" })).toEqual(["#abcdef"]);
  });
  it("returns both gradient stops for gradient backgrounds", () => {
    const colors = backgroundColors({ type: "gradient", gradient: "indigo" });
    expect(colors).toHaveLength(2);
  });
});
