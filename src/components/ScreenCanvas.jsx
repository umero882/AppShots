import { GRADIENTS, FONTS } from "../lib/templates";
import { getDevice } from "../lib/devices";
import { legibilityHalo } from "../lib/contrast";
import ElementsLayer from "./ElementsLayer";

export function backgroundCss(bg) {
  if (bg.type === "solid") return bg.solid;
  // AI-generated gradients carry a precomputed pure-CSS string (exports cleanly).
  if (bg.type === "gradient" && bg.aiGradient?.css) return bg.aiGradient.css;
  // Image backgrounds are drawn as an <img> layer (below) so they export
  // reliably; this gradient is just the fallback behind that layer.
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
export default function ScreenCanvas({
  state,
  screen,
  width = 280,
  innerRef,
  editableElements = false,
  selectedElement = null,
  onSelectElement,
  onChangeElement,
  onDeleteElement,
}) {
  const device = getDevice(state.deviceId);
  const aspect = device.canvas.h / device.canvas.w;
  const height = width * aspect;
  // Background is per-screen; fall back to the project background for older
  // projects/templates that don't have one yet.
  const background = screen.background || state.background;
  const font = FONTS.find((f) => f.id === state.text.font) || FONTS[0];
  const layoutTop = state.text && screen.heading;
  const textPos = state._textPos || "top";

  const scaledFont = (state.text.size / device.canvas.w) * width;

  // Subheading styling is independent of the header. Fall back to header-derived
  // defaults for older projects that have no `subtext`.
  const sub = {
    color: state.subtext?.color || state.text.color,
    size: state.subtext?.size ?? Math.round(state.text.size * 0.45),
    weight: state.subtext?.weight ?? 500,
  };
  const scaledSub = (sub.size / device.canvas.w) * width;

  // Keep text legible on ANY background (incl. dark-on-dark) with an adaptive
  // opposite-luminance halo, keyed to each line's own color.
  const haloFor = (hex, base) => {
    const h = legibilityHalo(hex);
    const r = Math.max(1, base * 0.07);
    return `0 0 ${r}px rgba(${h},0.6), 0 0 ${r * 2}px rgba(${h},0.45)`;
  };

  const TextBlock = screen.heading ? (
    <div
      className="px-[8%] text-center"
      style={{ fontFamily: font.stack, textAlign: state.text.align }}
    >
      <div
        style={{
          fontSize: scaledFont,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          color: state.text.color,
          fontWeight: state.text.weight,
          textShadow: haloFor(state.text.color, scaledFont),
        }}
      >
        {screen.heading}
      </div>
      {screen.subheading ? (
        <div
          style={{
            fontSize: scaledSub,
            marginTop: scaledFont * 0.35,
            color: sub.color,
            fontWeight: sub.weight,
            textShadow: haloFor(sub.color, scaledSub),
          }}
        >
          {screen.subheading}
        </div>
      ) : null}
    </div>
  ) : null;

  const radius = width * 0.04;

  return (
    <div
      ref={innerRef}
      className="relative flex flex-col items-center"
      style={{
        width,
        height,
        background: backgroundCss(background),
        borderRadius: radius,
        // Clip content for thumbnails + export, but let selection handles spill
        // out while editing so they stay reachable near the canvas edges.
        // (Selection is always cleared before export, so handles never rasterize.)
        overflow: editableElements ? "visible" : "hidden",
      }}
    >
      {/* image background drawn as an <img> layer so it exports reliably */}
      {background.type === "image" && background.image && (
        <img
          src={background.image}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
          crossOrigin="anonymous"
          style={{ borderRadius: radius }}
        />
      )}

      {/* layout */}
      {textPos === "top" && (
        <div className="relative z-10 pt-[8%] w-full flex justify-center">{TextBlock}</div>
      )}

      <div
        className="relative z-10 flex-1 w-full flex items-center justify-center"
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
        <div className="relative z-10 pb-[8%] w-full flex justify-center">{TextBlock}</div>
      )}

      {screen.elements?.length ? (
        <ElementsLayer
          elements={screen.elements}
          width={width}
          editable={editableElements}
          selectedId={selectedElement}
          onSelect={onSelectElement}
          onChange={onChangeElement}
          onDelete={onDeleteElement}
        />
      ) : null}
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
