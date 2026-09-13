import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { capabilities, suggest, image, search, copy, statusForError } from "./handlers.js";

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

describe("copy", () => {
  const IDEAS = JSON.stringify([
    { heading: "Sleep better", subheading: "Track every night." },
    { heading: "Wake up rested", subheading: "" },
    { heading: "Know your rhythm", subheading: "See the pattern in a week." },
    { heading: "Nights, decoded", subheading: "" },
  ]);
  const claudeOk = (text) => ({ ok: true, json: async () => ({ content: [{ type: "text", text }] }) });

  it("throws no-llm-key without the Anthropic key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(copy({ brief: "x" })).rejects.toThrow("no-llm-key");
  });

  it("returns 4 ideas for one screen from a brief, text-only", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchMock = vi.fn(async (url, opts) => {
      expect(url).toContain("api.anthropic.com");
      expect(opts.headers["x-api-key"]).toBe("sk-test");
      const body = JSON.parse(opts.body);
      const content = body.messages[0].content;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      expect(content[0].text).toContain("a sleep tracker");
      expect(content[0].text).toContain("exactly 4 objects");
      return claudeOk(IDEAS);
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await copy({ brief: "a sleep tracker", tone: "friendly", language: "English" });
    expect(out).toMatchObject({ mode: "screen", count: 4 });
    expect(out.ideas).toHaveLength(4);
    expect(out.ideas[0]).toEqual({ heading: "Sleep better", subheading: "Track every night." });
  });

  it("set mode asks for one idea per screen and returns exactly that many", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchMock = vi.fn(async (url, opts) => {
      const text = JSON.parse(opts.body).messages[0].content[0].text;
      expect(text).toContain("EACH of the 2 screens");
      return claudeOk(IDEAS); // 4 given, only 2 wanted
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await copy({ brief: "x", mode: "set", screens: [{ heading: "A" }, { heading: "B" }] });
    expect(out).toMatchObject({ mode: "set", count: 2 });
    expect(out.ideas).toHaveLength(2);
  });

  it("attaches a valid screenshot as an image block before the text", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchMock = vi.fn(async (url, opts) => {
      const content = JSON.parse(opts.body).messages[0].content;
      expect(content).toHaveLength(2);
      expect(content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
      expect(content[1].text).toContain("screenshot of the screen is attached");
      return claudeOk(IDEAS);
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await copy({ image: "data:image/jpeg;base64,AAAA" });
    expect(out.ideas).toHaveLength(4);
  });

  it("refuses an unsupported or oversized image before spending a request", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(copy({ brief: "x", image: "data:image/svg+xml;base64,AAAA" })).rejects.toThrow("copy-image-invalid");
    await expect(copy({ brief: "x", image: "https://evil.example/a.png" })).rejects.toThrow("copy-image-invalid");
    await expect(copy({ brief: "x", image: "data:image/png;base64," + "A".repeat(2_000_001) })).rejects.toThrow("copy-image-too-large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a call with nothing to write from", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(copy({})).rejects.toThrow("copy-no-context");
    await expect(copy({ brief: "   ", screens: [{ heading: "" }] })).rejects.toThrow("copy-no-context");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("existing copy on the set is enough context on its own", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubGlobal("fetch", vi.fn(async () => claudeOk(IDEAS)));
    const out = await copy({ screens: [{ heading: "Sleep better" }] });
    expect(out.ideas).toHaveLength(4);
  });

  it("retries once with a stricter nudge when the first answer does not parse", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const texts = [];
    const fetchMock = vi.fn(async (url, opts) => {
      texts.push(JSON.parse(opts.body).messages[0].content[0].text);
      return claudeOk(texts.length === 1 ? "Happy to help! Here are some ideas" : IDEAS);
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await copy({ brief: "x" });
    expect(out.ideas).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(texts[1]).toContain("ONLY the JSON array");
  });

  it("maps an upstream failure to llm-error without retrying", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(copy({ brief: "x" })).rejects.toThrow("llm-error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clamps junk input: unknown tone/mode, out-of-range index, oversized lists", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchMock = vi.fn(async (url, opts) => {
      const text = JSON.parse(opts.body).messages[0].content[0].text;
      expect(text).toContain("VOICE: Punchy");
      expect(text).toContain("THE SET (12 screens");
      expect(text).toContain("options for screen 12"); // index 99 → last screen
      return claudeOk(IDEAS);
    });
    vi.stubGlobal("fetch", fetchMock);
    const screens = Array.from({ length: 30 }, (_, i) => ({ heading: `H${i}` }));
    const out = await copy({ brief: "x", tone: "shouty", mode: "banana", activeIndex: 99, screens });
    expect(out.mode).toBe("screen");
  });
});

describe("statusForError — copywriter codes", () => {
  it("blames the client for missing context or a bad image, and 413 for a huge one", () => {
    expect(statusForError("copy-no-context")).toBe(400);
    expect(statusForError("copy-image-invalid")).toBe(400);
    expect(statusForError("copy-image-too-large")).toBe(413);
  });
});
