import { GRADIENTS, FONTS } from "../lib/templates";
import { getDevice } from "../lib/devices";
import { orientedCanvas, screenDevices, isFreeMode, panoramaStyle } from "../lib/deviceLayout";
import { localizeScreen, isRtl } from "../lib/i18n";
import { legibilityHalo } from "../lib/contrast";
import { patternCss } from "../lib/patterns";
import { textEffectStyle } from "../lib/textEffects";
import ElementsLayer from "./ElementsLayer";
import { DeviceMockup, DevicesLayer } from "./DeviceMockup";
import { PhotoFrame } from "./PhotoFrame";
import { Live3DDevice } from "./Live3DDevice";

export function backgroundCss(bg) {
  if (bg.type === "pattern") return patternCss(bg);
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
  // Patterns are a `background` shorthand (image + color), not a plain
  // background-image, and don't span as a panorama — skip.
  if (bg.type === "pattern") return "none";
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
  onFrameCorner,
  onLive3dRotate,
  onLive3dModelInfo,
  exporting = false,
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
  // Photoreal mode: an uploaded device-frame PNG replaces the CSS device.
  const photo = screen.frame?.image ? screen.frame : null;
  // Real-3D mode: a live WebGL device replaces the CSS device (photo wins if both).
  const live = !photo && screen.live3d?.enabled ? screen.live3d : null;

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

  const rtl = isRtl(locale);
  // Deterministic vertical layout so the title + subtitle never overlap in the
  // exported image. html-to-image rasterizes the DOM into an SVG <foreignObject>
  // where a wrapped title's box height (unitless line-height) and sibling margins
  // can mis-measure, painting the subtitle inside the title's span. Pixel
  // line-heights make each line's box exactly N px (measured == painted), and a
  // flex-column gap replaces the flaky margin.
  const titleLine = Math.round(scaledFont * 1.12);
  const subLine = Math.round(scaledSub * 1.3);
  const TextBlock = lscreen.heading ? (
    <div
      className="px-[8%] text-center"
      dir={rtl ? "rtl" : undefined}
      style={{
        fontFamily: font.stack,
        textAlign: state.text.align,
        direction: rtl ? "rtl" : undefined,
        display: "flex",
        flexDirection: "column",
        rowGap: Math.round(scaledFont * 0.32),
      }}
    >
      <div
        style={{
          width: "100%",
          fontSize: scaledFont,
          lineHeight: `${titleLine}px`,
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
            width: "100%",
            fontSize: scaledSub,
            lineHeight: `${subLine}px`,
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

  // Square corners on export: App Store screenshots must be a full opaque
  // rectangle — rounded corners leave transparent pixels that get rejected.
  const radius = exporting ? 0 : width * 0.04;

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
        {!free && !photo && !live && (
          <DeviceMockup
            device={device}
            image={screen.image}
            width={width * (state.deviceScale ?? 0.78)}
            orientation={state.orientation}
            color={state.frameColor}
            fit={state.deviceFit}
          />
        )}
      </div>

      {textPos === "bottom" && (
        <div className="relative z-20 pb-[8%] w-full flex justify-center">{TextBlock}</div>
      )}

      {/* photoreal device frame (uploaded PNG) — replaces the CSS device */}
      {photo && (
        <PhotoFrame
          frame={photo}
          image={screen.image}
          width={width}
          height={height}
          editable={editableDevices}
          onCorner={onFrameCorner}
        />
      )}

      {/* real-3D WebGL device (live, rotatable) — replaces the CSS device */}
      {live && (
        <Live3DDevice
          live3d={live}
          image={screen.image}
          aspect={aspect}
          width={width}
          height={height}
          editable={editableDevices}
          onChange={onLive3dRotate}
          onModelInfo={onLive3dModelInfo}
        />
      )}

      {/* free-positioned device mockups (multi / tilt / rotate / off-canvas) */}
      {free && !photo && !live && (
        <DevicesLayer
          devices={devices}
          width={width}
          getDevice={getDevice}
          defaultColor={state.frameColor}
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
