import { describe, it, expect } from "vitest";
import { shade, mix, railGradient, familyOf, cameraType, frameSpec } from "../deviceFrames.js";

describe("mix", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
  });
  it("blends halfway", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("clamps out-of-range t", () => {
    expect(mix("#000000", "#ffffff", -1)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 2)).toBe("#ffffff");
  });
});
import { DEVICES, getDevice } from "../devices.js";

describe("shade", () => {
  it("lightens toward white and darkens toward black", () => {
    expect(shade("#808080", 1)).toBe("#ffffff");
    expect(shade("#808080", -1)).toBe("#000000");
    expect(shade("#000000", 0)).toBe("#000000");
  });
  it("expands 3-digit hex", () => {
    expect(shade("#abc", 0)).toBe("#aabbcc");
  });
});

describe("railGradient", () => {
  it("builds a 3-stop metal gradient containing the base color", () => {
    const g = railGradient("#54545a");
    expect(g).toContain("linear-gradient");
    expect(g).toContain("#54545a");
  });
});

describe("familyOf", () => {
  it("maps each catalog device to a sensible family", () => {
    expect(familyOf(getDevice("iphone-69"))).toBe("iphone");
    expect(familyOf(getDevice("iphone-55"))).toBe("iphone-classic"); // notch none
    expect(familyOf(getDevice("ipad-13"))).toBe("ipad");
    expect(familyOf(getDevice("pixel-8"))).toBe("pixel");
    expect(familyOf(getDevice("galaxy-s24"))).toBe("galaxy");
    expect(familyOf(getDevice("android-tablet"))).toBe("android-tablet");
    expect(familyOf(getDevice("android-phone"))).toBe("android-phone");
  });
  it("prefers an explicit family field", () => {
    expect(familyOf({ id: "iphone-69", family: "pixel" })).toBe("pixel");
  });
});

describe("cameraType", () => {
  it("derives the cutout from the notch + family", () => {
    expect(cameraType(getDevice("iphone-69"), "iphone")).toBe("island");
    expect(cameraType(getDevice("iphone-65"), "iphone")).toBe("notch");
    expect(cameraType(getDevice("pixel-8"), "pixel")).toBe("punch");
    expect(cameraType(getDevice("ipad-13"), "ipad")).toBe("dot");
    expect(cameraType(getDevice("iphone-55"), "iphone-classic")).toBe("home");
  });
});

describe("frameSpec distinguishes families", () => {
  it("gives different radius/bezel per family (not just size)", () => {
    const iphone = frameSpec(getDevice("iphone-69"));
    const ipad = frameSpec(getDevice("ipad-13"));
    const galaxy = frameSpec(getDevice("galaxy-s24"));
    expect(iphone.radius).not.toBe(ipad.radius);
    expect(iphone.radius).not.toBe(galaxy.radius);
    expect(ipad.bezel).toBeGreaterThan(iphone.bezel); // tablets have thicker bezels
    expect(iphone.camera).toBe("island");
    expect(ipad.camera).toBe("dot");
  });
  it("every catalog device yields a usable spec", () => {
    for (const d of DEVICES) {
      const s = frameSpec(d);
      expect(s.radius).toBeGreaterThan(0);
      expect(s.bezel).toBeGreaterThan(0);
      expect(["island", "notch", "punch", "dot", "home", "none"]).toContain(s.camera);
    }
  });
});
