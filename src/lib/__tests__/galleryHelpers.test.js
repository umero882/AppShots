import { describe, it, expect } from "vitest";
import {
  templateToProjectState, applyTemplateStyle, filterTemplates, textPosFor,
  suggestTextColor, SUGGEST_LIGHT, SUGGEST_DARK,
} from "../galleryTemplates.js";

const fixture = {
  id: "fx", name: "Fixture One", category: "Minimal", accent: "#6366f1",
  style: {
    deviceId: "ipad-13", layoutId: "centered", deviceScale: 0.68,
    background: { type: "solid", gradient: "indigo", solid: "#f3f4f6" },
    text: { font: "inter", color: "#111827", size: 60, weight: 800, align: "center" },
  },
  screens: [
    { heading: "A", subheading: "a", image: "data:image/svg+xml,X" },
    { heading: "B", subheading: "", image: "data:image/svg+xml,Y" },
  ],
};

describe("textPosFor", () => {
  it("maps known layouts", () => {
    expect(textPosFor("text-top")).toBe("top");
    expect(textPosFor("text-bottom")).toBe("bottom");
    expect(textPosFor("device-only")).toBe("none");
    expect(textPosFor("centered")).toBe("top");
  });
  it("falls back for unknown", () => {
    expect(textPosFor("nope")).toBe("top");
  });
});

describe("templateToProjectState", () => {
  it("produces the full project shape", () => {
    const s = templateToProjectState(fixture);
    expect(s.deviceId).toBe("ipad-13");
    expect(s.layoutId).toBe("centered");
    expect(s.deviceScale).toBe(0.68);
    expect(s.background).toEqual(fixture.style.background);
    expect(s.text).toEqual(fixture.style.text);
    expect(s.screens).toHaveLength(2);
    expect(s.screens[0]).toMatchObject({ heading: "A", subheading: "a", image: "data:image/svg+xml,X" });
    expect(typeof s.screens[0].id).toBe("string");
    expect(s.screens[0].id).not.toBe(s.screens[1].id);
  });
  it("deep-clones so mutating the result never touches the template", () => {
    const s = templateToProjectState(fixture);
    s.background.solid = "#000000";
    s.screens[0].heading = "changed";
    expect(fixture.style.background.solid).toBe("#f3f4f6");
    expect(fixture.screens[0].heading).toBe("A");
  });
  it("defaults a missing subheading to empty string and missing image to null", () => {
    const t = { ...fixture, screens: [{ heading: "X" }] };
    const s = templateToProjectState(t);
    expect(s.screens[0].subheading).toBe("");
    expect(s.screens[0].image).toBeNull();
  });
});

describe("applyTemplateStyle", () => {
  it("replaces style but preserves the user's screens unchanged", () => {
    const prev = {
      deviceId: "iphone-69", layoutId: "text-top", deviceScale: 0.78,
      background: { type: "gradient", gradient: "ocean", solid: "#0ea5e9" },
      text: { font: "mono", color: "#fff", size: 70, weight: 900, align: "left" },
      screens: [{ id: "keep1", heading: "mine", subheading: "", image: "data:img" }],
    };
    const next = applyTemplateStyle(prev, fixture);
    expect(next.deviceId).toBe("ipad-13");
    expect(next.layoutId).toBe("centered");
    expect(next.background).toEqual(fixture.style.background);
    expect(next.text).toEqual(fixture.style.text);
    expect(next.screens).toBe(prev.screens); // same reference, untouched
  });
});

describe("filterTemplates", () => {
  const list = [
    { name: "Indigo Bold", category: "Bold" },
    { name: "Paper", category: "Minimal" },
    { name: "Sunset Pop", category: "Playful" },
  ];
  it("returns all for category All and empty query", () => {
    expect(filterTemplates(list, { category: "All", query: "" })).toHaveLength(3);
  });
  it("filters by category", () => {
    expect(filterTemplates(list, { category: "Bold", query: "" })).toHaveLength(1);
  });
  it("matches query against name and category (case-insensitive)", () => {
    expect(filterTemplates(list, { category: "All", query: "pop" })[0].name).toBe("Sunset Pop");
    expect(filterTemplates(list, { category: "All", query: "minimal" })[0].name).toBe("Paper");
  });
  it("uses sane defaults when opts omitted", () => {
    expect(filterTemplates(list)).toHaveLength(3);
  });
});

describe("suggestTextColor", () => {
  it("suggests light text on a dark solid", () => {
    expect(suggestTextColor({ type: "solid", solid: "#0b1020" })).toBe(SUGGEST_LIGHT);
  });
  it("suggests dark text on a light solid", () => {
    expect(suggestTextColor({ type: "solid", solid: "#f3f4f6" })).toBe(SUGGEST_DARK);
  });
  it("suggests light text on a dark gradient", () => {
    expect(suggestTextColor({ type: "gradient", gradient: "grape" })).toBe(SUGGEST_LIGHT);
  });
});
