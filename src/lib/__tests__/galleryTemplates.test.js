import { describe, it, expect } from "vitest";
import { TEMPLATES, TEMPLATE_CATEGORIES, templateToProjectState } from "../galleryTemplates.js";
import { GRADIENTS, FONTS, LAYOUTS } from "../templates.js";

const GIDS = new Set(GRADIENTS.map((g) => g.id));
const FIDS = new Set(FONTS.map((f) => f.id));
const LIDS = new Set(LAYOUTS.map((l) => l.id));

describe("gallery templates", () => {
  it("has a healthy, growing library with unique ids", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(50);
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template references valid font / layout / category / gradient ids", () => {
    for (const t of TEMPLATES) {
      expect(FIDS, `${t.id} font`).toContain(t.style.text.font);
      expect(LIDS, `${t.id} layout`).toContain(t.style.layoutId);
      expect(TEMPLATE_CATEGORIES, `${t.id} category`).toContain(t.category);
      expect(t.screens.length, `${t.id} screens`).toBeGreaterThan(0);
      const bg = t.style.background;
      if (bg.type === "gradient") expect(GIDS, `${t.id} gradient`).toContain(bg.gradient);
      if (bg.type === "pattern") {
        expect(bg.pattern).toBeTruthy();
        expect(bg.patternFg).toMatch(/^#/);
        expect(bg.patternBg).toMatch(/^#/);
      }
    }
  });

  it("converts a template into a usable project state", () => {
    const st = templateToProjectState(TEMPLATES.find((t) => t.category === "Pattern"));
    expect(st.screens.length).toBeGreaterThan(0);
    expect(st.background.type).toBe("pattern");
    expect(st.deviceId).toBeTruthy();
  });

  it("covers every declared category with at least one template", () => {
    for (const cat of TEMPLATE_CATEGORIES) {
      expect(TEMPLATES.some((t) => t.category === cat), `no template for ${cat}`).toBe(true);
    }
  });
});
