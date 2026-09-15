import { useRef, useState } from "react";
import { Copy, Trash2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import ScreenCanvas from "./ScreenCanvas";
import { slotAt, moveTarget } from "../lib/reorder";

const DRAG_THRESHOLD = 4; // px before a press becomes a drag (so clicks still select)

/**
 * The strip of screen thumbnails under the stage. Click selects, hover shows
 * duplicate / delete / move arrows, right-click opens the screen menu, and
 * dragging a thumbnail reorders — a slot marker shows where it will land.
 */
export default function Filmstrip({
  screens,
  active,
  canvasState,
  panoramaBg,
  locale,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  onMove,
  onContextMenu, // (index, { x, y })
}) {
  const stripRef = useRef(null);
  const drag = useRef(null);
  // A drag that just ended is followed by a click; swallow it so it doesn't re-select.
  const suppressClick = useRef(false);
  // { from, slot } while a thumbnail is being dragged; drives the marker.
  const [dragging, setDragging] = useState(null);

  function thumbCenters() {
    return [...stripRef.current.querySelectorAll("[data-screen-index]")].map((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
  }

  function onPointerDown(e, i) {
    if (e.button !== 0 || screens.length < 2) return;
    drag.current = { from: i, startX: e.clientX, startY: e.clientY, live: false, pointerId: e.pointerId };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    if (!d.live) {
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.live = true;
      d.centers = thumbCenters();
    }
    const slot = slotAt(e.clientX, d.centers);
    d.slot = slot;
    setDragging({ from: d.from, slot });
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    setDragging(null);
    if (!d?.live) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const to = moveTarget(d.from, d.slot);
    if (to != null) onMove(d.from, to);
  }

  const marker = (slot) =>
    dragging && dragging.slot === slot && moveTarget(dragging.from, slot) != null ? (
      <div aria-hidden="true" className="h-[100px] w-0.5 shrink-0 -mx-[7px] rounded-full bg-brand-400" />
    ) : null;

  return (
    <div className="border-t border-white/5 bg-ink-900 p-3">
      <div ref={stripRef} className="scroll-thin flex items-center gap-3 overflow-x-auto">
        {screens.map((s, i) => (
          <div key={s.id} className="contents">
            {marker(i)}
            <div
              data-screen-index={i}
              className={`group relative shrink-0 transition ${dragging?.from === i ? "scale-95 opacity-40" : ""}`}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu?.(i, { x: e.clientX, y: e.clientY });
              }}
            >
              <button
                onPointerDown={(e) => onPointerDown(e, i)}
                onClick={() => { if (!suppressClick.current) onSelect(i); }}
                title={screens.length > 1 ? "Click to open · drag to reorder" : undefined}
                className={`overflow-hidden rounded-lg border-2 transition ${
                  i === active ? "border-brand-500" : "border-transparent hover:border-white/20"
                } ${screens.length > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <ScreenCanvas state={canvasState} screen={s} width={56} screenIndex={i} screenCount={screens.length} panoramaBg={panoramaBg} locale={locale} />
              </button>
              <div className="absolute -top-1.5 -right-1.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() => onDuplicate(i)}
                  className="grid h-5 w-5 place-items-center rounded-full bg-ink-800 text-slate-300 hover:text-white"
                  title="Duplicate"
                >
                  <Copy size={11} />
                </button>
                {screens.length > 1 && (
                  <button
                    onClick={() => onRemove(i)}
                    className="grid h-5 w-5 place-items-center rounded-full bg-ink-800 text-slate-300 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
              {screens.length > 1 && (
                <>
                  <button
                    onClick={() => onMove(i, i - 1)}
                    disabled={i === 0}
                    title="Move left"
                    className="absolute left-0 top-1/2 z-10 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink-800 text-slate-200 opacity-0 shadow transition hover:text-white disabled:opacity-0 group-hover:opacity-100 group-hover:disabled:opacity-20"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <button
                    onClick={() => onMove(i, i + 1)}
                    disabled={i === screens.length - 1}
                    title="Move right"
                    className="absolute right-0 top-1/2 z-10 grid h-5 w-5 translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink-800 text-slate-200 opacity-0 shadow transition hover:text-white disabled:opacity-0 group-hover:opacity-100 group-hover:disabled:opacity-20"
                  >
                    <ChevronRight size={12} />
                  </button>
                </>
              )}
              <span className="mt-1 block text-center text-[10px] text-slate-500">{i + 1}</span>
            </div>
          </div>
        ))}
        {marker(screens.length)}
        <button
          onClick={onAdd}
          className="grid h-[100px] w-14 shrink-0 place-items-center rounded-lg border border-dashed border-white/15 text-slate-400 hover:border-brand-500/50 hover:text-brand-300"
          title="Add screen"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
