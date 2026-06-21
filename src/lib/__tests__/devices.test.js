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
