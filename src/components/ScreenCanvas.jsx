import { GRADIENTS, FONTS } from "../lib/templates";
import { getDevice } from "../lib/devices";
import { orientedCanvas, screenDevices, isFreeMode, panoramaStyle } from "../lib/deviceLayout";
import { localizeScreen } from "../lib/i18n";
import { legibilityHalo } from "../lib/contrast";
import { textEffectStyle } from "../lib/textEffects";
import ElementsLayer from "./ElementsLayer";
import { DeviceMockup, DevicesLayer } from "./DeviceMockup";

export function backgroundCss(bg) {
  if (bg.type === "solid") return bg.solid;
  // AI-generated gradients carry a precomputed pure-CSS string (exports cleanly).
  if (bg.type === "gradient" && bg.aiGradient?.css) return bg.aiGradient.css;
  // Image backgrounds are drawn as an <img> layer (below) so they export
  // reliably; this gradient is just the fallback behind that layer.
  const g = GRADIENTS.find((x) => x.id === bg.gradient) || GRADIENTS[0];
  return `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`;
}

// A background value usable as a CSS `background-image` (for the panorama layer,
// which needs background-size/position). Images become url(); gradients pass
// through; a solid has no image to span so we return none.
function backgroundImageCss(bg) {
  if (bg.type === "image" && bg.image) return `url("${bg.image}")`;
  if (bg.type === "solid") return "none";
  return backgroundCss(bg);
}

/**
 * Renders a single store screenshot: background + headline + framed device(s) +
 * elements. `width` controls on-screen size; aspect ratio comes from the output
 * device honoring `state.orientation`. `screenIndex`/`screenCount` drive the
 * connected-panorama slice.
 */
export default function ScreenCanvas({
  state,
  screen,
  width = 280,
  innerRef,
  screenIndex = 0,
  screenCount = 1,
  panoramaBg = null,
  locale = null,
  editableElements = false,
  selectedElement = null,
  onSelectElement,
  onChangeElement,
  onDeleteElement,
  editableDevices = false,
  selectedDevice = null,
  onSelectDevice,
  onChangeDevice,
  onDeleteDevice,
}) {
  const device = getDevice(state.deviceId);
  const canvas = orientedCanvas(device, state.orientation);
  const aspect = canvas.h / canvas.w;
  const height = width * aspect;
  // Background is per-screen; fall back to the project background for older
  // projects/templates that don't have one yet.
  const background = screen.background || state.background;
  const font = FONTS.find((f) => f.id === state.text.font) || FONTS[0];
  const textPos = state._textPos || "top";
  // Headline/subheading resolved for the active locale (base text otherwise).
  const lscreen = localizeScreen(screen, locale);

  const free = isFreeMode(screen);
  const devices = screenDevices(screen, state);

  // Connected panorama: one shared design spanning every screen. The design is
  // the first screen's background (passed in), so editing screen 1's background
  // drives the whole panorama.
  const pano = !!state.panorama?.enabled && screenCount > 1;
  const panoDesign = panoramaBg || state.background;
  const paneStyle = pano ? panoramaStyle(screenIndex, screenCount) : null;

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

  const TextBlock = lscreen.heading ? (
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
          ...textEffectStyle(state.text, scaledFont),
        }}
      >
        {lscreen.heading}
      </div>
      {lscreen.subheading ? (
        <div
          style={{
            fontSize: scaledSub,
            marginTop: scaledFont * 0.35,
            color: sub.color,
            fontWeight: sub.weight,
            textShadow: haloFor(sub.color, scaledSub),
          }}
        >
          {lscreen.subheading}
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
        background: pano ? "#0b0b0e" : backgroundCss(background),
        borderRadius: radius,
        // Clip content for thumbnails + export, but let selection handles spill
        // out while editing so they stay reachable near the canvas edges.
        // (Selection is always cleared before export, so handles never rasterize.)
        overflow: editableElements || editableDevices ? "visible" : "hidden",
      }}
    >
      {/* connected-panorama design layer — one image/gradient spanning screens */}
      {pano && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{ backgroundImage: backgroundImageCss(panoDesign), borderRadius: radius, ...paneStyle }}
        />
      )}

      {/* per-screen image background drawn as an <img> layer so it exports reliably */}
      {!pano && background.type === "image" && background.image && (
        <>
          <img
            src={background.image}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
            crossOrigin="anonymous"
            style={{
              borderRadius: radius,
              filter: background.blur ? `blur(${(background.blur / 100) * width}px)` : undefined,
              // scale up slightly so blur doesn't reveal the clipped edges
              transform: background.blur ? "scale(1.08)" : undefined,
            }}
          />
          {background.overlay && background.overlayOpacity > 0 && (
            <div
              className="pointer-events-none absolute inset-0 z-[1]"
              style={{ background: background.overlay, opacity: background.overlayOpacity, borderRadius: radius }}
            />
          )}
        </>
      )}

      {/* layout: headline above / below, device in the middle band (legacy flow) */}
      {textPos === "top" && (
        <div className="relative z-20 pt-[8%] w-full flex justify-center">{TextBlock}</div>
      )}

      <div
        className="relative z-10 flex-1 w-full flex items-center justify-center"
        style={{ paddingTop: textPos === "bottom" ? "6%" : 0 }}
      >
        {!free && (
          <DeviceMockup
            device={device}
            image={screen.image}
            width={width * (state.deviceScale ?? 0.78)}
            orientation={state.orientation}
          />
        )}
      </div>

      {textPos === "bottom" && (
        <div className="relative z-20 pb-[8%] w-full flex justify-center">{TextBlock}</div>
      )}

      {/* free-positioned device mockups (multi / tilt / rotate / off-canvas) */}
      {free && (
        <DevicesLayer
          devices={devices}
          width={width}
          getDevice={getDevice}
          editable={editableDevices}
          selectedId={selectedDevice}
          onSelect={onSelectDevice}
          onChange={onChangeDevice}
          onDelete={onDeleteDevice}
        />
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
          twemoji={state.twemoji}
        />
      ) : null}
    </div>
  );
}
