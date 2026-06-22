import { describe, it, expect } from "vitest";
import {
  pickVideoMime, videoExtFor, videoSize, easeInOut, buildTimeline, frameState, kenBurns,
  VIDEO_MIME_CANDIDATES,
} from "../video.js";

describe("pickVideoMime", () => {
  it("prefers mp4/H.264 when supported", () => {
    expect(pickVideoMime((m) => m.startsWith("video/mp4"))).toBe("video/mp4;codecs=avc1.42E01E");
  });
  it("falls back to webm when mp4 is unsupported", () => {
    expect(pickVideoMime((m) => m.startsWith("video/webm"))).toBe("video/webm;codecs=vp9");
  });
  it("returns '' when nothing is supported", () => {
    expect(pickVideoMime(() => false)).toBe("");
  });
  it("swallows probe errors", () => {
    expect(pickVideoMime((m) => { if (m.includes("mp4")) throw new Error("x"); return m.includes("webm"); }))
      .toBe("video/webm;codecs=vp9");
  });
});

describe("videoExtFor", () => {
  it("maps mime to extension", () => {
    expect(videoExtFor("video/mp4;codecs=avc1")).toBe("mp4");
    expect(videoExtFor("video/webm;codecs=vp9")).toBe("webm");
  });
});

describe("videoSize", () => {
  it("caps the long side and keeps dimensions even", () => {
    const s = videoSize(1290, 2796, 1920);
    expect(s.height).toBe(1920);
    expect(s.width % 2).toBe(0);
    expect(s.width).toBeCloseTo(886, 0);
  });
  it("leaves small canvases untouched (but even)", () => {
    expect(videoSize(1080, 1920, 1920)).toEqual({ width: 1080, height: 1920 });
  });
});

describe("easeInOut", () => {
  it("is clamped and symmetric around 0.5", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(-5)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
});

describe("buildTimeline", () => {
  it("overlaps screens by the transition and totals correctly", () => {
    const tl = buildTimeline(3, { perScreenMs: 2500, transitionMs: 500 });
    expect(tl.segments[0]).toEqual({ index: 0, start: 0, end: 2500 });
    expect(tl.segments[1].start).toBe(2000); // 2500 - 500 overlap
    expect(tl.total).toBe(2500 + 2 * 2000);
  });
  it("clamps an over-long transition to half the hold", () => {
    expect(buildTimeline(2, { perScreenMs: 1000, transitionMs: 900 }).transitionMs).toBe(500);
  });
});

describe("frameState", () => {
  const tl = buildTimeline(2, { perScreenMs: 2000, transitionMs: 500 });
  it("fades the first screen in at the very start", () => {
    const f = frameState(tl, 0);
    expect(f).toHaveLength(1);
    expect(f[0].index).toBe(0);
    expect(f[0].alpha).toBe(0);
  });
  it("crossfades two screens during the overlap window", () => {
    // overlap is [1500, 2000]; midpoint 1750
    const f = frameState(tl, 1750);
    expect(f.map((x) => x.index)).toEqual([0, 1]);
    expect(f[0].alpha).toBeGreaterThan(0); // outgoing
    expect(f[1].alpha).toBeGreaterThan(0); // incoming
  });
  it("shows a single fully-opaque screen mid-hold", () => {
    const f = frameState(tl, 1000);
    expect(f).toHaveLength(1);
    expect(f[0].alpha).toBe(1);
  });
});

describe("kenBurns", () => {
  it("starts at scale 1 and zooms in over progress", () => {
    expect(kenBurns(0).scale).toBe(1);
    expect(kenBurns(1).scale).toBeGreaterThan(1);
    expect(kenBurns(1).panY).toBeLessThan(0);
  });
});

it("exposes mp4 before webm in the candidate order", () => {
  const firstMp4 = VIDEO_MIME_CANDIDATES.findIndex((m) => m.startsWith("video/mp4"));
  const firstWebm = VIDEO_MIME_CANDIDATES.findIndex((m) => m.startsWith("video/webm"));
  expect(firstMp4).toBeLessThan(firstWebm);
});
