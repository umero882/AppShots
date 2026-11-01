/**
 * Landing-page "try it live" draft. A visitor styles a screenshot on the home
 * page before having an account; the draft rides through signup in
 * localStorage and the dashboard turns it into their first project.
 */
import { defaultProjectState } from "./templates";

const KEY = "appshots.landingDraft";
const MAX_SIDE = 1400;

export function saveLandingDraft(draft) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
    return true;
  } catch {
    // Quota or blocked storage: drop the image, keep the words and look.
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...draft, image: null, savedAt: Date.now() }));
      return true;
    } catch {
      return false;
    }
  }
}

/** Reads and clears the draft (one use), ignoring anything older than a week. */
export function takeLandingDraft() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const d = JSON.parse(raw);
    if (!d || typeof d !== "object") return null;
    if (Date.now() - (d.savedAt || 0) > 7 * 864e5) return null;
    return d;
  } catch {
    return null;
  }
}

export function draftToProjectState(d) {
  // A full project state (a template tried out on the Inspiration page).
  if (d.state && Array.isArray(d.state.screens) && d.state.screens.length) return d.state;
  const base = defaultProjectState();
  const [screen] = base.screens;
  const many = Array.isArray(d.screens) && d.screens.length
    ? d.screens.map((x, i) => ({
        ...screen,
        id: `${screen.id}${i}`,
        heading: (x.heading || "").trim() || screen.heading,
        subheading: (x.subheading || "").trim(),
        image: x.image || null,
      }))
    : null;
  return {
    ...base,
    ...(d.deviceId ? { deviceId: d.deviceId } : {}),
    background: d.background || { ...base.background, type: "gradient", gradient: d.gradient || base.background.gradient },
    screens: many || [
      {
        ...screen,
        heading: (d.heading || "").trim() || screen.heading,
        subheading: (d.subheading || "").trim(),
        image: d.image || null,
      },
    ],
  };
}

/**
 * The image files in a drop or file-picker result, in order. Folders, text
 * files and anything else are skipped, so dropping a mixed selection still
 * uses the screenshots in it.
 */
export function imageFiles(list) {
  return Array.from(list || []).filter((f) => f && /^image\//.test(f.type));
}

/** Reads an image file and shrinks it so it fits in localStorage. */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Not an image"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

/* ------------------------- brand colour from a screenshot ------------------------- */

const mixRgb = (c, to, t) => c.map((v, i) => Math.round(v + (to[i] - v) * t));
const rgbCss = (c) => `rgb(${c.join(",")})`;

/**
 * The accent colour of a screenshot, from RGBA pixel data. Greys, whites and
 * blacks are skipped (an app screen is mostly white UI, which says nothing
 * about the brand); the rest vote by hue, and the winning hue's average is
 * returned. Null when too little of the image is coloured to trust.
 */
export function accentFromPixels(data) {
  const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let coloured = 0;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (data[i + 3] < 200 || sat < 0.28 || max < 40) continue;
    coloured++;
    let h;
    const d = max - min;
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    const bin = bins[Math.min(11, Math.floor((h / 6) * 12))];
    // Vivid, bright pixels speak for the brand; dark, murky ones are usually photo or shadow.
    const wgt = sat * Math.pow(max / 255, 1.5);
    bin.w += wgt; bin.r += r * wgt; bin.g += g * wgt; bin.b += b * wgt;
  }
  if (!total || coloured / total < 0.04) return null;
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  const out = [Math.round(best.r / best.w), Math.round(best.g / best.w), Math.round(best.b / best.w)];
  // A dull or dark average (muddy brown from a photo, olive from a dark UI) looks worse than a preset.
  const hi = Math.max(...out), lo = Math.min(...out);
  if (hi < 145 || (hi - lo) / hi < 0.33) return null;
  return out;
}

/** The accent colour of an image data URL, or null (also null where there is no canvas). */
export function accentFromImage(dataUrl) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 48;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, 48, 48);
        resolve(accentFromPixels(g.getImageData(0, 0, 48, 48).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** A project/screen background built around an accent colour. */
export function brandBackground(accent) {
  const css = `linear-gradient(135deg, ${rgbCss(mixRgb(accent, [255, 255, 255], 0.06))}, ${rgbCss(mixRgb(accent, [0, 0, 0], 0.5))})`;
  return { type: "gradient", gradient: "indigo", solid: "", aiGradient: { css } };
}
