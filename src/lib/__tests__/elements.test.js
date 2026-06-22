import { describe, it, expect } from "vitest";
import {
  clamp01, fracDelta, angleFromCenter, distance, scaleFromResize, snapToCenter, snapToGuides,
  makeElement, makeEmojiElement, makeIconElement, makeImageElement, elementSvg,
  reorderElements, duplicateElement, twemojiCodepoints, twemojiUrl,
  BADGES, SHAPES, ARROWS, EMOJI, ICONS, PHOTO_CATEGORIES,
} from "../elements.js";

describe("geometry", () => {
  it("clamp01 bounds to [0,1]", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });
  it("fracDelta converts px to fraction", () => {
    expect(fracDelta(30, 60, 300, 600)).toEqual({ dx: 0.1, dy: 0.1 });
    expect(fracDelta(10, 10, 0, 0)).toEqual({ dx: 0, dy: 0 });
  });
  it("angleFromCenter measures degrees", () => {
    expect(angleFromCenter(0, 0, 1, 0)).toBeCloseTo(0);
    expect(angleFromCenter(0, 0, 0, 1)).toBeCloseTo(90);
    expect(angleFromCenter(0, 0, -1, 0)).toBeCloseTo(180);
  });
  it("distance is euclidean", () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
  });
  it("scaleFromResize scales by distance ratio and clamps", () => {
    expect(scaleFromResize(1, 100, 200)).toBe(2);
    expect(scaleFromResize(1, 100, 50)).toBe(0.5);
    expect(scaleFromResize(1, 100, 0)).toBeGreaterThanOrEqual(0.15); // clamped low
    expect(scaleFromResize(1, 100, 100000)).toBeLessThanOrEqual(6); // clamped high
    expect(scaleFromResize(2, 0, 50)).toBe(2); // no start distance
  });
  it("snapToCenter snaps within threshold and flags the guides", () => {
    expect(snapToCenter(0.505, 0.3)).toMatchObject({ x: 0.5, snapX: true, snapY: false });
    expect(snapToCenter(0.3, 0.49)).toMatchObject({ y: 0.5, snapX: false, snapY: true });
    expect(snapToCenter(0.5, 0.5)).toMatchObject({ x: 0.5, y: 0.5, snapX: true, snapY: true });
    const far = snapToCenter(0.2, 0.8);
    expect(far).toMatchObject({ x: 0.2, y: 0.8, snapX: false, snapY: false });
  });
  it("snapToGuides snaps to a target's center and reports the guide position", () => {
    const targets = [{ x: 0.5, y: 0.5 }, { x: 0.3, y: 0.7 }];
    const r = snapToGuides(0.305, 0.3, targets); // near target x=0.3, no y target near
    expect(r.x).toBe(0.3);
    expect(r.guideX).toBe(0.3);
    expect(r.guideY).toBeNull();
  });
  it("snapToGuides snaps both axes to the canvas center", () => {
    const r = snapToGuides(0.49, 0.51, [{ x: 0.5, y: 0.5 }]);
    expect(r).toMatchObject({ x: 0.5, y: 0.5, guideX: 0.5, guideY: 0.5 });
  });
  it("snapToGuides leaves a far position untouched", () => {
    const r = snapToGuides(0.1, 0.9, [{ x: 0.5, y: 0.5 }]);
    expect(r).toMatchObject({ x: 0.1, y: 0.9, guideX: null, guideY: null });
  });
});

describe("libraries", () => {
  it("expose large curated sets (~100+ per category)", () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(100);
    expect(SHAPES.length).toBeGreaterThanOrEqual(100);
    expect(ARROWS.length).toBeGreaterThanOrEqual(90);
    expect(EMOJI.length).toBeGreaterThanOrEqual(100);
    expect(ICONS.length).toBeGreaterThanOrEqual(100);
    expect(PHOTO_CATEGORIES.length).toBeGreaterThanOrEqual(20);
  });
  it("element library ids are unique within each set", () => {
    for (const set of [BADGES, SHAPES, ARROWS]) {
      const ids = set.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("every photo category has an id, label and query", () => {
    for (const c of PHOTO_CATEGORIES) {
      expect(c.id && c.label && c.q).toBeTruthy();
    }
  });
});

describe("makeElement", () => {
  it("creates a placed element with defaults", () => {
    const el = makeElement(SHAPES[0]);
    expect(el.id).toMatch(/^el_/);
    expect(el.kind).toBe("shape");
    expect(el.x).toBe(0.5);
    expect(el.scale).toBe(1);
    expect(el.rotation).toBe(0);
    expect(el.opacity).toBe(1);
    expect(el.baseWidth).toBeGreaterThan(0);
  });
  it("honors a position", () => {
    const el = makeElement(BADGES[0], { x: 0.2, y: 0.8 });
    expect(el.x).toBe(0.2);
    expect(el.y).toBe(0.8);
  });
  it("gives elements unique ids", () => {
    expect(makeElement(SHAPES[0]).id).not.toBe(makeElement(SHAPES[0]).id);
  });
  it("emoji/icon/image factories set their kind + payload", () => {
    expect(makeEmojiElement("🚀")).toMatchObject({ kind: "emoji", emoji: "🚀" });
    expect(makeIconElement("Star")).toMatchObject({ kind: "icon", icon: "Star" });
    expect(makeImageElement("data:img")).toMatchObject({ kind: "image", image: "data:img" });
  });
});

describe("reorderElements", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const ids = (l) => l.map((e) => e.id).join("");
  it("front moves to end (top)", () => {
    expect(ids(reorderElements(list, "b", "front"))).toBe("acdb");
  });
  it("back moves to start (bottom)", () => {
    expect(ids(reorderElements(list, "c", "back"))).toBe("cabd");
  });
  it("forward swaps with the next", () => {
    expect(ids(reorderElements(list, "b", "forward"))).toBe("acbd");
  });
  it("backward swaps with the previous", () => {
    expect(ids(reorderElements(list, "c", "backward"))).toBe("acbd");
  });
  it("forward at the top is a no-op", () => {
    expect(ids(reorderElements(list, "d", "forward"))).toBe("abcd");
  });
  it("backward at the bottom is a no-op", () => {
    expect(ids(reorderElements(list, "a", "backward"))).toBe("abcd");
  });
  it("returns a new array and leaves the original untouched", () => {
    const out = reorderElements(list, "a", "front");
    expect(out).not.toBe(list);
    expect(ids(list)).toBe("abcd");
  });
  it("unknown id is a no-op", () => {
    expect(ids(reorderElements(list, "zz", "front"))).toBe("abcd");
  });
});

describe("twemojiCodepoints", () => {
  it("maps a simple emoji to its codepoint", () => {
    expect(twemojiCodepoints("🚀")).toBe("1f680");
    expect(twemojiCodepoints("⭐")).toBe("2b50");
  });
  it("drops the FE0F variation selector for non-ZWJ emoji", () => {
    expect(twemojiCodepoints("❤️")).toBe("2764");
  });
  it("keeps the full ZWJ sequence", () => {
    expect(twemojiCodepoints("👨‍👩‍👧")).toBe("1f468-200d-1f469-200d-1f467");
  });
  it("twemojiUrl builds a jsdelivr svg path", () => {
    expect(twemojiUrl("🚀")).toMatch(/jsdelivr\.net.*\/1f680\.svg$/);
  });
});

describe("duplicateElement", () => {
  it("gives a fresh id, keeps props, and offsets position", () => {
    const el = makeElement(SHAPES[0], { x: 0.5, y: 0.5 });
    const copy = duplicateElement(el);
    expect(copy.id).not.toBe(el.id);
    expect(copy.kind).toBe(el.kind);
    expect(copy.x).toBeCloseTo(0.54);
    expect(copy.y).toBeCloseTo(0.54);
  });
  it("clamps the offset within the canvas", () => {
    const el = makeElement(SHAPES[0], { x: 0.99, y: 0.99 });
    const copy = duplicateElement(el);
    expect(copy.x).toBeLessThanOrEqual(1);
    expect(copy.y).toBeLessThanOrEqual(1);
  });
});

describe("elementSvg", () => {
  it("returns an svg data-uri for shapes and arrows", () => {
    expect(elementSvg(makeElement(SHAPES[0]))).toMatch(/^data:image\/svg\+xml,/);
    expect(elementSvg(makeElement(ARROWS[0]))).toMatch(/^data:image\/svg\+xml,/);
  });
  it("embeds the element color in the svg", () => {
    const el = makeElement({ kind: "shape", variant: "circle", color: "#abcdef" });
    expect(decodeURIComponent(elementSvg(el))).toContain("#abcdef");
  });
  it("returns null for non-vector kinds", () => {
    expect(elementSvg(makeEmojiElement("🚀"))).toBeNull();
    expect(elementSvg(makeImageElement("x"))).toBeNull();
  });
});
