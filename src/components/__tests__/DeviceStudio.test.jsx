import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ScreenCanvas from "../ScreenCanvas.jsx";
import { defaultProjectState, defaultScreen } from "../../lib/templates.js";
import { makeDeviceInstance } from "../../lib/deviceLayout.js";

const base = { ...defaultProjectState(), _textPos: "top" };

const heightOf = (html) => {
  const m = html.match(/height:([\d.]+)px/);
  return m ? parseFloat(m[1]) : null;
};

describe("ScreenCanvas — landscape output orientation", () => {
  it("makes the canvas shorter than it is wide in landscape", () => {
    const portrait = renderToStaticMarkup(<ScreenCanvas state={base} screen={defaultScreen()} width={300} />);
    const land = renderToStaticMarkup(
      <ScreenCanvas state={{ ...base, orientation: "landscape" }} screen={defaultScreen()} width={300} />
    );
    expect(heightOf(portrait)).toBeGreaterThan(300);
    expect(heightOf(land)).toBeLessThan(300);
  });
});

describe("ScreenCanvas — free-positioned multiple devices", () => {
  it("renders every device instance on the screen", () => {
    const screen = { ...defaultScreen(), devices: [makeDeviceInstance("iphone-69"), makeDeviceInstance("ipad-13")] };
    const html = renderToStaticMarkup(<ScreenCanvas state={base} screen={screen} width={300} />);
    expect(html.match(/Upload screenshot/g)?.length).toBe(2);
  });
  it("positions a device by its fractional coordinates", () => {
    const screen = { ...defaultScreen(), devices: [makeDeviceInstance("iphone-69", { x: 0.2, y: 0.3 })] };
    const html = renderToStaticMarkup(<ScreenCanvas state={base} screen={screen} width={300} />);
    expect(html).toContain("left:20%");
    expect(html).toContain("top:30%");
  });
});

describe("ScreenCanvas — connected panorama", () => {
  const panoState = {
    ...base,
    panorama: { enabled: true },
    background: { type: "image", image: "data:image/png;base64,PANO" },
  };
  it("spans the background across all screens", () => {
    const html = renderToStaticMarkup(
      <ScreenCanvas state={panoState} screen={defaultScreen()} width={300} screenIndex={1} screenCount={3} />
    );
    expect(html).toContain("background-size:300%");
    expect(html).toContain("data:image/png;base64,PANO");
  });
  it("offsets each screen to its slice", () => {
    const last = renderToStaticMarkup(
      <ScreenCanvas state={panoState} screen={defaultScreen()} width={300} screenIndex={2} screenCount={3} />
    );
    expect(last).toContain("background-position:100% 50%");
  });
  it("is inert with a single screen", () => {
    const html = renderToStaticMarkup(
      <ScreenCanvas state={panoState} screen={defaultScreen()} width={300} screenIndex={0} screenCount={1} />
    );
    expect(html).not.toContain("background-size:300%");
  });
});
