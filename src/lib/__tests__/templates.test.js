import { describe, it, expect } from "vitest";
import { defaultProjectState, hydrateProjectState } from "../templates.js";

describe("hydrateProjectState", () => {
  it("fills every missing field from the defaults — `{}` (what the backend stores for a stateless project) renders", () => {
    const out = hydrateProjectState({});
    const base = defaultProjectState();
    expect(out.text).toEqual(base.text);
    expect(out.subtext).toEqual(base.subtext);
    expect(out.background).toEqual(base.background);
    expect(out.deviceId).toBe(base.deviceId);
    expect(out.screens).toHaveLength(1);
  });

  it("treats null/undefined/non-objects as empty", () => {
    for (const v of [null, undefined, "x", 5]) {
      expect(hydrateProjectState(v).text).toEqual(defaultProjectState().text);
    }
  });

  it("keeps present fields untouched, including unknown extras", () => {
    const stored = {
      deviceId: "ipad-13",
      text: { font: "mono", color: "#000000", size: 40, weight: 600, align: "left" },
      screens: [{ id: "a", heading: "Hi", subheading: "", image: null }],
      copyBrief: "a sleep tracker",
    };
    const out = hydrateProjectState(stored);
    expect(out.deviceId).toBe("ipad-13");
    expect(out.text).toBe(stored.text);
    expect(out.screens).toBe(stored.screens);
    expect(out.copyBrief).toBe("a sleep tracker");
    expect(out.layoutId).toBe(defaultProjectState().layoutId); // absent → default
  });

  it("never yields an empty screens list", () => {
    expect(hydrateProjectState({ screens: [] }).screens).toHaveLength(1);
    expect(hydrateProjectState({ screens: "nope" }).screens).toHaveLength(1);
  });

  it("does not share the default screens array between calls", () => {
    const a = hydrateProjectState({});
    const b = hydrateProjectState({});
    expect(a.screens).not.toBe(b.screens);
  });
});
