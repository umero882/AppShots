import { describe, it, expect } from "vitest";
import { placeScreenshots, withScreenshot, screenLike } from "../screenshots.js";
import { defaultProjectState, defaultScreen } from "../templates.js";
import { makeDeviceInstance } from "../deviceLayout.js";

const img = (n) => `data:image/png;base64,${n}`;

describe("withScreenshot", () => {
  it("sets the single image on a legacy screen, whatever device id is given", () => {
    const s = defaultScreen();
    expect(withScreenshot(s, img(1)).image).toBe(img(1));
    expect(withScreenshot(s, img(1), "legacy").image).toBe(img(1));
    expect(withScreenshot(s, img(1), "nope").image).toBe(img(1));
    expect(s.image).toBeNull(); // immutable
  });

  it("fills the named mockup on a free screen, else the first", () => {
    const a = makeDeviceInstance("iphone-69");
    const b = makeDeviceInstance("ipad-13");
    const s = { ...defaultScreen(), devices: [a, b] };
    const named = withScreenshot(s, img(1), b.id);
    expect(named.devices[1].image).toBe(img(1));
    expect(named.devices[0].image).toBeNull();
    const first = withScreenshot(s, img(2), "nope");
    expect(first.devices[0].image).toBe(img(2));
    expect(first.image).toBeNull();
  });
});

describe("screenLike", () => {
  it("copies the background and the mockup arrangement with fresh ids and no shots", () => {
    const a = makeDeviceInstance("iphone-69", { image: img(1), rotation: 12, x: 0.3 });
    const src = { ...defaultScreen(), heading: "Custom", background: { type: "solid", solid: "#123456" }, devices: [a], elements: [{ id: "e" }] };
    const next = screenLike(src);
    expect(next.id).not.toBe(src.id);
    expect(next.heading).toBe(defaultScreen().heading);
    expect(next.elements).toBeUndefined();
    expect(next.background).toEqual(src.background);
    expect(next.background).not.toBe(src.background);
    expect(next.devices).toHaveLength(1);
    expect(next.devices[0]).toMatchObject({ deviceId: "iphone-69", rotation: 12, x: 0.3, image: null });
    expect(next.devices[0].id).not.toBe(a.id);
  });

  it("stays a legacy screen when the source is one", () => {
    expect(screenLike(defaultScreen()).devices).toBeUndefined();
    expect(screenLike(null).devices).toBeUndefined();
  });
});

describe("placeScreenshots", () => {
  it("puts one image in the active screen", () => {
    const state = defaultProjectState();
    const next = placeScreenshots(state, 0, [img(1)]);
    expect(next.screens[0].image).toBe(img(1));
    expect(next.screens).toHaveLength(state.screens.length);
    expect(state.screens[0].image).toBeNull();
  });

  it("fans extra images out over the following screens, appending styled ones", () => {
    const state = defaultProjectState();
    state.screens = [
      { ...defaultScreen(), background: { type: "solid", solid: "#111111" } },
      { ...defaultScreen(), background: { type: "solid", solid: "#222222" } },
    ];
    const next = placeScreenshots(state, 1, [img(1), img(2), img(3)]);
    expect(next.screens).toHaveLength(4);
    expect(next.screens[0].image).toBeNull(); // before the active one: untouched
    expect(next.screens[1].image).toBe(img(1));
    expect(next.screens[2].image).toBe(img(2));
    expect(next.screens[3].image).toBe(img(3));
    expect(next.screens[2].background).toEqual({ type: "solid", solid: "#222222" }); // like the active screen
    expect(next.screens[3].background).toEqual({ type: "solid", solid: "#222222" });
  });

  it("targets the dropped-on mockup for the first image only", () => {
    const state = defaultProjectState();
    const a = makeDeviceInstance("iphone-69");
    const b = makeDeviceInstance("ipad-13");
    state.screens = [{ ...defaultScreen(), devices: [a, b] }];
    const next = placeScreenshots(state, 0, [img(1), img(2)], { deviceId: b.id });
    expect(next.screens[0].devices[1].image).toBe(img(1));
    expect(next.screens[0].devices[0].image).toBeNull();
    // the appended screen mirrors the arrangement and takes its first mockup
    expect(next.screens[1].devices).toHaveLength(2);
    expect(next.screens[1].devices[0].image).toBe(img(2));
    expect(next.screens[1].devices[1].image).toBeNull();
  });

  it("is a no-op without images or screens", () => {
    const state = defaultProjectState();
    expect(placeScreenshots(state, 0, [])).toBe(state);
    expect(placeScreenshots(state, 0, null)).toBe(state);
    expect(placeScreenshots(null, 0, [img(1)])).toBeNull();
  });
});
