import { describe, it, expect } from "vitest";
import {
  BASE_LOCALE, LOCALES, localeName, projectLocales,
  localizeScreen, setLocaleText, baseStrings, applyLocaleStrings, isRtl,
} from "../i18n.js";

describe("isRtl", () => {
  it("flags right-to-left scripts", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("he")).toBe(true);
  });
  it("is false for left-to-right and base", () => {
    expect(isRtl("en")).toBe(false);
    expect(isRtl("es")).toBe(false);
    expect(isRtl(null)).toBe(false);
  });
});

describe("Arabic is a selectable locale", () => {
  it("appears in the catalog", () => {
    expect(LOCALES.find((l) => l.code === "ar")?.name).toBe("Arabic");
  });
});

describe("locale catalog", () => {
  it("includes English as the base plus common store languages", () => {
    expect(BASE_LOCALE).toBe("en");
    expect(LOCALES.length).toBeGreaterThanOrEqual(20);
    expect(LOCALES.find((l) => l.code === "ja")?.name).toBe("Japanese");
  });
  it("localeName falls back to the code", () => {
    expect(localeName("fr")).toBe("French");
    expect(localeName("xx")).toBe("xx");
  });
});

describe("projectLocales", () => {
  it("defaults to [en]", () => {
    expect(projectLocales({})).toEqual(["en"]);
    expect(projectLocales({ locales: [] })).toEqual(["en"]);
  });
  it("keeps the configured list and guarantees base-first", () => {
    expect(projectLocales({ locales: ["en", "es"] })).toEqual(["en", "es"]);
    expect(projectLocales({ locales: ["es", "fr"] })).toEqual(["en", "es", "fr"]);
  });
});

describe("localizeScreen", () => {
  const screen = { heading: "Hello", subheading: "World", i18n: { es: { heading: "Hola", subheading: "Mundo" } } };
  it("returns base text for the base locale", () => {
    expect(localizeScreen(screen, "en").heading).toBe("Hello");
  });
  it("returns the translation when present", () => {
    const l = localizeScreen(screen, "es");
    expect(l.heading).toBe("Hola");
    expect(l.subheading).toBe("Mundo");
  });
  it("falls back to base when the locale is missing", () => {
    expect(localizeScreen(screen, "fr").heading).toBe("Hello");
  });
  it("preserves the rest of the screen", () => {
    const s = { ...screen, image: "data:x", devices: [{ id: "d" }] };
    const l = localizeScreen(s, "es");
    expect(l.image).toBe("data:x");
    expect(l.devices).toBe(s.devices);
  });
});

describe("setLocaleText", () => {
  it("writes base locale to the plain fields", () => {
    const s = setLocaleText({ heading: "Hi" }, "en", { heading: "Yo" });
    expect(s.heading).toBe("Yo");
    expect(s.i18n).toBeUndefined();
  });
  it("writes a non-base locale into i18n without touching base", () => {
    const s = setLocaleText({ heading: "Hi" }, "es", { heading: "Hola" });
    expect(s.heading).toBe("Hi");
    expect(s.i18n.es.heading).toBe("Hola");
  });
  it("merges into an existing locale entry", () => {
    const start = { heading: "Hi", i18n: { es: { heading: "Hola", subheading: "x" } } };
    const s = setLocaleText(start, "es", { subheading: "Mundo" });
    expect(s.i18n.es).toEqual({ heading: "Hola", subheading: "Mundo" });
  });
});

describe("baseStrings / applyLocaleStrings", () => {
  const screens = [
    { heading: "One", subheading: "First" },
    { heading: "Two", subheading: "" },
  ];
  it("flattens heading+subheading in order", () => {
    expect(baseStrings(screens)).toEqual(["One", "First", "Two", ""]);
  });
  it("writes translated strings back per screen", () => {
    const out = applyLocaleStrings(screens, "es", ["Uno", "Primero", "Dos", "ignored"]);
    expect(out[0].i18n.es).toEqual({ heading: "Uno", subheading: "Primero" });
    // base had no subheading → stays empty even if the model returned one
    expect(out[1].i18n.es).toEqual({ heading: "Dos", subheading: "" });
  });
  it("is a no-op for the base locale", () => {
    expect(applyLocaleStrings(screens, "en", ["x", "y", "z", "w"])).toBe(screens);
  });
});
