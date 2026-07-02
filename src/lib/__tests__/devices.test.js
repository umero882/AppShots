import { describe, it, expect } from "vitest";
import { DEVICES, getDevice, STORES } from "../devices.js";

describe("devices", () => {
  it("offers a healthy spread of iOS and Android devices", () => {
    expect(DEVICES.length).toBeGreaterThanOrEqual(8);
    expect(DEVICES.filter((d) => d.store === "ios").length).toBeGreaterThanOrEqual(4);
    expect(DEVICES.filter((d) => d.store === "android").length).toBeGreaterThanOrEqual(3);
  });
  it("every device has the required frame fields and a valid store", () => {
    for (const d of DEVICES) {
      expect(d.id && d.name).toBeTruthy();
      expect(d.canvas.w).toBeGreaterThan(0);
      expect(d.canvas.h).toBeGreaterThan(0);
      expect(STORES[d.store]).toBeTruthy();
      expect(typeof d.buttons).toBe("boolean");
      expect(["dynamic-island", "notch", "punch-hole", "none"]).toContain(d.notch);
    }
  });
  it("device ids are unique", () => {
    const ids = DEVICES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("tablets omit side buttons", () => {
    expect(getDevice("ipad-13").buttons).toBe(false);
    expect(getDevice("android-tablet").buttons).toBe(false);
  });
  it("getDevice falls back to the first device for an unknown id", () => {
    expect(getDevice("nope")).toBe(DEVICES[0]);
  });
});

describe("store screenshot-spec compliance", () => {
  // Apple App Store Connect accepted portrait screenshot dimensions (2025/26).
  const APPLE_OK = new Set([
    "1290x2796", "1320x2868", // iPhone 6.9"
    "1242x2688", "1284x2778", // iPhone 6.5"
    "1242x2208",              // iPhone 5.5"
    "2064x2752", "2048x2732", // iPad 13" / 12.9"
    "1668x2388", "1640x2360", // iPad 11"
  ]);
  const dim = (d) => `${d.canvas.w}x${d.canvas.h}`;

  it("every iOS device is an Apple-accepted screenshot size", () => {
    for (const d of DEVICES.filter((x) => x.store === "ios")) {
      expect(APPLE_OK.has(dim(d)), `${d.name} (${dim(d)}) is not an accepted App Store size`).toBe(true);
    }
  });

  it("no longer offers the invalid iPhone 6.1\" (1179×2556) upload size", () => {
    expect(DEVICES.some((d) => dim(d) === "1179x2556")).toBe(false);
  });

  it("includes the now-required iPhone 6.9\" and iPad 13\" sizes", () => {
    const ios = DEVICES.filter((d) => d.store === "ios").map(dim);
    expect(ios).toContain("1290x2796"); // 6.9"
    expect(ios).toContain("2064x2752"); // iPad 13"
  });

  it("every Android device fits Google Play's 320–3840px bounds", () => {
    for (const d of DEVICES.filter((x) => x.store === "android")) {
      for (const side of [d.canvas.w, d.canvas.h]) {
        expect(side).toBeGreaterThanOrEqual(320);
        expect(side).toBeLessThanOrEqual(3840);
      }
    }
  });

  it("every Android device stays within Google Play's 2:1 max aspect ratio", () => {
    // "The maximum dimension of your screenshot can't be more than twice as long
    // as the minimum dimension." Screenshots exceeding 2:1 are rejected.
    for (const d of DEVICES.filter((x) => x.store === "android")) {
      const { w, h } = d.canvas;
      const ratio = Math.max(w, h) / Math.min(w, h);
      expect(ratio, `${d.name} (${w}x${h}) exceeds Google Play's 2:1 aspect limit`).toBeLessThanOrEqual(2);
    }
  });
});
