import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseGithubUrl,
  extractHexColors,
  aiGradientCss,
  normalizeConcept,
  parseConcepts,
  fetchRepoContext,
  suggestBackgrounds,
  generateImage,
} from "../aiBackground.js";

describe("parseGithubUrl", () => {
  it("parses a standard https URL", () => {
    expect(parseGithubUrl("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });
  it("strips a trailing slash", () => {
    expect(parseGithubUrl("https://github.com/owner/repo/")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });
  it("strips a .git suffix", () => {
    expect(parseGithubUrl("https://github.com/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });
  it("ignores deep paths", () => {
    expect(parseGithubUrl("https://github.com/owner/repo/tree/main/src")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });
  it("accepts www and http", () => {
    expect(parseGithubUrl("http://www.github.com/a/b")).toEqual({ owner: "a", repo: "b" });
  });
  it("accepts owner/repo shorthand", () => {
    expect(parseGithubUrl("owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });
  it("returns null for non-github urls", () => {
    expect(parseGithubUrl("https://gitlab.com/a/b")).toBeNull();
    expect(parseGithubUrl("not a url")).toBeNull();
    expect(parseGithubUrl("")).toBeNull();
    expect(parseGithubUrl(null)).toBeNull();
  });
});

describe("extractHexColors", () => {
  it("finds 6-digit hex and lowercases", () => {
    expect(extractHexColors("brand #6366F1 and #10B981")).toEqual(["#6366f1", "#10b981"]);
  });
  it("expands 3-digit hex", () => {
    expect(extractHexColors("#fff on #000")).toEqual(["#ffffff", "#000000"]);
  });
  it("dedupes", () => {
    expect(extractHexColors("#6366f1 #6366f1 #6366F1")).toEqual(["#6366f1"]);
  });
  it("caps at 6", () => {
    const txt = "#111111 #222222 #333333 #444444 #555555 #666666 #777777 #888888";
    expect(extractHexColors(txt)).toHaveLength(6);
  });
  it("returns [] when none", () => {
    expect(extractHexColors("no colors here")).toEqual([]);
    expect(extractHexColors("")).toEqual([]);
  });
});

describe("aiGradientCss", () => {
  it("builds a linear gradient with the angle and every stop", () => {
    const css = aiGradientCss({ style: "linear", angle: 120, stops: ["#ff0000", "#00ff00"] });
    expect(css).toContain("linear-gradient(120deg");
    expect(css).toContain("#ff0000");
    expect(css).toContain("#00ff00");
    expect(css).not.toContain("data:");
  });
  it("builds a mesh from radial gradients over a base", () => {
    const css = aiGradientCss({ style: "mesh", angle: 135, stops: ["#ff0000", "#00ff00", "#0000ff"] });
    expect(css).toContain("radial-gradient");
    expect(css).toContain("linear-gradient");
    // every stop color appears somewhere
    for (const c of ["#ff0000", "#00ff00", "#0000ff"]) expect(css).toContain(c);
    expect(css).not.toContain("data:");
  });
  it("defaults the angle when missing", () => {
    const css = aiGradientCss({ style: "linear", stops: ["#111111", "#222222"] });
    expect(css).toContain("135deg");
  });
});

describe("normalizeConcept", () => {
  const good = {
    name: "Calm Indigo",
    rationale: "matches the brand",
    style: "linear",
    angle: 135,
    stops: ["#6366f1", "#8b5cf6"],
    suggestedTextColor: "#ffffff",
  };
  it("passes a valid concept through", () => {
    expect(normalizeConcept(good)).toMatchObject(good);
  });
  it("defaults angle, style, and text color", () => {
    const c = normalizeConcept({ name: "x", rationale: "y", stops: ["#111111", "#222222"] });
    expect(c.style).toBe("linear");
    expect(c.angle).toBe(135);
    expect(c.suggestedTextColor).toBe("#ffffff");
  });
  it("rejects concepts without >=2 valid hex stops", () => {
    expect(normalizeConcept({ name: "x", rationale: "y", stops: ["#111111"] })).toBeNull();
    expect(normalizeConcept({ name: "x", rationale: "y", stops: ["nope", "alsono"] })).toBeNull();
    expect(normalizeConcept({ name: "x", rationale: "y" })).toBeNull();
  });
  it("clamps angle into 0-360", () => {
    expect(normalizeConcept({ ...good, angle: 999 }).angle).toBeLessThanOrEqual(360);
    expect(normalizeConcept({ ...good, angle: -10 }).angle).toBeGreaterThanOrEqual(0);
  });
});

describe("parseConcepts", () => {
  const two = JSON.stringify([
    { name: "A", rationale: "ra", style: "linear", angle: 90, stops: ["#111111", "#222222"], suggestedTextColor: "#ffffff" },
    { name: "B", rationale: "rb", style: "mesh", angle: 45, stops: ["#333333", "#444444"], suggestedTextColor: "#000000" },
  ]);
  it("parses a plain JSON array", () => {
    const out = parseConcepts(two);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("A");
  });
  it("strips ```json fences", () => {
    const out = parseConcepts("```json\n" + two + "\n```");
    expect(out).toHaveLength(2);
  });
  it("clamps more than 2 to the first 2 valid", () => {
    const three = JSON.parse(two);
    three.push({ name: "C", rationale: "rc", stops: ["#555555", "#666666"] });
    const out = parseConcepts(JSON.stringify(three));
    expect(out).toHaveLength(2);
  });
  it("throws when fewer than 2 valid concepts", () => {
    expect(() => parseConcepts(JSON.stringify([{ name: "x" }]))).toThrow();
    expect(() => parseConcepts("not json")).toThrow();
  });
});

describe("network wrappers (stubbed fetch)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fetchRepoContext maps repo + readme", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/readme")) {
        return { ok: true, status: 200, text: async () => "# Title\nbrand color #6366f1" };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: "myapp",
          description: "a cool app",
          topics: ["react", "mobile"],
          language: "JavaScript",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = await fetchRepoContext("https://github.com/owner/repo");
    expect(ctx.name).toBe("myapp");
    expect(ctx.description).toBe("a cool app");
    expect(ctx.topics).toContain("react");
    expect(ctx.language).toBe("JavaScript");
    expect(ctx.readme).toContain("Title");
    expect(ctx.hexColors).toContain("#6366f1");
  });

  it("fetchRepoContext throws github-not-found on 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    await expect(fetchRepoContext("https://github.com/owner/repo")).rejects.toThrow(/github-not-found/);
  });

  it("fetchRepoContext throws github-rate-limit on 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    await expect(fetchRepoContext("https://github.com/owner/repo")).rejects.toThrow(/github-rate-limit/);
  });

  it("fetchRepoContext throws on a bad url", async () => {
    await expect(fetchRepoContext("not a github url")).rejects.toThrow();
  });

  it("suggestBackgrounds posts to anthropic and returns 2 concepts", async () => {
    vi.stubEnv("VITE_ANTHROPIC_API_KEY", "sk-test");
    const body = JSON.stringify([
      { name: "A", rationale: "ra", style: "linear", angle: 90, stops: ["#111111", "#222222"], suggestedTextColor: "#ffffff" },
      { name: "B", rationale: "rb", style: "mesh", angle: 45, stops: ["#333333", "#444444"], suggestedTextColor: "#000000" },
    ]);
    const fetchMock = vi.fn(async (url, opts) => {
      expect(url).toContain("api.anthropic.com");
      expect(opts.headers["x-api-key"]).toBe("sk-test");
      expect(opts.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: body }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await suggestBackgrounds({ prompt: "dark premium" });
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("A");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("suggestBackgrounds throws when no key", async () => {
    vi.stubEnv("VITE_ANTHROPIC_API_KEY", "");
    await expect(suggestBackgrounds({ prompt: "x" })).rejects.toThrow();
  });

  it("generateImage throws when no image provider key", async () => {
    vi.stubEnv("VITE_OPENAI_API_KEY", "");
    vi.stubEnv("VITE_STABILITY_API_KEY", "");
    await expect(
      generateImage({ concept: { name: "A" }, prompt: "x" })
    ).rejects.toThrow();
  });
});
