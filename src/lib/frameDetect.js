/**
 * Auto-detect the transparent screen quad in an uploaded device-frame PNG, so
 * the photoreal-frame corner pins land on the screen automatically instead of
 * the user dragging all four by hand.
 *
 * Approach: flood-fill transparency inward from the image borders to mark the
 * "outside the device" area, then the remaining transparent pixels enclosed by
 * the opaque device body are the screen. Its four extreme points (by x+y and
 * x-y) give the quad corners — works for angled frames, where the screen is a
 * skewed quad. detectScreenQuad is pure (operates on an alpha array) and tested;
 * loadFrameCorners is the browser wrapper.
 */

/**
 * @param {Uint8Array|Uint8ClampedArray|number[]} alpha per-pixel alpha (row-major)
 * @returns {[[number,number],[number,number],[number,number],[number,number]]|null}
 *   corners [TL,TR,BR,BL] normalized 0..1, or null if no enclosed screen found.
 */
export function detectScreenQuad(alpha, w, h, threshold = 40) {
  const N = w * h;
  if (!N || alpha.length < N) return null;
  const outside = new Uint8Array(N);
  const stack = [];
  const seed = (i) => {
    if (i >= 0 && i < N && !outside[i] && alpha[i] < threshold) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }

  let count = 0;
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  let tl, tr, br, bl;
  for (let i = 0; i < N; i++) {
    if (alpha[i] >= threshold || outside[i]) continue;
    count++;
    const x = i % w;
    const y = (i - x) / w;
    const sum = x + y;
    const diff = x - y;
    if (sum < minSum) { minSum = sum; tl = [x, y]; }
    if (sum > maxSum) { maxSum = sum; br = [x, y]; }
    if (diff > maxDiff) { maxDiff = diff; tr = [x, y]; }
    if (diff < minDiff) { minDiff = diff; bl = [x, y]; }
  }
  // Reject when there's no meaningful enclosed region (no transparent screen).
  if (count < N * 0.004 || !tl) return null;
  const n = (p) => [p[0] / w, p[1] / h];
  return [n(tl), n(tr), n(br), n(bl)];
}

/** Browser: load a frame data-URL, sample its alpha, return the screen quad. */
export function loadFrameCorners(dataUrl) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
        const cw = Math.max(1, Math.round(img.naturalWidth * scale));
        const ch = Math.max(1, Math.round(img.naturalHeight * scale));
        const cv = document.createElement("canvas");
        cv.width = cw;
        cv.height = ch;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, cw, ch);
        const data = ctx.getImageData(0, 0, cw, ch).data;
        const alpha = new Uint8ClampedArray(cw * ch);
        for (let i = 0; i < cw * ch; i++) alpha[i] = data[i * 4 + 3];
        resolve(detectScreenQuad(alpha, cw, ch));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
