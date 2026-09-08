/**
 * A shared template carries look, never content. Two things depend on that: a
 * teammate must not be able to publish an unreleased app design by saving a
 * style, and Firestore rejects any indexed value over 1500 bytes — so a pasted
 * data-URL would fail the write outright.
 */
import { describe, it, expect } from "vitest";
import {
  applyTeamTemplate,
  canDeleteTemplate,
  storableBackground,
  styleFromState,
  suggestTemplateName,
} from "../teamTemplates";

const dataUrl = "data:image/png;base64," + "A".repeat(4000);

const state = {
  deviceId: "iphone-69",
  layoutId: "text-top",
  deviceScale: 0.78,
  background: { type: "gradient", gradient: "indigo", solid: "#6366f1", image: null },
  text: { font: "inter", color: "#ffffff", size: 64 },
  subtext: { color: "#e5e7eb", size: 28 },
  screens: [{ id: "s1", heading: "Secret unreleased feature", image: dataUrl }],
};

describe("styleFromState", () => {
  it("takes the look and leaves the content", () => {
    const style = styleFromState(state);
    expect(style).toHaveProperty("background");
    expect(style).toHaveProperty("text");
    expect(style).toHaveProperty("subtext");
    expect(style.screens).toBeUndefined();
    expect(JSON.stringify(style)).not.toContain("Secret unreleased feature");
    expect(JSON.stringify(style)).not.toContain("data:image");
  });

  it("skips fields the project does not have", () => {
    expect(styleFromState({ deviceId: "pixel-8" })).toEqual({ deviceId: "pixel-8" });
  });
});

describe("storableBackground", () => {
  it("falls back to the gradient rather than storing an uploaded image", () => {
    const bg = storableBackground({ type: "image", image: dataUrl, gradient: "ocean", solid: "#0ea5e9" });
    expect(bg.image).toBeNull();
    expect(bg.type).toBe("gradient");
  });

  it("falls back to solid when there is no gradient to fall back to", () => {
    const bg = storableBackground({ type: "image", image: dataUrl, solid: "#111827" });
    expect(bg.type).toBe("solid");
  });

  it("keeps a short blob URL, which is the whole reason uploads go there", () => {
    const bg = storableBackground({ type: "image", image: "/api/blob/abc123" });
    expect(bg).toEqual({ type: "image", image: "/api/blob/abc123" });
  });
});

describe("applyTeamTemplate", () => {
  const project = {
    deviceId: "ipad-13",
    layoutId: "centered",
    background: { type: "solid", solid: "#000000" },
    text: { font: "mono", color: "#00ff00", size: 40 },
    screens: [{ id: "a", heading: "Mine", image: "shot.png" }],
  };

  it("restyles without touching the screens", () => {
    const next = applyTeamTemplate(project, { style: styleFromState(state) });
    expect(next.screens).toBe(project.screens);
    expect(next.background.gradient).toBe("indigo");
    expect(next.text.color).toBe("#ffffff");
    expect(next.deviceId).toBe("iphone-69");
  });

  it("leaves fields a template never knew about alone", () => {
    // A template saved before `subtext` existed must not erase it from a project
    // that has one.
    const next = applyTeamTemplate({ ...project, subtext: { size: 22 } }, { style: { deviceId: "pixel-8" } });
    expect(next.subtext).toEqual({ size: 22 });
    expect(next.deviceId).toBe("pixel-8");
  });

  it("copies objects instead of sharing them", () => {
    const template = { style: styleFromState(state) };
    const next = applyTeamTemplate(project, template);
    next.text.color = "#ff0000";
    expect(template.style.text.color).toBe("#ffffff");
  });

  it("survives a template with no style at all", () => {
    expect(applyTeamTemplate(project, {})).toEqual(project);
  });
});

describe("suggestTemplateName", () => {
  it("uses the project name", () => {
    expect(suggestTemplateName("Launch shots", [])).toBe("Launch shots");
  });

  it("does not collide with one that exists", () => {
    expect(suggestTemplateName("Launch shots", [{ name: "launch shots" }])).toBe("Launch shots 2");
  });

  it("has something to say for an unnamed project", () => {
    expect(suggestTemplateName("", [])).toBe("Team style");
  });
});

describe("canDeleteTemplate", () => {
  const mine = { createdBy: "me" };
  const theirs = { createdBy: "them" };

  it("lets the author remove their own", () => {
    expect(canDeleteTemplate(mine, "me", "member")).toBe(true);
  });

  it("lets managers tidy up", () => {
    expect(canDeleteTemplate(theirs, "me", "admin")).toBe(true);
    expect(canDeleteTemplate(theirs, "me", "owner")).toBe(true);
  });

  it("stops a member deleting someone else's", () => {
    expect(canDeleteTemplate(theirs, "me", "member")).toBe(false);
  });
});
