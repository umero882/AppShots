import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import InlineText from "../InlineText.jsx";
import ScreenCanvas from "../ScreenCanvas.jsx";
import ElementsLayer from "../ElementsLayer.jsx";
import { defaultProjectState, defaultScreen } from "../../lib/templates.js";
import { makeTextElement, makeElement, BADGES } from "../../lib/elements.js";

describe("InlineText", () => {
  it("renders the plain text when not editing", () => {
    const html = renderToStaticMarkup(<InlineText value="Track your habits" />);
    expect(html).toContain("Track your habits");
    expect(html).not.toContain("contenteditable");
  });

  it("becomes an editable field while editing, seeded on mount rather than rendered", () => {
    // The text is set imperatively after mount so React never rewrites the node
    // under the caret — static markup therefore holds the field, not the text.
    const html = renderToStaticMarkup(<InlineText value="Track your habits" editing />);
    expect(html).toContain('contenteditable="true"');
    expect(html).toContain('role="textbox"');
    expect(html).not.toContain("Track your habits");
  });

  it("only offers the text cursor when it can be edited", () => {
    expect(renderToStaticMarkup(<InlineText value="x" onStart={() => {}} />)).toContain("cursor-text");
    expect(renderToStaticMarkup(<InlineText value="x" />)).not.toContain("cursor-text");
  });

  it("keeps the typography while editing", () => {
    const html = renderToStaticMarkup(
      <InlineText value="x" editing style={{ fontSize: 40, lineHeight: "45px" }} caret="#123456" />
    );
    expect(html).toContain("font-size:40px");
    expect(html).toContain("line-height:45px");
    expect(html).toContain("min-height:45px");
    expect(html).toContain("caret-color:#123456");
  });
});

describe("ScreenCanvas inline headline", () => {
  const state = { ...defaultProjectState(), _textPos: "top" };
  const screen = { ...defaultScreen(), heading: "Hello", subheading: "World" };
  const render = (props) =>
    renderToStaticMarkup(<ScreenCanvas state={state} screen={screen} width={300} {...props} />);

  it("is a plain, non-interactive node for thumbnails and export", () => {
    const html = render({});
    expect(html).toContain("Hello");
    expect(html).toContain("World");
    expect(html).not.toContain("cursor-text");
    expect(html).not.toContain("contenteditable");
  });

  it("invites editing in the editor", () => {
    const html = render({ editableText: true });
    expect(html.match(/cursor-text/g)?.length).toBe(2); // headline + subheading
    expect(html).not.toContain("contenteditable"); // until double-clicked
  });

  it("never invites editing while exporting", () => {
    expect(render({ editableText: true, exporting: true })).not.toContain("cursor-text");
  });

  it("does not add an editor-only placeholder row when there is no headline", () => {
    // An extra line would shrink the device band in the editor but not the export.
    const html = renderToStaticMarkup(
      <ScreenCanvas state={state} screen={{ ...defaultScreen(), heading: "" }} width={300} editableText />
    );
    expect(html).not.toContain("cursor-text");
  });
});

describe("ElementsLayer inline labels", () => {
  const render = (elements, extra = {}) =>
    renderToStaticMarkup(<ElementsLayer elements={elements} width={300} {...extra} />);

  it("text blocks and badges invite editing only when the layer is editable", () => {
    const els = [makeTextElement({ text: "Hi" }), makeElement(BADGES.find((b) => b.text === "Featured"))];
    expect(render(els).match(/cursor-text/g)).toBeNull();
    expect(render(els, { editable: true }).match(/cursor-text/g)?.length).toBe(2);
  });

  it("still renders the badge label and text content", () => {
    const html = render([makeTextElement({ text: "Hi there" }), makeElement(BADGES.find((b) => b.badge === "rating"))], { editable: true });
    expect(html).toContain("Hi there");
    expect(html).toContain("4.9");
    expect(html).toContain("★★★★★");
  });
});
