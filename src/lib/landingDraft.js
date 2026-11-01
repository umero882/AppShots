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
