import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { capabilities, suggest, image, search } from "./handlers.js";

const ANTHROPIC_BODY = JSON.stringify([
  { name: "A", rationale: "ra", style: "linear", angle: 90, stops: ["#111111", "#222222"], suggestedTextColor: "#ffffff" },
  { name: "B", rationale: "rb", style: "mesh", angle: 45, stops: ["#333333", "#444444"], suggestedTextColor: "#000000" },
]);

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("capabilities", () => {
  it("reflects which server env keys are present", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GITHUB_TOKEN", "g");
    vi.stubEnv("PEXELS_API_KEY", "");
    vi.stubEnv("STABILITY_API_KEY", "");
    expect(capabilities()).toEqual({ ai: true, image: false, github: true, pexels: false });
  });
});

describe("suggest", () => {
  it("throws no-llm-key without the Anthropic key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(suggest({ prompt: "x" })).rejects.toThrow(/no-llm-key/);
  });

  it("returns 2 concepts from the prompt alone (no repo)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchMock = vi.fn(async (url, opts) => {
      expect(url).toContain("api.anthropic.com");
      expect(opts.headers["x-api-key"]).toBe("sk-test");
      // server proxy must NOT use the browser-direct header
      expect(opts.headers["anthropic-dangerous-direct-browser-access"]).toBeUndefined();
      return { ok: true, json: async () => ({ content: [{ type: "text", text: ANTHROPIC_BODY }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await suggest({ prompt: "dark premium" });
    expect(out.concepts).toHaveLength(2);
    expect(out.repoNotice).toBeNull();
  });

  it("sets repoNotice=github-private on a private 404 (no token) but still returns concepts", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("GITHUB_TOKEN", "");
    const fetchMock = vi.fn(async (url) => {
      if (url.includes("api.github.com")) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, json: async () => ({ content: [{ type: "text", text: ANTHROPIC_BODY }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await suggest({ url: "https://github.com/o/private", prompt: "x" });
    expect(out.repoNotice).toBe("github-private");
    expect(out.concepts).toHaveLength(2);
  });

  it("sends the GitHub token header when GITHUB_TOKEN is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("GITHUB_TOKEN", "ghp_x");
    const auths = [];
    const fetchMock = vi.fn(async (url, opts) => {
      if (url.includes("api.github.com")) {
        auths.push(opts.headers.Authorization);
        if (url.endsWith("/readme")) return { ok: true, text: async () => "# r" };
        return { ok: true, json: async () => ({ name: "r", topics: [] }) };
      }
      return { ok: true, json: async () => ({ content: [{ type: "text", text: ANTHROPIC_BODY }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    await suggest({ url: "https://github.com/o/r", prompt: "x" });
    expect(auths).toContain("Bearer ghp_x");
  });
});

describe("image", () => {
  it("throws no-image-key without an image provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("STABILITY_API_KEY", "");
    await expect(image({ concept: { name: "A" } })).rejects.toThrow(/no-image-key/);
  });

  it("returns a data url from OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-img");
    const fetchMock = vi.fn(async (url, opts) => {
      expect(url).toContain("openai.com");
      expect(opts.headers.Authorization).toBe("Bearer sk-img");
      return { ok: true, json: async () => ({ data: [{ b64_json: "ABC" }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await image({ concept: { name: "A" }, prompt: "x" });
    expect(out.image).toBe("data:image/png;base64,ABC");
  });
});

describe("search", () => {
  it("uses Pexels when keyed and maps results", async () => {
    vi.stubEnv("PEXELS_API_KEY", "px");
    const fetchMock = vi.fn(async (url, opts) => {
      expect(url).toContain("api.pexels.com");
      expect(opts.headers.Authorization).toBe("px");
      return { ok: true, json: async () => ({ photos: [{ id: 1, alt: "cat", src: { medium: "m", original: "o" } }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await search("cat");
    expect(out.provider).toBe("Pexels");
    expect(out.results[0]).toMatchObject({ id: "1", thumb: "m", title: "cat" });
  });

  it("falls back to Openverse without a Pexels key", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    const fetchMock = vi.fn(async (url) => {
      expect(url).toContain("openverse.org");
      return { ok: true, json: async () => ({ results: [{ id: "x", thumbnail: "t", title: "cat" }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await search("cat");
    expect(out.provider).toBe("Openverse");
    expect(out.results[0].thumb).toBe("t");
  });

  it("returns empty results for a blank term without calling fetch", async () => {
    vi.stubEnv("PEXELS_API_KEY", "px");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await search("   ");
    expect(out.results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
