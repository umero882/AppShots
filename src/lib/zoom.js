/**
 * Stage zoom. The canvas is laid out proportionally to its width, so zoom is
 * just the width it's rendered at — exports rasterize to the store size
 * whatever the on-screen width is (see renderNode).
 */
export const BASE_WIDTH = 300; // canvas width at 100%
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];

export function clampZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

/** The next preset above `z` (or the max). */
export function zoomIn(z) {
  const cur = clampZoom(z);
  return ZOOM_STEPS.find((s) => s > cur + 1e-6) ?? ZOOM_MAX;
}

/** The next preset below `z` (or the min). */
export function zoomOut(z) {
  const cur = clampZoom(z);
  return [...ZOOM_STEPS].reverse().find((s) => s < cur - 1e-6) ?? ZOOM_MIN;
}

/**
 * The zoom at which a canvas of `aspect` (h/w) fills the stage's inner area
 * (`stageW` × `stageH` minus the padding on each axis), never past the limits.
 */
export function fitZoom(stageW, stageH, aspect, { padX = 64, padY = 96 } = {}) {
  const w = Math.max(1, stageW - padX);
  const h = Math.max(1, stageH - padY);
  const byW = w / BASE_WIDTH;
  const byH = h / (BASE_WIDTH * (aspect || 1));
  return clampZoom(Math.floor(Math.min(byW, byH) * 100) / 100);
}

/** "125%" for display. */
export function zoomLabel(z) {
  return `${Math.round(clampZoom(z) * 100)}%`;
}
