import { describe, it, expect } from "vitest";
import { resolveTextTarget, applyTextStyle, stepSize } from "../textTarget.js";
import { defaultProjectState, defaultScreen } from "../templates.js";
import { makeTextElement, makeElement, BADGES } from "../elements.js";

const base = () => {
  const state = defaultProjectState();
  const el = makeTextElement({ text: "Hi", size: 0.08, weight: 600, color: "#123456", align: "left" });
  const badge = makeElement(BADGES[0]);
  state.screens[0] = { ...defaultScreen(), heading: "Hello", subheading: "World", elements: [el, badge] };
  return { state, el, badge };
};

describe("resolveTextTarget", () => {
  it("maps the headline to state.text in canvas px", () => {
    const { state } = base();
    const t = resolveTextTarget(state, state.screens[0], { kind: "heading" });
    expect(t.label).toBe("Headline");
    expect(t.values).toMatchObject({ font: state.text.font, size: state.text.size, weight: state.text.weight, align: state.text.align, color: state.text.color });
    expect(t.sizeSpec).toEqual({ min: 36, max: 110, step: 2, unit: "px" });
    expect(t.caps).toEqual({ font: true, align: true, effect: true });
  });

  it("maps the subheading, falling back to headline-derived defaults", () => {
    const { state } = base();
    delete state.subtext;
    const t = resolveTextTarget(state, state.screens[0], { kind: "subheading" });
    expect(t.label).toBe("Subheading");
    expect(t.values.size).toBe(Math.round(state.text.size * 0.45));
    expect(t.values.weight).toBe(500);
    expect(t.values.color).toBe(state.text.color);
    expect(t.values.font).toBe(state.text.font); // shared with the headline
    expect(t.caps.effect).toBe(false);
  });

  it("maps a text element with its fractional size shown in hundredths", () => {
    const { state, el } = base();
    const t = resolveTextTarget(state, state.screens[0], { kind: "element", id: el.id });
    expect(t.label).toBe("Text");
    expect(t.values).toMatchObject({ size: 8, weight: 600, color: "#123456", align: "left" });
    expect(t.sizeSpec).toEqual({ min: 2, max: 16, step: 0.5, unit: "" });
  });

  it("is null for badges, missing ids and no selection", () => {
    const { state, badge } = base();
    expect(resolveTextTarget(state, state.screens[0], { kind: "element", id: badge.id })).toBeNull();
    expect(resolveTextTarget(state, state.screens[0], { kind: "element", id: "nope" })).toBeNull();
    expect(resolveTextTarget(state, state.screens[0], null)).toBeNull();
  });
});

describe("applyTextStyle", () => {
  it("patches the headline style", () => {
    const { state } = base();
    const next = applyTextStyle(state, 0, { kind: "heading" }, { size: 72, weight: 900, effect: "glow" });
    expect(next.text).toMatchObject({ size: 72, weight: 900, effect: "glow" });
    expect(next).not.toBe(state);
  });

  it("routes shared subheading props to the headline and its own to subtext", () => {
    const { state } = base();
    delete state.subtext;
    const next = applyTextStyle(state, 0, { kind: "subheading" }, { font: "mono", align: "right", size: 40, color: "#ff0000" });
    expect(next.text.font).toBe("mono");
    expect(next.text.align).toBe("right");
    expect(next.subtext).toMatchObject({ size: 40, color: "#ff0000", weight: 500 });
    expect(next.text.size).toBe(state.text.size); // headline size untouched
  });

  it("ignores an effect on the subheading (it has none)", () => {
    const { state } = base();
    const next = applyTextStyle(state, 0, { kind: "subheading" }, { effect: "glow" });
    expect(next.text.effect).toBe(state.text.effect);
    expect(next.subtext?.effect).toBeUndefined();
  });

  it("patches only the targeted element on the targeted screen, converting size back", () => {
    const { state, el, badge } = base();
    state.screens.push({ ...defaultScreen(), elements: [{ ...el }] }); // same id on screen 2
    const next = applyTextStyle(state, 0, { kind: "element", id: el.id }, { size: 10, color: "#00ff00" });
    const changed = next.screens[0].elements.find((e) => e.id === el.id);
    expect(changed.size).toBeCloseTo(0.1);
    expect(changed.color).toBe("#00ff00");
    expect(next.screens[0].elements.find((e) => e.id === badge.id)).toBe(badge);
    expect(next.screens[1].elements[0].size).toBe(0.08);
  });

  it("returns the same state for an unknown target", () => {
    const { state } = base();
    expect(applyTextStyle(state, 0, { kind: "nope" }, { size: 1 })).toBe(state);
    expect(applyTextStyle(state, 0, null, { size: 1 })).toBe(state);
  });
});

describe("stepSize", () => {
  const px = { min: 36, max: 110, step: 2, unit: "px" };
  const frac = { min: 2, max: 16, step: 0.5, unit: "" };
  it("steps and clamps", () => {
    expect(stepSize(48, px, 1)).toBe(50);
    expect(stepSize(48, px, -1)).toBe(46);
    expect(stepSize(110, px, 1)).toBe(110);
    expect(stepSize(36, px, -1)).toBe(36);
  });
  it("snaps off-grid values to the step", () => {
    expect(stepSize(47, px, 1)).toBe(50);
    expect(stepSize(6.2, frac, 1)).toBe(6.5);
    expect(stepSize(6.2, frac, -1)).toBe(5.5);
  });
});
