import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DevicePanel from "../DevicePanel.jsx";
import { defaultProjectState, defaultScreen } from "../../lib/templates.js";
import { makeDeviceInstance } from "../../lib/deviceLayout.js";

const baseProps = {
  state: defaultProjectState(),
  update: vi.fn(),
  selectedDevice: null,
  onAdd: vi.fn(), onChange: vi.fn(), onDelete: vi.fn(),
  onDuplicate: vi.fn(), onSelect: vi.fn(), onPromote: vi.fn(), onPose: vi.fn(),
};

const render = (props) => renderToStaticMarkup(<DevicePanel {...baseProps} {...props} />);

describe("DevicePanel — legacy (single device)", () => {
  it("renders the output size + orientation + promote affordance", () => {
    const html = render({ screen: defaultScreen() });
    expect(html).toContain("Screenshot size");
    expect(html).toContain("1290×2796"); // iphone-69 portrait
    expect(html).toContain("portrait");
    expect(html).toContain("landscape");
    expect(html).toContain("Position &amp; tilt freely");
    expect(html).toContain("Connected panorama");
  });
  it("offers one-click 3D perspective poses", () => {
    const html = render({ screen: defaultScreen() });
    expect(html).toContain("3D perspective");
    expect(html).toContain("Iso L");
    expect(html).toContain("Back");
  });
  it("offers device frame color swatches", () => {
    const html = render({ screen: defaultScreen() });
    expect(html).toContain("Frame color");
    expect(html).toContain("#54545a"); // titanium swatch
    expect(html).toContain("#cdb58e"); // gold swatch
  });
  it("reflects landscape output dimensions", () => {
    const html = render({ screen: defaultScreen(), state: { ...defaultProjectState(), orientation: "landscape" } });
    expect(html).toContain("2796×1290");
  });
});

describe("DevicePanel — free mode (multiple mockups)", () => {
  const a = makeDeviceInstance("iphone-69");
  const b = makeDeviceInstance("ipad-13");
  const screen = { ...defaultScreen(), devices: [a, b] };

  it("lists every mockup and the per-mockup controls for the selected one", () => {
    const html = render({ screen, selectedDevice: b.id });
    expect(html).toContain("iPad 12.9"); // escaped quote in markup; match the name stem
    expect(html).toContain("Selected mockup");
    expect(html).toContain("Position X");
    expect(html).toContain("Tilt"); // tilt sliders present
    expect(html).toContain("Add device");
    expect(html).not.toContain("Position &amp; tilt freely"); // no promote button in free mode
  });
});
