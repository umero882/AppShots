import { describe, it, expect } from "vitest";
import {
  makeLive3d, materialPreset, LIVE3D_MATERIALS, clampRot, rotationRad,
  deviceBox, cameraDistance, dragToRot, pickScreenMaterial, fitScale, makeModel,
} from "../live3d.js";

describe("makeLive3d", () => {
  it("returns sensible defaults (enabled, a 3D pose, titanium)", () => {
    const s = makeLive3d();
    expect(s.enabled).toBe(true);
    expect(s.material).toBe("titanium");
    expect(s.zoom).toBe(1);
    expect(Math.abs(s.rotY)).toBeGreaterThan(0);
  });
  it("applies overrides", () => {
    expect(makeLive3d({ rotY: 5, material: "gold" })).toMatchObject({ rotY: 5, material: "gold" });
  });
});

describe("materialPreset", () => {
  it("looks up a known preset", () => {
    expect(materialPreset("gold").color).toBe("#c9a45c");
  });
  it("falls back to the first preset for an unknown id", () => {
    expect(materialPreset("nope")).toBe(LIVE3D_MATERIALS[0]);
  });
});

describe("clampRot / rotationRad", () => {
  it("clamps beyond ±60°", () => {
    expect(clampRot(200, -90)).toEqual({ rotX: 60, rotY: -60 });
  });
  it("converts clamped degrees to radians", () => {
    const r = rotationRad({ rotX: 90, rotY: 0 });
    expect(r.x).toBeCloseTo((60 * Math.PI) / 180, 5);
    expect(r.y).toBe(0);
  });
  it("treats missing values as zero", () => {
    expect(rotationRad(undefined)).toEqual({ x: 0, y: 0 });
  });
});

describe("deviceBox", () => {
  it("is 1 wide and height follows the aspect", () => {
    const b = deviceBox(2.1);
    expect(b.width).toBe(1);
    expect(b.height).toBeCloseTo(2.1, 5);
  });
  it("falls back to a phone-ish aspect for non-positive input", () => {
    expect(deviceBox(0).height).toBe(2);
  });
});

describe("cameraDistance", () => {
  it("moves closer as zoom increases", () => {
    expect(cameraDistance(2)).toBeLessThan(cameraDistance(1));
  });
  it("guards against non-positive zoom", () => {
    expect(cameraDistance(0)).toBe(cameraDistance(1));
  });
});

describe("dragToRot", () => {
  it("maps horizontal drag to yaw and inverts vertical for pitch", () => {
    const { dRotY, dRotX } = dragToRot(10, 10, 0.5);
    expect(dRotY).toBe(5);
    expect(dRotX).toBe(-5);
  });
});

describe("pickScreenMaterial", () => {
  it("finds a screen-like name case-insensitively", () => {
    expect(pickScreenMaterial(["Body", "Screen", "Buttons"])).toBe("Screen");
    expect(pickScreenMaterial(["frame", "display_glass"])).toBe("display_glass");
  });
  it("returns null when nothing looks like a screen", () => {
    expect(pickScreenMaterial(["Body", "Metal", "Buttons"])).toBeNull();
    expect(pickScreenMaterial([])).toBeNull();
  });
});

describe("fitScale", () => {
  it("scales the largest dimension to the target", () => {
    expect(fitScale(4.8, 2.4)).toBeCloseTo(0.5, 5);
  });
  it("guards against a zero-sized model", () => {
    expect(fitScale(0)).toBe(1);
  });
});

describe("makeModel", () => {
  it("defaults to auto screen + no flip/rotate", () => {
    expect(makeModel("data:x")).toEqual({ src: "data:x", screenKey: null, flip: false, rotate: 0 });
  });
  it("applies overrides", () => {
    expect(makeModel("data:x", { screenKey: "Screen", flip: true })).toMatchObject({ screenKey: "Screen", flip: true });
  });
});
