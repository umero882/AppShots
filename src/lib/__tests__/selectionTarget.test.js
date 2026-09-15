import { describe, it, expect } from "vitest";
import { resolveSelection, elementColors } from "../selectionTarget.js";
import { defaultProjectState, defaultScreen } from "../templates.js";
import { makeTextElement, makeElement, makeEmojiElement, makeIconElement, BADGES, SHAPES } from "../elements.js";
import { makeDeviceInstance } from "../deviceLayout.js";
import { getDevice } from "../devices.js";

const setup = () => {
  const state = defaultProjectState();
  const text = makeTextElement({ text: "Hi" });
  const badge = makeElement(BADGES.find((b) => b.badge === "pill") || BADGES[0]);
  const shape = makeElement(SHAPES[0]);
  const emoji = makeEmojiElement("🚀");
  const screen = { ...defaultScreen(), heading: "Hello", elements: [text, badge, shape, emoji] };
  return { state, screen, text, badge, shape, emoji };
};

describe("resolveSelection", () => {
  it("is null with nothing selected or no screen", () => {
    const { state, screen } = setup();
    expect(resolveSelection(state, screen, {})).toBeNull();
    expect(resolveSelection(state, null, { selectedText: "heading" })).toBeNull();
  });

  it("resolves a clicked headline line to a text target", () => {
    const { state, screen } = setup();
    const r = resolveSelection(state, screen, { selectedText: "heading" });
    expect(r.kind).toBe("text");
    expect(r.id).toBeUndefined();
    expect(r.text.label).toBe("Headline");
  });

  it("resolves a text element to a text target that still knows its id and layer", () => {
    const { state, screen, text } = setup();
    const r = resolveSelection(state, screen, { selectedEl: text.id, selectedText: "heading" });
    expect(r.kind).toBe("text");
    expect(r.id).toBe(text.id);
    expect(r.text.label).toBe("Text");
    expect(r.isBottom).toBe(true);
    expect(r.isTop).toBe(false);
  });

  it("element selection wins over a stale headline selection", () => {
    const { state, screen, shape } = setup();
    const r = resolveSelection(state, screen, { selectedEl: shape.id, selectedText: "heading" });
    expect(r.kind).toBe("element");
    expect(r.label).toBe("Shape");
  });

  it("describes a badge with fill + text colors, a shape with one, an emoji with none", () => {
    const { state, screen, badge, shape, emoji } = setup();
    const b = resolveSelection(state, screen, { selectedEl: badge.id });
    expect(b.colors.map((c) => c.key)).toEqual(["bg", "fg"]);
    expect(b.opacity).toBe(100);
    const s = resolveSelection(state, screen, { selectedEl: shape.id });
    expect(s.colors.map((c) => c.key)).toEqual(["color"]);
    const e = resolveSelection(state, screen, { selectedEl: emoji.id });
    expect(e.colors).toEqual([]);
    expect(e.isTop).toBe(true);
  });

  it("reports opacity as a rounded percentage", () => {
    const { state, screen, shape } = setup();
    screen.elements = screen.elements.map((e) => (e.id === shape.id ? { ...e, opacity: 0.35 } : e));
    expect(resolveSelection(state, screen, { selectedEl: shape.id }).opacity).toBe(35);
  });

  it("is null for an element id that no longer exists", () => {
    const { state, screen } = setup();
    expect(resolveSelection(state, screen, { selectedEl: "gone" })).toBeNull();
  });

  it("resolves a free-mode device with its name, scale and image state", () => {
    const { state } = setup();
    const d1 = makeDeviceInstance("iphone-69", { scale: 0.6 });
    const d2 = makeDeviceInstance("ipad-13", { image: "data:," });
    const screen = { ...defaultScreen(), devices: [d1, d2] };
    const r = resolveSelection(state, screen, { selectedDevice: d2.id });
    expect(r.kind).toBe("device");
    expect(r.label).toBe(getDevice("ipad-13").name);
    expect(r.scale).toBe(78);
    expect(r.hasImage).toBe(true);
    expect(r.count).toBe(2);
    expect(resolveSelection(state, screen, { selectedDevice: d1.id }).scale).toBe(60);
  });

  it("is null for a device id not on this screen", () => {
    const { state, screen } = setup();
    expect(resolveSelection(state, screen, { selectedDevice: "nope" })).toBeNull();
  });
});

describe("elementColors", () => {
  it("falls back to the element defaults", () => {
    expect(elementColors({ kind: "badge" })).toEqual([
      { key: "bg", label: "Fill", value: "#111827" },
      { key: "fg", label: "Text", value: "#ffffff" },
    ]);
    expect(elementColors(makeIconElement("star"))[0].value).toBe("#111827");
    expect(elementColors({ kind: "image" })).toEqual([]);
    expect(elementColors(null)).toEqual([]);
  });
});
