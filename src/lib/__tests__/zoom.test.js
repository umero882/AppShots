import { describe, it, expect } from "vitest";
import { clampZoom, zoomIn, zoomOut, fitZoom, zoomLabel, ZOOM_MIN, ZOOM_MAX, ZOOM_STEPS, BASE_WIDTH } from "../zoom.js";

describe("zoom presets", () => {
  it("steps through the presets and stops at the ends", () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.8);
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
  });

  it("snaps an in-between value to the next preset either way", () => {
    expect(zoomIn(1.1)).toBe(1.25);
    expect(zoomOut(1.1)).toBe(1);
    expect(zoomIn(0.7)).toBe(0.8);
    expect(zoomOut(0.7)).toBe(0.67);
  });

  it("clamps and survives garbage", () => {
    expect(clampZoom(10)).toBe(ZOOM_MAX);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom("abc")).toBe(1);
    expect(clampZoom(undefined)).toBe(1);
    expect(ZOOM_STEPS).toContain(1);
  });

  it("labels as a whole percent", () => {
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(0.67)).toBe("67%");
    expect(zoomLabel(2.5)).toBe("250%");
  });
});

describe("fitZoom", () => {
  const aspect = 2796 / 1290; // iPhone 6.9" portrait

  it("is bound by height on a wide stage and by width on a narrow one", () => {
    const byH = fitZoom(1600, 96 + BASE_WIDTH * aspect * 2, aspect); // room for exactly 2× tall
    expect(byH).toBe(2);
    const byW = fitZoom(64 + BASE_WIDTH * 1.5, 5000, aspect); // room for exactly 1.5× wide
    expect(byW).toBe(1.5);
  });

  it("floors to a whole percent and respects the limits", () => {
    expect(fitZoom(64 + BASE_WIDTH * 1.237, 5000, aspect)).toBe(1.23);
    expect(fitZoom(100, 100, aspect)).toBe(ZOOM_MIN);
    expect(fitZoom(100000, 100000, aspect)).toBe(ZOOM_MAX);
  });

  it("honours custom padding", () => {
    expect(fitZoom(BASE_WIDTH + 20, 5000, aspect, { padX: 20, padY: 0 })).toBe(1);
  });
});
