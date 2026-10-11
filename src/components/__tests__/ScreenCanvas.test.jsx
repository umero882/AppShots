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

describe("ScreenCanvas App Store creative asset (header / search results)", () => {
  const banner = { ...state, deviceId: "aso-header" };
  const headed = { ...defaultScreen(), heading: "Hello" };
  const renderBanner = (props) =>
    renderToStaticMarkup(<ScreenCanvas state={banner} screen={headed} width={840} {...props} />);

  it("renders at the 21:9 header aspect", () => {
    // 840 × 1646/3840 = 360.06…
    expect(renderBanner()).toMatch(/height:360\.0\d*px/);
  });
  it("shows the safe-area guide while editing", () => {
    expect(renderBanner({ editableElements: true })).toContain("data-safe-area");
  });
  it("never rasterizes the guide into an export or a thumbnail", () => {
    expect(renderBanner({ editableElements: true, exporting: true })).not.toContain("data-safe-area");
    expect(renderBanner()).not.toContain("data-safe-area");
  });
  it("store screenshots have no safe-area guide", () => {
    expect(render({ editableElements: true })).not.toContain("data-safe-area");
  });
});

describe("ScreenCanvas In-App Event details page", () => {
  it("stacks the headline above the phone inside the safe area", () => {
    const html = renderToStaticMarkup(
      <ScreenCanvas state={{ ...state, deviceId: "iae-detail" }} screen={{ ...defaultScreen(), heading: "Hi" }} width={300} />
    );
    expect(html).toContain("flex-direction:column");
  });
});
