/**
 * Perspective compositing math for photoreal device frames. Pure (no DOM).
 *
 * A photoreal frame is a PNG of a device at a 3D angle with a transparent
 * screen. To drop a screenshot into that angled screen we compute the projective
 * transform (homography) that maps the screenshot's rectangle onto the four
 * screen corners, and express it as a CSS `matrix3d` so the browser renders (and
 * html-to-image exports) the warp.
 */

// Solve an 8x8 linear system by Gaussian elimination with partial pivoting.
function solve8(A, b) {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9;
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/**
 * Projective coefficients [a,b,c,d,e,f,g,h] mapping the 4 `src` points to the 4
 * `dst` points, where x' = (a·x+b·y+c)/(g·x+h·y+1), y' = (d·x+e·y+f)/(g·x+h·y+1).
 */
export function homography(src, dst) {
  const A = [];
  const bb = [];
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i];
    const [dx, dy] = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    bb.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    bb.push(dy);
  }
  return solve8(A, bb);
}

const r = (n) => (Math.abs(n) < 1e-9 ? 0 : +n.toFixed(6));

/**
 * CSS matrix3d string warping an element of size `w`×`h` (origin at 0,0) so its
 * corners land on `corners` = [topLeft, topRight, bottomRight, bottomLeft] (px).
 */
export function cssMatrix3d(w, h, corners) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const [a, b, c, d, e, f, g, hh] = homography(src, corners);
  // column-major 4x4: [a d 0 g | b e 0 h | 0 0 1 0 | c f 0 1]
  return `matrix3d(${r(a)},${r(d)},0,${r(g)}, ${r(b)},${r(e)},0,${r(hh)}, 0,0,1,0, ${r(c)},${r(f)},0,1)`;
}

/** Default screen corners (normalized 0..1) — a centered rectangle to tweak. */
export function defaultCorners() {
  return [[0.2, 0.13], [0.8, 0.13], [0.8, 0.87], [0.2, 0.87]];
}

/** Scale normalized corners to pixels for a `w`×`h` canvas. */
export function cornersToPx(corners, w, h) {
  return corners.map(([x, y]) => [x * w, y * h]);
}
