import { describe, it, expect } from "vitest";
import { clipFromSelection, pasteItem } from "../clipboard.js";
import { defaultScreen } from "../templates.js";
import { makeTextElement, makeElement, BADGES } from "../elements.js";
import { makeDeviceInstance } from "../deviceLayout.js";

const text = makeTextElement({ text: "Hi", x: 0.3, y: 0.6 });
const badge = makeElement(BADGES[0]);
const dev = makeDeviceInstance("iphone-69", { x: 0.4, y: 0.5, rotation: 8 });
const legacy = { ...defaultScreen(), elements: [text, badge] };
const free = { ...defaultScreen(), elements: [text], devices: [dev] };

describe("clipFromSelection", () => {
  it("copies the selected element as a detached snapshot", () => {
    const c = clipFromSelection(legacy, 2, { selectedEl: badge.id });
    expect(c).toMatchObject({ kind: "element", from: 2 });
    expect(c.item).toEqual(badge);
    expect(c.item).not.toBe(badge);
  });

  it("prefers the element when both an element and a device are selected", () => {
    expect(clipFromSelection(free, 0, { selectedEl: text.id, selectedDevice: dev.id }).kind).toBe("element");
  });

  it("copies a free mockup but never the legacy single one", () => {
    const c = clipFromSelection(free, 1, { selectedDevice: dev.id });
    expect(c).toMatchObject({ kind: "device", from: 1 });
    expect(c.item).toEqual(dev);
    expect(clipFromSelection(legacy, 0, { selectedDevice: "legacy" })).toBeNull();
  });

  it("is null for nothing, an unknown id, or no screen", () => {
    expect(clipFromSelection(legacy, 0, {})).toBeNull();
    expect(clipFromSelection(legacy, 0, { selectedEl: "nope" })).toBeNull();
    expect(clipFromSelection(null, 0, { selectedEl: text.id })).toBeNull();
  });
});

describe("pasteItem", () => {
  it("nudges a copy pasted back onto its own screen", () => {
    const p = pasteItem({ kind: "element", item: text, from: 0 }, 0);
    expect(p.id).not.toBe(text.id);
    expect(p.x).toBeCloseTo(0.34);
    expect(p.y).toBeCloseTo(0.64);
    expect(p.text).toBe("Hi");
  });

  it("keeps the spot when pasting onto another screen", () => {
    const p = pasteItem({ kind: "element", item: text, from: 0 }, 3);
    expect(p.id).not.toBe(text.id);
    expect(p.x).toBe(0.3);
    expect(p.y).toBe(0.6);
  });

  it("does the same for a mockup, keeping its pose", () => {
    const same = pasteItem({ kind: "device", item: dev, from: 1 }, 1);
    expect(same.id).not.toBe(dev.id);
    expect(same.x).toBeCloseTo(0.44);
    expect(same.rotation).toBe(8);
    const other = pasteItem({ kind: "device", item: dev, from: 1 }, 2);
    expect(other.id).not.toBe(dev.id);
    expect(other.x).toBe(0.4);
    expect(other.y).toBe(0.5);
  });

  it("is null without a clip", () => {
    expect(pasteItem(null, 0)).toBeNull();
  });
});
