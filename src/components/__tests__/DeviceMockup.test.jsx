import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeviceMockup, DevicesLayer } from "../DeviceMockup.jsx";
import { getDevice } from "../../lib/devices.js";
import { makeDeviceInstance } from "../../lib/deviceLayout.js";

const ios = getDevice("iphone-69");

describe("DeviceMockup", () => {
  it("renders the uploaded screenshot", () => {
    const html = renderToStaticMarkup(
      <DeviceMockup device={ios} image="data:image/png;base64,ZZ" width={200} />
    );
    expect(html).toContain("data:image/png;base64,ZZ");
  });
  it("shows the upload placeholder when there is no image", () => {
    const html = renderToStaticMarkup(<DeviceMockup device={ios} image={null} width={200} />);
    expect(html).toContain("Upload screenshot");
  });
  it("paints the bezel with a custom frame color", () => {
    const html = renderToStaticMarkup(<DeviceMockup device={ios} width={200} color="#d6d6d8" />);
    expect(html).toContain("background:#d6d6d8");
  });
  it("hides the notch in landscape orientation", () => {
    const portrait = renderToStaticMarkup(<DeviceMockup device={ios} width={200} orientation="portrait" />);
    const landscape = renderToStaticMarkup(<DeviceMockup device={ios} width={200} orientation="landscape" />);
    // the dynamic-island/notch is a black pill div present in portrait only
    expect(portrait.match(/bg-black/g)?.length || 0).toBeGreaterThan(landscape.match(/bg-black/g)?.length || 0);
  });
});

describe("DevicesLayer", () => {
  const render = (devices, extra = {}) =>
    renderToStaticMarkup(<DevicesLayer devices={devices} width={300} {...extra} />);

  it("renders one container per device instance", () => {
    const html = render([makeDeviceInstance("iphone-69"), makeDeviceInstance("ipad-13")]);
    expect(html.match(/data:image\/svg\+xml|Upload screenshot/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("positions a device by fractional coordinates", () => {
    const html = render([makeDeviceInstance("iphone-69", { x: 0.25, y: 0.75 })]);
    expect(html).toContain("left:25%");
    expect(html).toContain("top:75%");
  });

  it("applies a 3D perspective tilt transform", () => {
    const html = render([makeDeviceInstance("iphone-69", { tiltY: 18 })]);
    expect(html).toContain("perspective(");
    expect(html).toContain("rotateY(18deg)");
  });

  it("shows selection handles only for the selected device when editable", () => {
    const d = makeDeviceInstance("iphone-69");
    const plain = render([d], { editable: true, selectedId: null });
    const selected = render([d], { editable: true, selectedId: d.id });
    expect(plain).not.toContain("Rotate");
    expect(selected).toContain("Rotate");
    expect(selected).toContain("Resize");
    expect(selected).toContain("Delete");
  });

  it("never shows handles when not editable (export/thumbnails)", () => {
    const d = makeDeviceInstance("iphone-69");
    expect(render([d], { editable: false, selectedId: d.id })).not.toContain("Rotate");
  });
});
