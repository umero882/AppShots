import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CanvasToolbar from "../CanvasToolbar.jsx";
import ScreenCanvas from "../ScreenCanvas.jsx";
import { resolveSelection } from "../../lib/selectionTarget.js";
import { defaultProjectState, defaultScreen } from "../../lib/templates.js";
import { makeTextElement, makeElement, makeEmojiElement, BADGES, SHAPES } from "../../lib/elements.js";
import { makeDeviceInstance } from "../../lib/deviceLayout.js";

const state = defaultProjectState();
const text = makeTextElement({ text: "Hi" });
const badge = makeElement(BADGES[0]);
const shape = makeElement(SHAPES[0]);
const emoji = makeEmojiElement("🚀");
const screen = { ...defaultScreen(), heading: "Hello", subheading: "World", elements: [text, badge, shape, emoji] };
const noop = () => {};
const render = (target) => renderToStaticMarkup(<CanvasToolbar target={target} onTextStyle={noop} onElementChange={noop} onElementReorder={noop} onElementDuplicate={noop} onElementDelete={noop} onDeviceChange={noop} onDeviceUpload={noop} onDeviceDuplicate={noop} onDeviceDelete={noop} />);
const sel = (s) => resolveSelection(state, screen, s);

describe("CanvasToolbar", () => {
  it("shows the in-place editing hint when nothing is selected", () => {
    const html = render(null);
    expect(html).toContain("double-click to edit it in place");
    expect(html).not.toContain('aria-label="Font"');
  });

  it("renders every typography control for the headline, and no element actions", () => {
    const html = render(sel({ selectedText: "heading" }));
    expect(html).toContain("Headline");
    for (const label of ["Font", "Smaller", "Larger", "Weight", "Align left", "Align center", "Align right", "Color", "Effect"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain(`${state.text.size}px`);
    expect(html).not.toContain("Duplicate");
    expect(html).not.toContain("Delete");
  });

  it("hides the effect picker for the subheading, which has none", () => {
    const html = render(sel({ selectedText: "subheading" }));
    expect(html).toContain("Subheading");
    expect(html).not.toContain('aria-label="Effect"');
  });

  it("gives a text element typography plus layer, duplicate and delete", () => {
    const html = render(sel({ selectedEl: text.id }));
    expect(html).toContain('aria-label="Font"');
    expect(html).toContain('aria-label="Bring forward"');
    expect(html).toMatch(/aria-label="Send backward" disabled=""/); // bottom of the stack
    expect(html).toContain("Duplicate");
    expect(html).toContain("Delete");
  });

  it("gives a badge fill + text colors and opacity", () => {
    const html = render(sel({ selectedEl: badge.id }));
    expect(html).toContain("Badge");
    expect(html).toContain('aria-label="Fill"');
    expect(html).toContain('aria-label="Text"');
    expect(html).toContain("100%");
    expect(html).not.toContain('aria-label="Font"');
  });

  it("gives a shape one color, and an emoji none but still opacity + actions", () => {
    expect(render(sel({ selectedEl: shape.id }))).toContain('aria-label="Color"');
    const html = render(sel({ selectedEl: emoji.id }));
    expect(html).toContain("Emoji");
    expect(html).not.toContain('type="color"');
    expect(html).toContain('aria-label="More opaque" disabled=""'); // already 100%
    expect(html).toMatch(/aria-label="Bring forward" disabled=""/); // top of the stack
    expect(html).toContain("Duplicate");
  });

  it("gives a device mockup screenshot, size and actions, without layer buttons", () => {
    const d = makeDeviceInstance("iphone-69", { scale: 0.6 });
    const target = resolveSelection(state, { ...defaultScreen(), devices: [d] }, { selectedDevice: d.id });
    const html = render(target);
    expect(html).toContain("Upload screenshot");
    expect(html).toContain("60%");
    expect(html).toContain("Duplicate");
    expect(html).toContain("Delete");
    expect(html).not.toContain("Bring forward");
    const withImage = resolveSelection(state, { ...defaultScreen(), devices: [{ ...d, image: "data:," }] }, { selectedDevice: d.id });
    expect(render(withImage)).toContain("Replace screenshot");
  });

  it("disables the size stepper at the range ends", () => {
    const max = { ...state, text: { ...state.text, size: 110 } };
    const html = render(resolveSelection(max, screen, { selectedText: "heading" }));
    expect(html).toMatch(/aria-label="Larger" disabled=""/);
    expect(html).not.toMatch(/aria-label="Smaller" disabled=""/);
  });
});

describe("ScreenCanvas text selection ring", () => {
  const draw = (props) =>
    renderToStaticMarkup(<ScreenCanvas state={{ ...state, _textPos: "top" }} screen={screen} width={300} {...props} />);

  it("rings the selected line only in the editor", () => {
    expect(draw({ editableText: true, selectedText: "heading" }).match(/ring-1 ring-brand-400\/80/g)?.length).toBe(1);
    expect(draw({ editableText: true })).not.toContain("ring-1 ring-brand-400/80");
    expect(draw({ selectedText: "heading" })).not.toContain("ring-1 ring-brand-400/80");
    expect(draw({ editableText: true, selectedText: "heading", exporting: true })).not.toContain("ring-brand");
  });
});
