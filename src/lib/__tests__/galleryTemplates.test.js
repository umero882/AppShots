import { describe, it, expect } from "vitest";
import {
  TEMPLATES, TEMPLATE_CATEGORIES, templateToProjectState,
  variantBase, nextVariantName, makeVariantState,
} from "../galleryTemplates.js";
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

describe("A/B style variants", () => {
  const base = templateToProjectState(TEMPLATES[0]);

  it("strips the variant suffix to recover the base name", () => {
    expect(variantBase("My App · Variant B")).toBe("My App");
    expect(variantBase("My App")).toBe("My App");
  });

  it("assigns the next unused variant letter (original counts as A)", () => {
    const projects = [{ name: "My App" }, { name: "My App · Variant B" }];
    expect(nextVariantName(projects, "My App")).toBe("My App · Variant C");
    // from an existing variant, still resolves against the same base
    expect(nextVariantName(projects, "My App · Variant B")).toBe("My App · Variant C");
    expect(nextVariantName([{ name: "Solo" }], "Solo")).toBe("Solo · Variant B");
  });

  it("keeps content + device but changes the visual style", () => {
    const v = makeVariantState(base, 5);
    expect(v.screens).toEqual(base.screens); // same headlines/screenshots
    expect(v.deviceId).toBe(base.deviceId); // same store slot
    // style differs (background and/or font/layout changed)
    const styleChanged =
      JSON.stringify(v.background) !== JSON.stringify(base.background) ||
      v.text.font !== base.text.font ||
      v.layoutId !== base.layoutId;
    expect(styleChanged).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    expect(makeVariantState(base, 3)).toEqual(makeVariantState(base, 3));
  });
});
