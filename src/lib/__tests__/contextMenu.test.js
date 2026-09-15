import { describe, it, expect, vi } from "vitest";
import { menuItemsFor } from "../contextMenu.js";
import { resolveSelection } from "../selectionTarget.js";
import { defaultProjectState, defaultScreen } from "../templates.js";
import { makeTextElement, makeElement, makeEmojiElement, BADGES } from "../elements.js";
import { makeDeviceInstance } from "../deviceLayout.js";

const actions = () => ({
  editText: vi.fn(), openPanel: vi.fn(), duplicateElement: vi.fn(), reorderElement: vi.fn(), deleteElement: vi.fn(),
  uploadDevice: vi.fn(), removeScreenshot: vi.fn(), duplicateDevice: vi.fn(), promoteDevice: vi.fn(), deleteDevice: vi.fn(),
  uploadBackground: vi.fn(),
});
const labels = (items) => items.map((i) => (i.separator ? "—" : i.label));
const pick = (items, id) => items.find((i) => i.id === id);

const state = defaultProjectState();
const text = makeTextElement({ text: "Hi" });
const badge = makeElement(BADGES[0]);
const emoji = makeEmojiElement("🚀");
const screen = { ...defaultScreen(), heading: "Hello", elements: [text, badge, emoji] };
const sel = (s, scr = screen) => resolveSelection(state, scr, s);

describe("menuItemsFor", () => {
  it("is empty with nothing under the cursor", () => {
    expect(menuItemsFor(null, actions())).toEqual([]);
  });

  it("offers a headline line edit-in-place and the Text panel", () => {
    const a = actions();
    const items = menuItemsFor(sel({ selectedText: "subheading" }), a);
    expect(labels(items)).toEqual(["Edit text", "Open Text panel"]);
    pick(items, "edit").onSelect();
    expect(a.editText).toHaveBeenCalledWith({ kind: "text", id: "subheading" });
    pick(items, "panel").onSelect();
    expect(a.openPanel).toHaveBeenCalledWith("text");
  });

  it("gives a text element edit plus the element actions", () => {
    const a = actions();
    const items = menuItemsFor(sel({ selectedEl: text.id }), a);
    expect(labels(items)).toEqual(["Edit text", "—", "Duplicate", "—", "Bring forward", "Send backward", "Bring to front", "Send to back", "—", "Delete"]);
    pick(items, "edit").onSelect();
    expect(a.editText).toHaveBeenCalledWith({ kind: "element", id: text.id });
    // bottom of the stack: can't go further back
    expect(pick(items, "backward").disabled).toBe(true);
    expect(pick(items, "back").disabled).toBe(true);
    expect(pick(items, "forward").disabled).toBe(false);
    pick(items, "front").onSelect();
    expect(a.reorderElement).toHaveBeenCalledWith(text.id, "front");
    pick(items, "delete").onSelect();
    expect(a.deleteElement).toHaveBeenCalledWith(text.id);
    expect(pick(items, "delete").danger).toBe(true);
  });

  it("lets a badge edit its label but not an emoji", () => {
    expect(labels(menuItemsFor(sel({ selectedEl: badge.id }), actions()))[0]).toBe("Edit text");
    const items = menuItemsFor(sel({ selectedEl: emoji.id }), actions());
    expect(labels(items)[0]).toBe("Duplicate");
    expect(pick(items, "forward").disabled).toBe(true); // top of the stack
  });

  it("offers a free mockup upload / remove / duplicate / delete", () => {
    const a = actions();
    const d = makeDeviceInstance("iphone-69", { image: "data:," });
    const items = menuItemsFor(sel({ selectedDevice: d.id }, { ...defaultScreen(), devices: [d] }), a);
    expect(labels(items)).toEqual(["Replace screenshot…", "Remove screenshot", "—", "Duplicate", "Delete"]);
    pick(items, "clear").onSelect();
    expect(a.removeScreenshot).toHaveBeenCalledWith(d.id);
    pick(items, "delete").onSelect();
    expect(a.deleteDevice).toHaveBeenCalledWith(d.id);
  });

  it("offers the legacy mockup 'position freely' instead of delete, and no remove without a shot", () => {
    const a = actions();
    const items = menuItemsFor(sel({ selectedDevice: "legacy" }, defaultScreen()), a);
    expect(labels(items)).toEqual(["Upload screenshot…", "—", "Duplicate", "Position freely"]);
    pick(items, "promote").onSelect();
    expect(a.promoteDevice).toHaveBeenCalled();
    pick(items, "upload").onSelect();
    expect(a.uploadDevice).toHaveBeenCalledWith("legacy");
  });

  it("offers the backdrop an image upload and the Background panel", () => {
    const a = actions();
    const items = menuItemsFor(sel({ selectedBg: true }), a);
    expect(labels(items)).toEqual(["Upload background image…", "Open Background panel"]);
    pick(items, "upload").onSelect();
    expect(a.uploadBackground).toHaveBeenCalled();
    pick(items, "panel").onSelect();
    expect(a.openPanel).toHaveBeenCalledWith("background");
  });
});
