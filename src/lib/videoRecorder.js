/**
 * Browser-only app-preview recorder. Draws the screen images onto a canvas with
 * Ken Burns motion + crossfades (timeline from ./video.js) and captures the
 * canvas stream via MediaRecorder. Returns a video Blob (MP4 when the browser
 * supports it, else WebM).
 *
 * Not unit-tested — it needs canvas + MediaRecorder. The math it relies on lives
 * in ./video.js and is tested there.
 */
import {
  pickVideoMime, videoExtFor, buildTimeline, frameState, kenBurns,
  VIDEO_MIME_CANDIDATES, VIDEO_MIME_AUDIO_CANDIDATES,
} from "./video";

// Build a looping audio track from a data-URL, routed through a gain (volume)
// into a MediaStream destination. Returns { tracks, cleanup } — tracks is empty
// and cleanup a no-op if anything fails (music is optional, never blocks export).
async function buildAudioTrack(audio) {
  if (!audio?.data) return { tracks: [], cleanup: () => {} };
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    if (ac.state === "suspended") await ac.resume();
    const arr = await (await fetch(audio.data)).arrayBuffer();
    const buffer = await ac.decodeAudioData(arr);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ac.createGain();
    gain.gain.value = audio.volume ?? 0.7;
    const dest = ac.createMediaStreamDestination();
    src.connect(gain).connect(dest);
    src.start();
    return {
      tracks: dest.stream.getAudioTracks(),
      cleanup: () => { try { src.stop(); } catch { /* already stopped */ } ac.close(); },
    };
  } catch {
    return { tracks: [], cleanup: () => {} };
  }
}

export function videoSupported() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof document !== "undefined" &&
    !!document.createElement("canvas").captureStream
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draw `img` covering the canvas, scaled by Ken Burns zoom, faded by alpha.
function drawCover(ctx, img, W, H, scale, panY, alpha) {
  const base = Math.max(W / img.width, H / img.height);
  const s = base * scale;
  const w = img.width * s;
  const h = img.height * s;
  const x = (W - w) / 2;
  const y = (H - h) / 2 + panY * H;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

/**
 * Record an animated reel from screen image data-URLs.
 * @returns {Promise<{ blob: Blob, ext: string }>}
 */
export async function recordReel({
  images, width, height, perScreenMs = 2500, transitionMs = 600, fps = 30, audio = null, onProgress,
}) {
  if (!videoSupported()) throw new Error("video-unsupported");
  if (!images?.length) throw new Error("video-empty");

  const imgs = await Promise.all(images.map(loadImage));
  const timeline = buildTimeline(imgs.length, { perScreenMs, transitionMs });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Optional looping background music mixed into the recorded stream.
  const { tracks: audioTracks, cleanup: stopAudio } = await buildAudioTrack(audio);
  const hasAudio = audioTracks.length > 0;

  const stream = new MediaStream([
    ...canvas.captureStream(fps).getVideoTracks(),
    ...audioTracks,
  ]);
  const mime = pickVideoMime(
    (m) => MediaRecorder.isTypeSupported?.(m),
    hasAudio ? VIDEO_MIME_AUDIO_CANDIDATES : VIDEO_MIME_CANDIDATES
  );
  const rec = new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
  const stopped = new Promise((res) => {
    rec.onstop = () => res(new Blob(chunks, { type: mime || "video/webm" }));
  });

  // Paint the first frame, then start recording so we never capture a blank.
  paint(ctx, imgs, timeline, 0, width, height);
  rec.start();

  await new Promise((resolve) => {
    const t0 = performance.now();
    function tick() {
      const t = performance.now() - t0;
      paint(ctx, imgs, timeline, Math.min(t, timeline.total), width, height);
      onProgress?.(Math.min(1, t / timeline.total));
      if (t < timeline.total) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });

  // Flush the last frame before stopping.
  await new Promise((r) => setTimeout(r, 120));
  rec.stop();
  const blob = await stopped;
  stopAudio();
  return { blob, ext: videoExtFor(mime || "video/webm") };
}

function paint(ctx, imgs, timeline, t, W, H) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  for (const f of frameState(timeline, t)) {
    const img = imgs[f.index];
    if (!img) continue;
    const { scale, panY } = kenBurns(f.progress);
    drawCover(ctx, img, W, H, scale, panY, f.alpha);
  }
}
