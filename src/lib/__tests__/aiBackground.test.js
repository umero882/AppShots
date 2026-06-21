import { describe, it, expect, vi, afterEach } from "vitest";
import { getCapabilities, suggestBackgrounds, generateImage, aiGradientCss } from "../aiBackground.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("aiBackground client (talks to /api proxy, no keys)", () => {
  it("re-exports the pure aiGradientCss helper", () => {
    expect(aiGradientCss({ style: "linear", stops: ["#111111", "#222222"] })).toContain("linear-gradient");
  });

  it("suggestBackgrounds POSTs to /api/ai/suggest and returns {concepts, repoNotice}", async () => {
    const payload = { concepts: [{ name: "A" }, { name: "B" }], repoNotice: null };
    const fetchMock = vi.fn(async (path, opts) => {
      expect(path).toBe("/api/ai/suggest");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toMatchObject({ prompt: "dark" });
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await suggestBackgrounds({ url: "", prompt: "dark", model: "m" });
    expect(out.concepts).toHaveLength(2);
    expect(out.repoNotice).toBeNull();
  });

  it("suggestBackgrounds throws the server error code on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "no-llm-key" }) })));
    await expect(suggestBackgrounds({ prompt: "x" })).rejects.toThrow(/no-llm-key/);
  });

  it("generateImage POSTs to /api/ai/image and returns the data url", async () => {
    const fetchMock = vi.fn(async (path) => {
      expect(path).toBe("/api/ai/image");
      return { ok: true, json: async () => ({ image: "data:image/png;base64,XXX" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const url = await generateImage({ concept: { name: "A" }, prompt: "x" });
    expect(url).toBe("data:image/png;base64,XXX");
  });

  it("getCapabilities fetches /api/capabilities and caches the result", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ai: true, image: false, github: true, pexels: false }) }));
    vi.stubGlobal("fetch", fetchMock);
    // fresh module so the cache starts empty
    const mod = await import("../aiBackground.js?caps-test");
    const a = await mod.getCapabilities();
    const b = await mod.getCapabilities();
    expect(a.ai).toBe(true);
    expect(b).toBe(a); // same cached promise result
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
