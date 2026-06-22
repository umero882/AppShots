import { describe, it, expect } from "vitest";
import {
  parseGithubUrl,
  extractHexColors,
  aiGradientCss,
  normalizeConcept,
  parseConcepts,
  buildPrompt,
  buildTranslatePrompt,
  parseTranslations,
} from "../aiCore.js";

describe("buildTranslatePrompt", () => {
  it("lists indexed texts and target locales, asks for JSON", () => {
    const p = buildTranslatePrompt(["Hello", "World"], [{ code: "es", name: "Spanish" }]);
    expect(p).toContain('0: "Hello"');
    expect(p).toContain('1: "World"');
    expect(p).toContain('"es" (Spanish)');
    expect(p).toContain("JSON object");
    expect(p).toContain("exactly 2");
  });
});

describe("parseTranslations", () => {
  it("parses a locale-keyed object into fixed-length arrays", () => {
    const out = parseTranslations('{"es":["Hola","Mundo"],"fr":["Bonjour","Monde"]}', ["es", "fr"], 2);
    expect(out).toEqual({ es: ["Hola", "Mundo"], fr: ["Bonjour", "Monde"] });
  });
  it("strips markdown fences", () => {
    const out = parseTranslations('```json\n{"es":["Hola"]}\n```', ["es"], 1);
    expect(out.es).toEqual(["Hola"]);
  });
  it("pads/truncates each locale to the requested count", () => {
    const out = parseTranslations('{"es":["only one"]}', ["es"], 2);
    expect(out.es).toEqual(["only one", ""]);
  });
  it("throws on a missing target or malformed JSON", () => {
    expect(() => parseTranslations('{"es":["Hola"]}', ["es", "fr"], 1)).toThrow("ai-parse");
    expect(() => parseTranslations("not json", ["es"], 1)).toThrow("ai-parse");
  });
});

describe("parseGithubUrl", () => {
  it("parses a standard https URL", () => {
    expect(parseGithubUrl("https://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });
  it("strips trailing slash and .git, ignores deep paths", () => {
    expect(parseGithubUrl("https://github.com/owner/repo/")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseGithubUrl("https://github.com/owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseGithubUrl("https://github.com/owner/repo/tree/main/src")).toEqual({ owner: "owner", repo: "repo" });
  });
  it("accepts www/http and owner/repo shorthand", () => {
    expect(parseGithubUrl("http://www.github.com/a/b")).toEqual({ owner: "a", repo: "b" });
    expect(parseGithubUrl("owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });
  it("returns null for non-github / empty", () => {
    expect(parseGithubUrl("https://gitlab.com/a/b")).toBeNull();
    expect(parseGithubUrl("not a url")).toBeNull();
    expect(parseGithubUrl("")).toBeNull();
    expect(parseGithubUrl(null)).toBeNull();
  });
});

describe("extractHexColors", () => {
  it("finds, lowercases, expands, dedupes, caps at 6", () => {
    expect(extractHexColors("brand #6366F1 and #10B981")).toEqual(["#6366f1", "#10b981"]);
    expect(extractHexColors("#fff on #000")).toEqual(["#ffffff", "#000000"]);
    expect(extractHexColors("#6366f1 #6366f1 #6366F1")).toEqual(["#6366f1"]);
    expect(extractHexColors("#111111 #222222 #333333 #444444 #555555 #666666 #777777")).toHaveLength(6);
    expect(extractHexColors("no colors")).toEqual([]);
  });
});

describe("aiGradientCss", () => {
  it("builds linear with angle + stops, no data uri", () => {
    const css = aiGradientCss({ style: "linear", angle: 120, stops: ["#ff0000", "#00ff00"] });
    expect(css).toContain("linear-gradient(120deg");
    expect(css).toContain("#ff0000");
    expect(css).not.toContain("data:");
  });
  it("builds mesh from radials over a base, defaults angle", () => {
    const css = aiGradientCss({ style: "mesh", stops: ["#ff0000", "#00ff00", "#0000ff"] });
    expect(css).toContain("radial-gradient");
    expect(css).toContain("linear-gradient(135deg");
    for (const c of ["#ff0000", "#00ff00", "#0000ff"]) expect(css).toContain(c);
  });
});

describe("normalizeConcept", () => {
  const good = { name: "Calm Indigo", rationale: "fits", style: "linear", angle: 135, stops: ["#6366f1", "#8b5cf6"], suggestedTextColor: "#ffffff" };
  it("passes valid, defaults missing, rejects bad stops, clamps angle", () => {
    expect(normalizeConcept(good)).toMatchObject(good);
    const c = normalizeConcept({ name: "x", rationale: "y", stops: ["#111111", "#222222"] });
    expect(c.style).toBe("linear");
    expect(c.angle).toBe(135);
    expect(c.suggestedTextColor).toBe("#ffffff");
    expect(normalizeConcept({ name: "x", stops: ["#111111"] })).toBeNull();
    expect(normalizeConcept({ name: "x", stops: ["nope", "alsono"] })).toBeNull();
    expect(normalizeConcept({ ...good, angle: 999 }).angle).toBeLessThanOrEqual(360);
    expect(normalizeConcept({ ...good, angle: -10 }).angle).toBeGreaterThanOrEqual(0);
  });
});

describe("parseConcepts", () => {
  const two = JSON.stringify([
    { name: "A", rationale: "ra", style: "linear", angle: 90, stops: ["#111111", "#222222"], suggestedTextColor: "#ffffff" },
    { name: "B", rationale: "rb", style: "mesh", angle: 45, stops: ["#333333", "#444444"], suggestedTextColor: "#000000" },
  ]);
  it("parses plain, fenced, clamps >2, throws <2", () => {
    expect(parseConcepts(two)).toHaveLength(2);
    expect(parseConcepts("```json\n" + two + "\n```")).toHaveLength(2);
    const three = JSON.parse(two);
    three.push({ name: "C", rationale: "rc", stops: ["#555555", "#666666"] });
    expect(parseConcepts(JSON.stringify(three))).toHaveLength(2);
    expect(() => parseConcepts(JSON.stringify([{ name: "x" }]))).toThrow();
    expect(() => parseConcepts("not json")).toThrow();
  });
});

describe("buildPrompt", () => {
  it("includes repo context and user direction", () => {
    const p = buildPrompt({
      repoContext: { name: "myapp", description: "cool", topics: ["a"], language: "JS", hexColors: ["#111111"], readme: "hi" },
      prompt: "dark premium",
    });
    expect(p).toContain("myapp");
    expect(p).toContain("dark premium");
    expect(p).toContain("JSON array of 2");
  });
  it("works with prompt only", () => {
    const p = buildPrompt({ repoContext: null, prompt: "calm" });
    expect(p).toContain("calm");
    expect(p).not.toContain("PROJECT CONTEXT");
  });
});
