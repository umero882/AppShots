import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ElementsLayer from "../ElementsLayer.jsx";
import {
  makeElement, makeEmojiElement, makeIconElement, makeImageElement,
  BADGES, SHAPES, ARROWS,
} from "../../lib/elements.js";

const render = (elements, extra = {}) =>
  renderToStaticMarkup(<ElementsLayer elements={elements} width={300} {...extra} />);

describe("ElementsLayer rendering", () => {
  it("renders a badge's text", () => {
    const html = render([makeElement(BADGES.find((b) => b.id === "featured"))]);
    expect(html).toContain("Featured");
  });

  it("renders a rating badge with stars", () => {
    const html = render([makeElement(BADGES.find((b) => b.id === "rating"))]);
    expect(html).toContain("★★★★★");
    expect(html).toContain("4.9");
  });

  it("renders shapes and arrows as svg data-uri images", () => {
    const html = render([makeElement(SHAPES[0]), makeElement(ARROWS[0])]);
    expect(html.match(/data:image\/svg\+xml/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("renders an emoji glyph", () => {
    expect(render([makeEmojiElement("🚀")])).toContain("🚀");
  });

  it("renders an icon as an inline svg", () => {
    const html = render([makeIconElement("Star")]);
    expect(html).toContain("<svg");
  });

  it("renders an image element with its src", () => {
    expect(render([makeImageElement("data:image/png;base64,ZZ")])).toContain("data:image/png;base64,ZZ");
  });

  it("renders nothing for an empty list", () => {
    expect(render([])).not.toContain("<img");
  });

  it("shows selection chrome only when editable AND selected", () => {
    const el = makeElement(SHAPES[0]);
    const plain = render([el], { editable: true, selectedId: null });
    const selected = render([el], { editable: true, selectedId: el.id });
    // delete/rotate/resize handles only appear when selected
    expect(plain).not.toContain("Delete");
    expect(selected).toContain("Delete");
    expect(selected).toContain("Rotate");
    expect(selected).toContain("Resize");
  });

  it("never renders selection chrome when not editable (export/thumbnails)", () => {
    const el = makeElement(SHAPES[0]);
    const html = render([el], { editable: false, selectedId: el.id });
    expect(html).not.toContain("Rotate");
  });

  it("renders elements in array order (later = painted on top)", () => {
    const back = { ...makeEmojiElement("🅱️"), id: "back" };
    const front = { ...makeEmojiElement("🅵"), id: "front" };
    const html = render([back, front]);
    // the later array item must appear later in the markup (higher stacking)
    expect(html.indexOf("🅱️")).toBeLessThan(html.indexOf("🅵"));
  });

  it("applies element opacity", () => {
    const el = { ...makeEmojiElement("🚀"), opacity: 0.4 };
    expect(render([el])).toContain("opacity:0.4");
  });

  it("positions an element by fractional coords", () => {
    const el = { ...makeElement(SHAPES[0]), x: 0.25, y: 0.75 };
    const html = render([el]);
    expect(html).toContain("left:25%");
    expect(html).toContain("top:75%");
  });
});
