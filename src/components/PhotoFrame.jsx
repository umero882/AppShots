import { useRef } from "react";
import { cssMatrix3d, cornersToPx } from "../lib/warp";

/**
 * Photoreal device frame: a screenshot perspective-warped onto the angled screen
 * of an uploaded device-frame PNG (transparent screen), with the frame composited
 * on top. When editable, four draggable pins let you align the screenshot to the
 * frame's screen corners.
 *
 * The warp is a CSS matrix3d (homography from warp.js) — a single transformed
 * element, so html-to-image exports it the same way it exports the 3D tilt.
 */
export function PhotoFrame({ frame, image, width, height, editable = false, onCorner }) {
  const rootRef = useRef(null);
  const drag = useRef(null);
  const corners = frame.corners;
  const matrix = cssMatrix3d(width, height, cornersToPx(corners, width, height));

  function startDrag(e, i) {
    e.stopPropagation();
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { i, rect };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onMove(e) {
    const d = drag.current;
    if (!d) return;
    const x = (e.clientX - d.rect.left) / d.rect.width;
    const y = (e.clientY - d.rect.top) / d.rect.height;
    onCorner?.(d.i, Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
  }
  function onUp() {
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }

  return (
    <div ref={rootRef} className="absolute inset-0 z-10">
      {/* screenshot warped onto the device screen */}
      {image && (
        <img
          src={image}
          alt="app screenshot"
          crossOrigin="anonymous"
          draggable={false}
          style={{
            position: "absolute", left: 0, top: 0, width, height,
            objectFit: "cover", transformOrigin: "0 0", transform: matrix,
          }}
        />
      )}
      {/* the device frame PNG (transparent screen) on top */}
      <img
        src={frame.image}
        alt="device frame"
        crossOrigin="anonymous"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ objectFit: "contain" }}
      />
      {/* corner pins */}
      {editable && corners.map((c, i) => (
        <button
          key={i}
          onPointerDown={(e) => startDrag(e, i)}
          title="Drag to align the screenshot to the screen corner"
          className="absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-brand-500 shadow ring-1 ring-black/30"
          style={{ left: `${c[0] * 100}%`, top: `${c[1] * 100}%` }}
        />
      ))}
    </div>
  );
}
