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

describe("ScreenCanvas text effects", () => {
  const headed = { ...defaultScreen(), heading: "Hello" };
  it("applies a gradient text effect to the headline", () => {
    const st = { ...state, text: { ...state.text, effect: "gradient", gradientFrom: "#112233", gradientTo: "#445566" } };
    const html = renderToStaticMarkup(<ScreenCanvas state={st} screen={headed} width={300} />);
    expect(html).toContain("background-clip:text");
    expect(html).toContain("#112233");
  });
  it("applies an outline stroke effect", () => {
    const st = { ...state, text: { ...state.text, effect: "outline", color: "#ffffff" } };
    const html = renderToStaticMarkup(<ScreenCanvas state={st} screen={headed} width={300} />);
    expect(html).toMatch(/-webkit-text-stroke|text-stroke/i);
  });
});

describe("ScreenCanvas image background blur + overlay", () => {
  const imgScreen = {
    ...defaultScreen(),
    background: {
      type: "image",
      image: "data:image/png;base64,ZZ",
      blur: 5,
      overlay: "#000000",
      overlayOpacity: 0.4,
    },
  };
  const renderImg = () =>
    renderToStaticMarkup(<ScreenCanvas state={state} screen={imgScreen} width={300} />);

  it("applies a blur filter to the background image", () => {
    expect(renderImg()).toContain("filter:blur(");
  });
  it("renders the overlay scrim with its opacity", () => {
    expect(renderImg()).toContain("opacity:0.4");
  });
  it("omits blur/overlay when not set", () => {
    const plain = renderToStaticMarkup(
      <ScreenCanvas
        state={state}
        screen={{ ...defaultScreen(), background: { type: "image", image: "data:x" } }}
        width={300}
      />
    );
    expect(plain).not.toContain("filter:blur(");
  });
});
