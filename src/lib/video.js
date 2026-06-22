/**
 * App-preview video — pure timeline/animation math. No DOM, no MediaRecorder, so
 * it's unit-testable. The browser recorder (videoRecorder.js) consumes these.
 *
 * The reel holds each screen for `perScreenMs`, with neighbouring screens
 * overlapping by `transitionMs` to crossfade. Each screen gets a subtle Ken
 * Burns zoom for motion.
 */

// Preferred container/codecs, best first. MP4/H.264 is App Store-compatible;
// WebM is the universal fallback.
export const VIDEO_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

/** First supported mime per `isSupported`, or "" when none match. */
export function pickVideoMime(isSupported, candidates = VIDEO_MIME_CANDIDATES) {
  for (const m of candidates) {
    try {
      if (isSupported(m)) return m;
    } catch {
      // ignore probe errors
    }
  }
  return "";
}

/** File extension for a chosen mime (mp4 vs webm). */
export function videoExtFor(mime) {
  return String(mime).startsWith("video/mp4") ? "mp4" : "webm";
}

/** Even-dimension video size with the longer side capped to `maxLong`. */
export function videoSize(canvasW, canvasH, maxLong = 1920) {
  const long = Math.max(canvasW, canvasH);
  const k = long > maxLong ? maxLong / long : 1;
  const even = (n) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(canvasW), height: even(canvasH) };
}

/** Cubic ease-in-out on a clamped [0,1] progress. */
export function easeInOut(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Overlapping segment timeline. Screen i starts `perScreenMs - transitionMs`
 * after screen i-1, so the tail of one and the head of the next crossfade.
 */
export function buildTimeline(count, { perScreenMs = 2500, transitionMs = 500 } = {}) {
  const tr = Math.min(transitionMs, perScreenMs / 2);
  const segments = [];
  let start = 0;
  for (let i = 0; i < count; i++) {
    segments.push({ index: i, start, end: start + perScreenMs });
    start += perScreenMs - tr;
  }
  const total = count > 0 ? segments[count - 1].end : 0;
  return { segments, total, transitionMs: tr };
}

/**
 * Which screens are visible at time `t` (ms) and how. Returns
 * [{ index, alpha, progress }] painted in array order (lower index first).
 * alpha fades a screen in over its first `transitionMs` and out over its last.
 */
export function frameState(timeline, t) {
  const { segments, transitionMs } = timeline;
  const out = [];
  for (const s of segments) {
    if (t < s.start || t > s.end) continue;
    const dur = s.end - s.start || 1;
    const progress = (t - s.start) / dur;
    let alpha = 1;
    if (t < s.start + transitionMs) alpha = (t - s.start) / transitionMs;
    else if (t > s.end - transitionMs) alpha = (s.end - t) / transitionMs;
    out.push({ index: s.index, alpha: Math.max(0, Math.min(1, alpha)), progress });
  }
  return out;
}

/** Ken Burns motion for a screen at `progress` 0..1 → scale + normalized pan. */
export function kenBurns(progress, { zoom = 0.08, pan = 0.03 } = {}) {
  const p = easeInOut(progress);
  return { scale: 1 + zoom * p, panY: -pan * p };
}
