import { describe, it, expect } from "vitest";
import {
  orientedCanvas, makeDeviceInstance, duplicateDeviceInstance,
  screenDevices, isFreeMode, deviceTransform, panoramaStyle, PERSPECTIVE,
  FRAME_COLORS, frameColorOf, frameButtonColor,
} from "../deviceLayout.js";

describe("frame colors", () => {
  const device = { bezel: { color: "#0b0b0e" } };
  it("offers named finishes with valid hex bezels", () => {
    expect(FRAME_COLORS.length).toBeGreaterThanOrEqual(4);
    expect(FRAME_COLORS.map((c) => c.id)).toEqual(expect.arrayContaining(["black", "titanium", "silver", "gold"]));
    for (const c of FRAME_COLORS) expect(c.bezel).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("frameColorOf prefers instance, then project, then device default", () => {
    expect(frameColorOf({ frameColor: "#111111" }, "#222222", device)).toBe("#111111");
    expect(frameColorOf({ frameColor: null }, "#222222", device)).toBe("#222222");
    expect(frameColorOf({}, null, device)).toBe("#0b0b0e");
  });
  it("frameButtonColor returns a light-frame tint or the default", () => {
    expect(frameButtonColor("#d6d6d8")).toBe("#b8b8bd"); // silver
    expect(frameButtonColor("#0b0b0e")).toBe("#26262b"); // default dark
  });
  it("makeDeviceInstance carries an optional frameColor (null by default)", () => {
    expect(makeDeviceInstance("iphone-69").frameColor).toBeNull();
    expect(makeDeviceInstance("iphone-69", { frameColor: "#abcdef" }).frameColor).toBe("#abcdef");
  });
});
import { getDevice } from "../devices.js";
import { defaultProjectState, defaultScreen } from "../templates.js";

describe("orientedCanvas", () => {
  const dev = getDevice("iphone-69"); // 1290 x 2796
  it("returns the device canvas unchanged in portrait", () => {
    expect(orientedCanvas(dev, "portrait")).toEqual({ w: 1290, h: 2796 });
  });
  it("swaps width/height in landscape", () => {
    expect(orientedCanvas(dev, "landscape")).toEqual({ w: 2796, h: 1290 });
  });
  it("defaults to portrait", () => {
    expect(orientedCanvas(dev)).toEqual({ w: 1290, h: 2796 });
  });
});

describe("makeDeviceInstance", () => {
  it("creates a centered upright instance with defaults", () => {
    const i = makeDeviceInstance("iphone-69");
    expect(i.id).toMatch(/^dev_/);
    expect(i.deviceId).toBe("iphone-69");
    expect(i.image).toBeNull();
    expect(i).toMatchObject({ x: 0.5, y: 0.5, rotation: 0, tiltX: 0, tiltY: 0, orientation: "portrait" });
    expect(i.scale).toBeGreaterThan(0);
  });
  it("honors overrides", () => {
    const i = makeDeviceInstance("pixel-8", { x: 0.2, y: 0.8, scale: 1.2, rotation: 10, tiltY: 15, image: "data:x", orientation: "landscape" });
    expect(i).toMatchObject({ deviceId: "pixel-8", x: 0.2, y: 0.8, scale: 1.2, rotation: 10, tiltY: 15, image: "data:x", orientation: "landscape" });
  });
  it("gives unique ids", () => {
    expect(makeDeviceInstance("iphone-69").id).not.toBe(makeDeviceInstance("iphone-69").id);
  });
});

describe("duplicateDeviceInstance", () => {
  it("fresh id, offset position, same look", () => {
    const a = makeDeviceInstance("iphone-69", { x: 0.5, y: 0.5, scale: 0.9, tiltX: 8 });
    const b = duplicateDeviceInstance(a);
    expect(b.id).not.toBe(a.id);
    expect(b.x).toBeCloseTo(0.54);
    expect(b.y).toBeCloseTo(0.54);
    expect(b.scale).toBe(0.9);
    expect(b.tiltX).toBe(8);
  });
  it("clamps the offset inside the canvas", () => {
    const b = duplicateDeviceInstance(makeDeviceInstance("iphone-69", { x: 0.99, y: 0.99 }));
    expect(b.x).toBeLessThanOrEqual(1);
    expect(b.y).toBeLessThanOrEqual(1);
  });
});

describe("screenDevices (backward compatibility)", () => {
  it("synthesizes one legacy instance from project fields when no devices array", () => {
    const state = { ...defaultProjectState(), deviceId: "iphone-61", deviceScale: 0.7 };
    const screen = { ...defaultScreen(), image: "data:legacy" };
    const list = screenDevices(screen, state);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ deviceId: "iphone-61", image: "data:legacy", scale: 0.7, x: 0.5, y: 0.5 });
  });
  it("returns the explicit devices array when present", () => {
    const devices = [makeDeviceInstance("iphone-69"), makeDeviceInstance("ipad-13")];
    const list = screenDevices({ ...defaultScreen(), devices }, defaultProjectState());
    expect(list).toBe(devices);
    expect(list).toHaveLength(2);
  });
  it("falls back to synth for an empty devices array", () => {
    const list = screenDevices({ ...defaultScreen(), devices: [] }, defaultProjectState());
    expect(list).toHaveLength(1);
  });
});

describe("isFreeMode", () => {
  it("true only with a non-empty devices array", () => {
    expect(isFreeMode({ devices: [makeDeviceInstance("iphone-69")] })).toBe(true);
    expect(isFreeMode({ devices: [] })).toBe(false);
    expect(isFreeMode({})).toBe(false);
  });
});

describe("deviceTransform", () => {
  it("always centers", () => {
    expect(deviceTransform(makeDeviceInstance("iphone-69"))).toContain("translate(-50%, -50%)");
  });
  it("omits perspective/rotation when upright", () => {
    const t = deviceTransform(makeDeviceInstance("iphone-69"));
    expect(t).not.toContain("perspective");
    expect(t).not.toContain("rotate");
  });
  it("adds perspective + rotateX/rotateY when tilted", () => {
    const t = deviceTransform(makeDeviceInstance("iphone-69", { tiltX: -12, tiltY: 20 }));
    expect(t).toContain(`perspective(${PERSPECTIVE}px)`);
    expect(t).toContain("rotateX(-12deg)");
    expect(t).toContain("rotateY(20deg)");
  });
  it("adds a z-rotation when rotated", () => {
    expect(deviceTransform(makeDeviceInstance("iphone-69", { rotation: 7 }))).toContain("rotate(7deg)");
  });
});

describe("panoramaStyle", () => {
  it("returns null for a single screen", () => {
    expect(panoramaStyle(0, 1)).toBeNull();
    expect(panoramaStyle(0, 0)).toBeNull();
  });
  it("sizes the background to span all screens", () => {
    expect(panoramaStyle(0, 3).backgroundSize).toBe("300% 100%");
  });
  it("evenly slices first to last screen 0% .. 100%", () => {
    expect(panoramaStyle(0, 3).backgroundPosition).toBe("0% 50%");
    expect(panoramaStyle(1, 3).backgroundPosition).toBe("50% 50%");
    expect(panoramaStyle(2, 3).backgroundPosition).toBe("100% 50%");
  });
});
