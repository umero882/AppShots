import { Minus, Plus, Maximize } from "lucide-react";
import { zoomIn, zoomOut, zoomLabel, ZOOM_MIN, ZOOM_MAX } from "../lib/zoom";

/**
 * The stage zoom: − / percent / + and Fit. Clicking the percent snaps back to
 * 100%. Sits at the right end of the toolbar row; Ctrl/⌘ + wheel and
 * Ctrl/⌘ +/−/0 do the same from the keyboard.
 */
export default function ZoomControl({ zoom, onChange, onFit }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 border-l border-white/5 px-2"
      onPointerDown={(e) => e.stopPropagation()}
      title="Zoom · Ctrl/⌘ + scroll"
    >
      <div className="flex items-center rounded-lg border border-white/10 bg-white/5">
        <button type="button" className="tb-icon" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => onChange(zoomOut(zoom))}>
          <Minus size={13} />
        </button>
        <button
          type="button"
          className="min-w-[3rem] text-center text-xs font-semibold tabular-nums text-slate-100 hover:text-white"
          aria-label="Reset zoom"
          title="Back to 100%"
          onClick={() => onChange(1)}
        >
          {zoomLabel(zoom)}
        </button>
        <button type="button" className="tb-icon" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => onChange(zoomIn(zoom))}>
          <Plus size={13} />
        </button>
      </div>
      <button type="button" className="tb-btn" aria-label="Fit to stage" title="Fit the whole screen in view" onClick={onFit}>
        <Maximize size={13} /> Fit
      </button>
    </div>
  );
}
