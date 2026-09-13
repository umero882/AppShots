import { describe, it, expect, vi, afterEach } from "vitest";
import { suggestCopy, shrinkForVision, COPY_TONES } from "../aiCopy.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("aiCopy client (talks to /api proxy, no keys)", () => {
  it("re-exports the tone presets", () => {
    expect(COPY_TONES.map((t) => t.id)).toContain("punchy");
  });

  it("suggestCopy POSTs to /api/ai/copy with the brief, tone, mode and screens", async () => {
    const payload = { ideas: [{ heading: "Sleep better", subheading: "Track every night." }], mode: "screen", count: 4 };
    const fetchMock = vi.fn(async (path, opts) => {
      expect(path).toBe("/api/ai/copy");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body).toMatchObject({
        appName: "Nod",
        brief: "sleep tracker",
        tone: "friendly",
        language: "Spanish",
        mode: "set",
        activeIndex: 1,
        screens: [{ heading: "A", subheading: "" }],
      });
      // No screenshot → the key is absent, not null, so the server's string
      // check sees "no image" rather than a wrong type.
      expect("image" in body).toBe(false);
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await suggestCopy({
      appName: "Nod",
      brief: "sleep tracker",
      tone: "friendly",
      language: "Spanish",
      mode: "set",
      activeIndex: 1,
      screens: [{ heading: "A", subheading: "" }],
    });
    expect(out.ideas).toHaveLength(1);
  });

  it("suggestCopy sends the screenshot when one is given", async () => {
    const fetchMock = vi.fn(async (path, opts) => {
      expect(JSON.parse(opts.body).image).toBe("data:image/jpeg;base64,AAAA");
      return { ok: true, json: async () => ({ ideas: [], mode: "screen", count: 4 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    await suggestCopy({ brief: "x", image: "data:image/jpeg;base64,AAAA" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("suggestCopy surfaces the server's error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "quota-exceeded", kind: "copy" }) })));
    await expect(suggestCopy({ brief: "x" })).rejects.toMatchObject({ code: "quota-exceeded", info: { kind: "copy" } });
  });
});

describe("shrinkForVision", () => {
  it("resolves null for a non-image or missing data URL", async () => {
    expect(await shrinkForVision(null)).toBeNull();
    expect(await shrinkForVision("")).toBeNull();
    expect(await shrinkForVision("data:text/plain;base64,QQ==")).toBeNull();
    expect(await shrinkForVision("https://example.com/a.png")).toBeNull();
  });

  it("resolves null without a DOM instead of throwing (the caller writes from the brief alone)", async () => {
    // vitest runs these in Node: no document, no Image.
    expect(typeof document).toBe("undefined");
    expect(await shrinkForVision("data:image/png;base64,iVBORw0KGgo=")).toBeNull();
  });
});
