import { GRADIENTS, FONTS } from "../lib/templates";
import { getDevice } from "../lib/devices";
import { legibilityHalo } from "../lib/contrast";

function gradientCss(bg) {
  if (bg.type === "solid") return bg.solid;
  const g = GRADIENTS.find((x) => x.id === bg.gradient) || GRADIENTS[0];
  return `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`;
}

function Notch({ type }) {
  if (type === "none") return null;
  if (type === "dynamic-island") {
    return (
      <div className="absolute left-1/2 top-[1.5%] -translate-x-1/2 h-[3.5%] aspect-[2.6] rounded-full bg-black z-20" />
    );
  }
  if (type === "notch") {
    return (
      <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[3%] w-[42%] rounded-b-2xl bg-black z-20" />
    );
  }
  // punch-hole
  return (
    <div className="absolute left-1/2 top-[1.4%] -translate-x-1/2 h-[1.6%] aspect-square rounded-full bg-black z-20" />
  );
}

/**
 * Renders a single store screenshot (background + text + framed device).
 * `width` controls the on-screen size; aspect ratio comes from the device.
 */
export default function ScreenCanvas({ state, screen, width = 280, innerRef }) {
  const device = getDevice(state.deviceId);
  const aspect = device.canvas.h / device.canvas.w;
  const height = width * aspect;
  const font = FONTS.find((f) => f.id === state.text.font) || FONTS[0];
  const layoutTop = state.text && screen.heading;
  const textPos = state._textPos || "top";

  const scaledFont = (state.text.size / device.canvas.w) * width;

  // Keep headline/subheading legible on ANY background (incl. dark-on-dark or
  // light-on-light) with an adaptive opposite-luminance halo.
  const halo = legibilityHalo(state.text.color);
  const haloR = Math.max(1, scaledFont * 0.07);
  const textShadow = `0 0 ${haloR}px rgba(${halo},0.6), 0 0 ${haloR * 2}px rgba(${halo},0.45)`;

  const TextBlock = screen.heading ? (
    <div
      className="px-[8%] text-center"
      style={{
        fontFamily: font.stack,
        color: state.text.color,
        fontWeight: state.text.weight,
        textAlign: state.text.align,
        textShadow,
      }}
    >
      <div style={{ fontSize: scaledFont, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
        {screen.heading}
      </div>
      {screen.subheading ? (
        <div
          style={{
            fontSize: scaledFont * 0.45,
            marginTop: scaledFont * 0.35,
            opacity: 0.85,
            fontWeight: 500,
          }}
        >
          {screen.subheading}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      ref={innerRef}
      className="relative overflow-hidden flex flex-col items-center"
      style={{
        width,
        height,
        background: gradientCss(state.background),
        borderRadius: width * 0.04,
      }}
    >
      {/* layout */}
      {textPos === "top" && (
        <div className="pt-[8%] w-full flex justify-center">{TextBlock}</div>
      )}

      <div
        className="flex-1 w-full flex items-center justify-center"
        style={{ paddingTop: textPos === "bottom" ? "6%" : 0 }}
      >
        <DeviceFrame
          device={device}
          image={screen.image}
          scale={state.deviceScale}
          frameWidth={width}
        />
      </div>

      {textPos === "bottom" && (
        <div className="pb-[8%] w-full flex justify-center">{TextBlock}</div>
      )}
    </div>
  );
}

function DeviceFrame({ device, image, scale, frameWidth }) {
  const w = frameWidth * scale;
  const aspect = device.canvas.h / device.canvas.w;
  const h = w * aspect;
  const bezel = Math.max(4, w * 0.035);

  return (
    <div
      className="relative shadow-2xl"
      style={{
        width: w,
        height: h,
        background: device.bezel.color,
        borderRadius: w * 0.13,
        padding: bezel,
        boxShadow: "0 25px 60px -15px rgba(0,0,0,0.55)",
      }}
    >
      <div
        className="relative w-full h-full overflow-hidden bg-white"
        style={{ borderRadius: w * 0.1 }}
      >
        <Notch type={device.notch} />
        {image ? (
          <img
            src={image}
            alt="app screenshot"
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 text-slate-400">
            <svg width="28%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span className="mt-2 text-[10px] font-medium uppercase tracking-wider">
              Upload screenshot
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
