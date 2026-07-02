import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appStore, statusForError } from "../handlers.js";

const sample = (over = {}) => ({
  trackId: 123,
  trackName: "Duolingo",
  artistName: "Duolingo, Inc.",
  artworkUrl512: "https://is.example/icon512.png",
  primaryGenreName: "Education",
  averageUserRating: 4.732,
  userRatingCount: 1500000,
  formattedPrice: "Free",
  version: "7.1.0",
  trackViewUrl: "https://apps.apple.com/us/app/duolingo/id570060128",
  screenshotUrls: ["https://is.example/s1.png", "https://is.example/s2.png"],
  ipadScreenshotUrls: ["https://is.example/ipad1.png"],
  ...over,
});

function mockFetch(payload, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(payload) });
}

describe("appStore handler", () => {
  beforeEach(() => { globalThis.fetch = mockFetch({ results: [sample()] }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("hits the iTunes search endpoint for a plain term", async () => {
    const out = await appStore({ q: "duolingo language app 2", country: "us" });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain("itunes.apple.com/search");
    expect(url).toContain("term=duolingo");
    expect(out.results[0].name).toBe("Duolingo");
    expect(out.results[0].rating).toBe(4.7); // rounded to 1dp
    expect(out.results[0].screenshots).toHaveLength(2);
  });

  it("uses the lookup endpoint when an App Store id/url is given", async () => {
    await appStore({ q: "https://apps.apple.com/us/app/x/id570060128" });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain("itunes.apple.com/lookup");
    expect(url).toContain("id=570060128");
  });

  it("normalizes country and defaults invalid ones to us", async () => {
    await appStore({ q: "notes", country: "ZZZ" });
    expect(globalThis.fetch.mock.calls[0][0]).toContain("country=us");
  });

  it("caches repeated identical queries (one upstream call)", async () => {
    await appStore({ q: "cache-me", country: "gb" });
    await appStore({ q: "cache-me", country: "gb" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty query", async () => {
    await expect(appStore({ q: "", id: "" })).rejects.toThrow("store-bad-query");
  });

  it("throws store-error on an upstream failure", async () => {
    globalThis.fetch = mockFetch({}, false);
    await expect(appStore({ q: "fresh-term-x" })).rejects.toThrow("store-error");
  });

  it("maps error codes to HTTP statuses", () => {
    expect(statusForError("store-bad-query")).toBe(400);
    expect(statusForError("store-error")).toBe(502);
  });
});
