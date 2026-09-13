/**
 * AI headline + subheading writer — BROWSER client.
 *
 * Like ./aiBackground: no keys, no third-party calls, only the same-origin
 * proxy. The pure parts (tones, prompt, parser) live in ./aiCore so the server
 * shares them.
 */
import { apiFetch } from "./apiClient";

export { COPY_TONES, COPY_LIMITS } from "./aiCore";

// Long side of the screenshot sent for vision. 800px is plenty to read UI text
// and keeps the request ~100 KB; a raw 3x iPhone capture would be 5–10 MB.
export const VISION_MAX_SIDE = 800;

/**
 * Ask the proxy for headline ideas.
 *   mode "screen" → 4 alternatives for `screens[activeIndex]`
 *   mode "set"    → one per screen, in order
 * @returns {Promise<{ ideas: {heading: string, subheading: string}[], mode: string, count: number }>}
 */
export async function suggestCopy({
  appName = "",
  brief = "",
  tone = "punchy",
  language = "English",
  mode = "screen",
  screens = [],
  activeIndex = 0,
  image = null,
  model,
} = {}) {
  return apiFetch("/api/ai/copy", {
    method: "POST",
    body: { appName, brief, tone, language, mode, screens, activeIndex, image: image || undefined, model },
  });
}

/**
 * Downscale a screenshot data URL for the vision request. Resolves to a JPEG
 * data URL, or null when it cannot be produced (no DOM, a broken image) — the
 * caller then simply writes from the brief alone rather than failing.
 */
export function shrinkForVision(dataUrl, maxSide = VISION_MAX_SIDE) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return Promise.resolve(null);
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        // Transparent screenshots (rare, but PNG allows it) would otherwise turn
        // black in JPEG.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
