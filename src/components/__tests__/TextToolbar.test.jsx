import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TextToolbar from "../TextToolbar.jsx";
import ScreenCanvas from "../ScreenCanvas.jsx";
import { resolveTextTarget } from "../../lib/textTarget.js";
import { defaultProjectState, defaultScreen } from "../../lib/templates.js";

const state = defaultProjectState();
const screen = { ...defaultScreen(), heading: "Hello", subheading: "World" };

describe("TextToolbar", () => {
  it("shows the in-place editing hint when nothing is targeted", () => {
    const html = renderToStaticMarkup(<TextToolbar target={null} onChange={() => {}} />);
    expect(html).toContain("double-click to edit it in place");
    expect(html).not.toContain("aria-label=\"Font\"");
  });

  it("renders every control for the headline", () => {
    const target = resolveTextTarget(state, screen, { kind: "heading" });
    const html = renderToStaticMarkup(<TextToolbar target={target} onChange={() => {}} />);
    expect(html).toContain("Headline");
    for (const label of ["Font", "Smaller", "Larger", "Weight", "Align left", "Align center", "Align right", "Color", "Effect"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain(`${state.text.size}px`);
  });

  it("hides the effect picker for the subheading, which has none", () => {
    const target = resolveTextTarget(state, screen, { kind: "subheading" });
    const html = renderToStaticMarkup(<TextToolbar target={target} onChange={() => {}} />);
    expect(html).toContain("Subheading");
    expect(html).not.toContain('aria-label="Effect"');
  });

  it("disables the stepper at the range ends", () => {
    const max = { ...state, text: { ...state.text, size: 110 } };
    const html = renderToStaticMarkup(
      <TextToolbar target={resolveTextTarget(max, screen, { kind: "heading" })} onChange={() => {}} />
    );
    expect(html).toMatch(/aria-label="Larger" disabled=""/);
    expect(html).not.toMatch(/aria-label="Smaller" disabled=""/);
  });
});

describe("ScreenCanvas text selection ring", () => {
  const render = (props) =>
    renderToStaticMarkup(<ScreenCanvas state={{ ...state, _textPos: "top" }} screen={screen} width={300} {...props} />);

  it("rings the selected line only in the editor", () => {
    expect(render({ editableText: true, selectedText: "heading" }).match(/ring-1 ring-brand-400\/80/g)?.length).toBe(1);
    expect(render({ editableText: true })).not.toContain("ring-1 ring-brand-400/80");
    expect(render({ selectedText: "heading" })).not.toContain("ring-1 ring-brand-400/80");
    expect(render({ editableText: true, selectedText: "heading", exporting: true })).not.toContain("ring-brand");
  });
});
