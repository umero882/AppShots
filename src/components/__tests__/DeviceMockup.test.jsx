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
  it("paints the metal rail with a custom frame color", () => {
    const html = renderToStaticMarkup(<DeviceMockup device={ios} width={200} color="#d6d6d8" />);
    expect(html).toContain("#d6d6d8"); // base color appears in the rail gradient
  });
  it("hides the camera cutout in landscape orientation", () => {
    const portrait = renderToStaticMarkup(<DeviceMockup device={ios} width={200} orientation="portrait" />);
    const landscape = renderToStaticMarkup(<DeviceMockup device={ios} width={200} orientation="landscape" />);
    expect(portrait).toContain("background:#000"); // island present
    expect(landscape).not.toContain("background:#000");
  });
  it("renders family-distinct frames (iPhone island vs iPad lens)", () => {
    const iph = renderToStaticMarkup(<DeviceMockup device={getDevice("iphone-69")} width={200} />);
    const ipd = renderToStaticMarkup(<DeviceMockup device={getDevice("ipad-13")} width={200} />);
    expect(iph).toContain("background:#000"); // dynamic island
    expect(ipd).toContain("bg-slate-700"); // tiny iPad front lens, not a black pill
    expect(ipd).not.toContain("background:#000");
  });
  it("applies a 3D perspective tilt inside the mockup", () => {
    const html = renderToStaticMarkup(<DeviceMockup device={ios} width={200} tiltY={20} />);
    expect(html).toContain("perspective(");
    expect(html).toContain("rotateY(20deg)");
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
