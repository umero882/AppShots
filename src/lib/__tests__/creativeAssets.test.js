import { describe, it, expect } from "vitest";
import {
  DEVICES, CREATIVE_FORMATS, getDevice, isCreative, mockupDeviceId, textBaseOf, creativeGroup,
} from "../devices.js";
import {
  orientedCanvas, mockupBase, safeAreaPct, creativeReelHold, screenDevices,
} from "../deviceLayout.js";
import { buildTimeline, videoSize } from "../video.js";
import { applyTemplateStyle } from "../galleryTemplates.js";

// App Store Connect → Product Page Information → Header and Search Results
// (iOS 27). Exact sizes from Apple's creative-assets specifications page.
const dim = (d) => `${d.canvas.w}x${d.canvas.h}`;

describe("App Store creative-asset formats", () => {
  it("ships Apple's exact header, search-results and universal sizes", () => {
    const dims = CREATIVE_FORMATS.map(dim);
    expect(dims).toContain("3840x1646"); // header 21:9
    expect(dims).toContain("3840x2560"); // search results 3:2 (max)
    expect(dims).toContain("1920x1280"); // search results 3:2 (min)
    expect(dims).toContain("5244x2950"); // universal 16:9
  });

  it("matches each placement's aspect ratio", () => {
    expect(getDevice("aso-header").canvas.w / getDevice("aso-header").canvas.h).toBeCloseTo(21 / 9, 2);
    expect(getDevice("aso-search").canvas.w / getDevice("aso-search").canvas.h).toBeCloseTo(3 / 2, 5);
    expect(getDevice("aso-search-min").canvas.w / getDevice("aso-search-min").canvas.h).toBeCloseTo(3 / 2, 5);
    expect(getDevice("aso-universal").canvas.w / getDevice("aso-universal").canvas.h).toBeCloseTo(16 / 9, 2);
  });

  it("keeps every safe area inside its canvas and horizontally centered", () => {
    for (const d of CREATIVE_FORMATS) {
      const s = d.safe;
      expect(s.x).toBeGreaterThan(0);
      expect(s.y).toBeGreaterThan(0);
      expect(s.x + s.w).toBeLessThan(d.canvas.w);
      expect(s.y + s.h).toBeLessThan(d.canvas.h);
      expect(Math.abs(s.x + s.w / 2 - d.canvas.w / 2)).toBeLessThanOrEqual(2);
    }
  });

  it("only the universal 16:9 is PNG-only and image-only", () => {
    expect(getDevice("aso-universal").pngOnly).toBe(true);
    expect(getDevice("aso-universal").video).toBeNull();
    for (const id of ["aso-header", "aso-search", "aso-search-min"]) {
      expect(getDevice(id).pngOnly).toBeFalsy();
      expect(getDevice(id).video).toBeTruthy();
    }
  });

  it("are not device mockups (never offered as 'Add device', never in DEVICES)", () => {
    for (const d of CREATIVE_FORMATS) expect(DEVICES.some((x) => x.id === d.id)).toBe(false);
  });

  it("getDevice / isCreative resolve them; unknown ids still fall back", () => {
    expect(getDevice("aso-header").kind).toBe("creative");
    expect(isCreative("aso-header")).toBe(true);
    expect(isCreative(getDevice("aso-universal"))).toBe(true);
    expect(isCreative("iphone-69")).toBe(false);
    expect(isCreative(undefined)).toBe(false);
    expect(getDevice("nope")).toBe(DEVICES[0]);
  });

  it("each default mockup is a real device", () => {
    for (const d of CREATIVE_FORMATS) expect(DEVICES.some((x) => x.id === d.mockup)).toBe(true);
  });
});

describe("creative canvas layout", () => {
  it("never swaps the canvas for landscape", () => {
    const h = getDevice("aso-header");
    expect(orientedCanvas(h, "landscape")).toEqual({ w: 3840, h: 1646 });
    // store screenshots still swap
    expect(orientedCanvas(getDevice("iphone-69"), "landscape")).toEqual({ w: 2796, h: 1290 });
  });

  it("draws the mockup as a phone, honoring the project pick", () => {
    expect(mockupDeviceId({ deviceId: "aso-header" })).toBe("iphone-69");
    expect(mockupDeviceId({ deviceId: "aso-header", mockupDeviceId: "pixel-8" })).toBe("pixel-8");
    // a stale / creative id is never used as a mockup
    expect(mockupDeviceId({ deviceId: "aso-header", mockupDeviceId: "aso-search" })).toBe("iphone-69");
    // store screenshots: the mockup IS the output device
    expect(mockupDeviceId({ deviceId: "ipad-13", mockupDeviceId: "pixel-8" })).toBe("ipad-13");
  });

  it("the legacy single mockup on a banner is an upright phone", () => {
    const [inst] = screenDevices({ image: null }, { deviceId: "aso-header", orientation: "landscape", deviceScale: 0.78 });
    expect(inst.deviceId).toBe("iphone-69");
    expect(inst.orientation).toBe("portrait");
  });

  it("sizes mockups from the banner height (width basis unchanged for screenshots)", () => {
    const h = getDevice("aso-header");
    expect(mockupBase(h, 1000, 428)).toBeCloseTo(428 * h.mockupK);
    expect(mockupBase(getDevice("iphone-69"), 300, 650)).toBe(300);
  });

  it("measures text against a per-format base so headlines stay legible", () => {
    expect(textBaseOf(getDevice("iphone-69"))).toBe(1290);
    for (const d of CREATIVE_FORMATS) expect(textBaseOf(d)).toBeLessThan(d.canvas.w);
  });

  it("safeAreaPct converts the template rect to CSS percentages", () => {
    const p = safeAreaPct(getDevice("aso-search"));
    expect(parseFloat(p.left)).toBeCloseTo((836 / 3840) * 100, 5);
    expect(parseFloat(p.height)).toBeCloseTo((1030 / 2560) * 100, 5);
    expect(safeAreaPct(getDevice("iphone-69"))).toBeNull();
  });
});

describe("creative-asset video", () => {
  it("records at the exact placement size", () => {
    const h = getDevice("aso-header");
    expect(videoSize(h.canvas.w, h.canvas.h, h.video.maxLong)).toEqual({ width: 3840, height: 1646 });
    const s = getDevice("aso-search");
    expect(videoSize(s.canvas.w, s.canvas.h, s.video.maxLong)).toEqual({ width: 1920, height: 1280 });
  });

  it("keeps reels inside Apple's 5–30 s window for any screen count", () => {
    for (const n of [1, 2, 3, 5, 8, 10, 20]) {
      const per = creativeReelHold(n);
      const tl = buildTimeline(n, { perScreenMs: per, transitionMs: 600 });
      expect(tl.total).toBeGreaterThanOrEqual(5000 - 1);
      expect(tl.total).toBeLessThanOrEqual(30000 + 1);
    }
  });
});

describe("restyling a creative asset from a template", () => {
  const template = { style: { deviceId: "pixel-8", layoutId: "classic", deviceScale: 0.7, background: {}, text: {} } };
  it("keeps the banner canvas and adopts the template's device as the mockup", () => {
    const next = applyTemplateStyle({ deviceId: "aso-header", screens: [] }, template);
    expect(next.deviceId).toBe("aso-header");
    expect(next.mockupDeviceId).toBe("pixel-8");
  });
  it("switches device as before on a store screenshot", () => {
    const next = applyTemplateStyle({ deviceId: "iphone-69", screens: [] }, template);
    expect(next.deviceId).toBe("pixel-8");
    expect(next.mockupDeviceId).toBeUndefined();
  });
});

describe("In-App Event media", () => {
  it("ships the event card (16:9) and details page (9:16) at Apple's max sizes", () => {
    expect(dim(getDevice("iae-card"))).toBe("3840x2160");
    expect(dim(getDevice("iae-detail"))).toBe("2160x3840");
  });
  it("groups events apart from the header / search placements", () => {
    expect(creativeGroup("event").map((d) => d.id)).toEqual(["iae-card", "iae-detail"]);
    expect(creativeGroup("placement").map((d) => d.id)).toEqual(["aso-header", "aso-search", "aso-search-min", "aso-universal"]);
  });
  it("keeps the details page's safe area clear of the bottom overlay", () => {
    const d = getDevice("iae-detail");
    // the title / description / Get button cover ~510 px of 1920 → 1020 of 3840
    expect(d.canvas.h - (d.safe.y + d.safe.h)).toBeGreaterThanOrEqual(1020);
    expect(d.layout).toBe("column");
  });
  it("never swaps the portrait details page for landscape", () => {
    expect(orientedCanvas(getDevice("iae-detail"), "landscape")).toEqual({ w: 2160, h: 3840 });
  });
  it("records video at Apple's minimum event sizes", () => {
    for (const [id, want] of [["iae-card", { width: 1920, height: 1080 }], ["iae-detail", { width: 1080, height: 1920 }]]) {
      const d = getDevice(id);
      expect(videoSize(d.canvas.w, d.canvas.h, d.video.maxLong)).toEqual(want);
    }
  });
  it("keeps event reels inside 15–30 s", () => {
    for (const n of [1, 2, 3, 5, 8, 10]) {
      const per = creativeReelHold(n, { minMs: getDevice("iae-card").video.minMs });
      const tl = buildTimeline(n, { perScreenMs: per, transitionMs: 600 });
      expect(tl.total).toBeGreaterThanOrEqual(15000 - 1);
      expect(tl.total).toBeLessThanOrEqual(30000 + 1);
    }
  });
});
