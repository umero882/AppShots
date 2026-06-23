import { useRef, useState } from "react";
import { X, RotateCw, Maximize2 } from "lucide-react";
import { elementSvg, fracDelta, clamp01, angleFromCenter, distance, scaleFromResize, snapToGuides, twemojiUrl } from "../lib/elements";
import { elementIcon } from "../lib/elementIcons";
import { FONTS } from "../lib/templates";
import { textEffectStyle } from "../lib/textEffects";

/**
 * Renders a screen's elements as positioned overlays. When `editable` is set,
 * the selected element shows a bounding box + drag/resize/rotate/delete handles.
 * Handles are children of the element container, so geometry needs no DOM
 * measuring — corners are CSS-relative to each element's own box.
 *
 * Position is fractional (x,y of canvas); size derives from `width` (canvas px)
 * so elements scale identically in the preview, the thumbnails, and the export.
 */
export default function ElementsLayer({
  elements = [],
  width,
  editable = false,
  selectedId = null,
  onSelect,
  onChange,
  onDelete,
  twemoji = false,
}) {
  const rootRef = useRef(null);
  const drag = useRef(null);
  const [guides, setGuides] = useState({ x: null, y: null });

  function canvasRect() {
    return rootRef.current?.getBoundingClientRect();
  }

  function startMove(e, el) {
    if (!editable) return;
    e.stopPropagation();
    onSelect?.(el.id);
    const rect = canvasRect();
    drag.current = { mode: "move", id: el.id, startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y, rect };
    addWindowListeners();
  }

  function startResize(e, el) {
    e.stopPropagation();
    const rect = canvasRect();
    const cx = rect.left + el.x * rect.width;
    const cy = rect.top + el.y * rect.height;
    drag.current = {
      mode: "resize",
      id: el.id,
      cx,
      cy,
      startDist: distance(cx, cy, e.clientX, e.clientY),
      baseScale: el.scale,
    };
    addWindowListeners();
  }

  function startRotate(e, el) {
    e.stopPropagation();
    const rect = canvasRect();
    const cx = rect.left + el.x * rect.width;
    const cy = rect.top + el.y * rect.height;
    drag.current = {
      mode: "rotate",
      id: el.id,
      cx,
      cy,
      startAngle: angleFromCenter(cx, cy, e.clientX, e.clientY),
      baseRot: el.rotation,
    };
    addWindowListeners();
  }

  function onMove(e) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      const { dx, dy } = fracDelta(e.clientX - d.startX, e.clientY - d.startY, d.rect.width, d.rect.height);
      // snap to canvas center + the other elements' centers
      const targets = [
        { x: 0.5, y: 0.5 },
        ...elements.filter((el) => el.id !== d.id).map((el) => ({ x: el.x, y: el.y })),
      ];
      const snap = snapToGuides(clamp01(d.ox + dx), clamp01(d.oy + dy), targets);
      onChange?.(d.id, { x: snap.x, y: snap.y });
      setGuides({ x: snap.guideX, y: snap.guideY });
    } else if (d.mode === "resize") {
      const dist = distance(d.cx, d.cy, e.clientX, e.clientY);
      onChange?.(d.id, { scale: scaleFromResize(d.baseScale, d.startDist, dist) });
    } else if (d.mode === "rotate") {
      const ang = angleFromCenter(d.cx, d.cy, e.clientX, e.clientY);
      onChange?.(d.id, { rotation: Math.round(d.baseRot + (ang - d.startAngle)) });
    }
  }

  function endDrag() {
    drag.current = null;
    setGuides({ x: null, y: null });
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
  }

  function addWindowListeners() {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-30">
      {editable && guides.x != null && (
        <div
          className="pointer-events-none absolute inset-y-0 z-40 w-px -translate-x-1/2 bg-brand-400/80"
          style={{ left: `${guides.x * 100}%` }}
        />
      )}
      {editable && guides.y != null && (
        <div
          className="pointer-events-none absolute inset-x-0 z-40 h-px -translate-y-1/2 bg-brand-400/80"
          style={{ top: `${guides.y * 100}%` }}
        />
      )}
      {elements.map((el) => {
        const elW = width * el.baseWidth * el.scale;
        const selected = editable && selectedId === el.id;
        return (
          <div
            key={el.id}
            onPointerDown={(e) => startMove(e, el)}
            className={`absolute ${editable ? "pointer-events-auto cursor-move" : ""}`}
            style={{
              left: `${el.x * 100}%`,
              top: `${el.y * 100}%`,
              transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
              width: el.kind === "badge" || el.kind === "text" ? "auto" : elW,
              opacity: el.opacity ?? 1,
            }}
          >
            <ElementContent el={el} elW={elW} width={width} twemoji={twemoji} />

            {selected && (
              <>
                <div className="pointer-events-none absolute -inset-1 rounded-[3px] border-2 border-brand-400" />
                {/* delete */}
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onDelete?.(el.id);
                  }}
                  className="absolute -right-3 -top-3 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white shadow"
                  title="Delete"
                >
                  <X size={12} />
                </button>
                {/* rotate */}
                <button
                  onPointerDown={(e) => startRotate(e, el)}
                  className="absolute left-1/2 -top-7 grid h-5 w-5 -translate-x-1/2 cursor-grab place-items-center rounded-full bg-brand-500 text-white shadow"
                  title="Rotate"
                >
                  <RotateCw size={12} />
                </button>
                {/* resize */}
                <button
                  onPointerDown={(e) => startResize(e, el)}
                  className="absolute -bottom-3 -right-3 grid h-5 w-5 cursor-nwse-resize place-items-center rounded-full bg-white text-ink-900 shadow ring-1 ring-black/10"
                  title="Resize"
                >
                  <Maximize2 size={11} />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ElementContent({ el, elW, width, twemoji }) {
  if (el.kind === "text") {
    const font = FONTS.find((f) => f.id === el.font) || FONTS[0];
    const fs = width * (el.size ?? 0.06) * (el.scale ?? 1);
    return (
      <div
        className="select-none"
        style={{
          fontFamily: font.stack,
          fontSize: fs,
          color: el.color || "#ffffff",
          fontWeight: el.weight ?? 700,
          textAlign: el.align || "center",
          lineHeight: 1.15,
          letterSpacing: "-0.01em",
          whiteSpace: "pre-wrap",
          maxWidth: width * 0.85,
          ...textEffectStyle(el, fs),
        }}
      >
        {el.text}
      </div>
    );
  }
  if (el.kind === "shape" || el.kind === "arrow") {
    return <img src={elementSvg(el)} alt="" className="block w-full select-none" draggable={false} />;
  }
  if (el.kind === "emoji") {
    if (twemoji) {
      return (
        <img
          src={twemojiUrl(el.emoji)}
          alt={el.emoji}
          crossOrigin="anonymous"
          draggable={false}
          className="block w-full select-none"
        />
      );
    }
    return (
      <div style={{ fontSize: elW, lineHeight: 1 }} className="select-none leading-none">
        {el.emoji}
      </div>
    );
  }
  if (el.kind === "icon") {
    const Icon = elementIcon(el.icon);
    return <Icon size={elW} color={el.color || "#111827"} strokeWidth={2} />;
  }
  if (el.kind === "image") {
    return (
      <img
        src={el.image}
        alt=""
        crossOrigin="anonymous"
        draggable={false}
        className="block w-full select-none rounded-xl object-contain shadow-lg"
      />
    );
  }
  // badge (HTML, exports crisp)
  return <Badge el={el} width={width} />;
}

function Badge({ el, width }) {
  const fs = width * 0.05 * el.scale;
  const pad = fs * 0.55;
  const common = {
    fontSize: fs,
    color: el.fg || "#fff",
    background: el.bg || "#111827",
    borderRadius: el.badge === "callout" ? fs * 0.7 : 999,
  };
  if (el.badge === "rating") {
    return (
      <div
        className="flex select-none items-center gap-1 font-bold shadow-lg"
        style={{ ...common, padding: `${pad * 0.7}px ${pad}px` }}
      >
        <span style={{ color: el.color || "#f59e0b", letterSpacing: "0.05em" }}>
          {"★".repeat(el.stars || 5)}
        </span>
        <span>{el.text}</span>
      </div>
    );
  }
  // pill / callout
  return (
    <div className="relative inline-block">
      <div
        className="flex select-none items-center gap-1.5 whitespace-nowrap font-bold shadow-lg"
        style={{ ...common, padding: `${pad * 0.65}px ${pad}px` }}
      >
        {el.emoji ? <span>{el.emoji}</span> : null}
        <span>{el.text}</span>
      </div>
      {el.badge === "callout" && (
        <div
          className="absolute left-5 -bottom-1.5 h-3 w-3 rotate-45"
          style={{ background: el.bg || "#111827" }}
        />
      )}
    </div>
  );
}
