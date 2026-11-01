/**
 * Does an image fit a store size? Pure functions over the editor's own device
 * list, so the public size table and the checker can never disagree with what
 * the editor exports.
 */
import { DEVICES, CREATIVE_FORMATS } from "./devices";

export const ALL_SIZES = [...DEVICES, ...CREATIVE_FORMATS];

const ratio = (c) => c.w / c.h;

/**
 * Sorts every size into: exact (same pixels), scale (same shape, resize only),
 * flip (exact or same shape rotated), and the rest. Tolerance on shape is 1%.
 */
export function checkSize(w, h) {
  const out = { exact: [], scale: [], rotated: [] };
  if (!(w > 0 && h > 0)) return out;
  const r = w / h;
  for (const d of ALL_SIZES) {
    const c = d.canvas;
    if (c.w === w && c.h === h) out.exact.push(d);
    else if (Math.abs(ratio(c) / r - 1) < 0.01) out.scale.push(d);
    else if (Math.abs(ratio(c) * r - 1) < 0.01) out.rotated.push(d);
  }
  return out;
}

export function readImageSize(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Not an image"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}
