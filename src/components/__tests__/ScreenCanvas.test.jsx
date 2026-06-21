import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ScreenCanvas from "../ScreenCanvas.jsx";
import { defaultProjectState, defaultScreen } from "../../lib/templates.js";

const state = { ...defaultProjectState(), _textPos: "top" };
const screen = defaultScreen();

const render = (props) =>
  renderToStaticMarkup(<ScreenCanvas state={state} screen={screen} width={300} {...props} />);

describe("ScreenCanvas overflow clipping", () => {
  it("clips content (overflow hidden) when NOT editing — thumbnails + export", () => {
    expect(render({ editableElements: false })).toContain("overflow:hidden");
  });
  it("lets handles spill (overflow visible) while editing", () => {
    const html = render({ editableElements: true });
    expect(html).toContain("overflow:visible");
    expect(html).not.toContain("overflow:hidden");
  });
});
