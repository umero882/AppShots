import { describe, it, expect } from "vitest";
import { detectScreenQuad } from "../frameDetect.js";

// Build an alpha grid: transparent border (outside), an opaque device body, and
// a transparent screen rectangle enclosed inside it.
function frame(w, h, body, screen) {
  const a = new Uint8Array(w * h).fill(0); // start fully transparent (outside)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inBody = x >= body.x0 && x <= body.x1 && y >= body.y0 && y <= body.y1;
      const inScreen = x >= screen.x0 && x <= screen.x1 && y >= screen.y0 && y <= screen.y1;
      a[y * w + x] = inBody && !inScreen ? 255 : 0;
    }
  }
  return a;
}

describe("detectScreenQuad", () => {
  it("finds the enclosed transparent screen rectangle", () => {
    const w = 40, h = 60;
    const a = frame(w, h, { x0: 5, y0: 5, x1: 34, y1: 54 }, { x0: 10, y0: 12, x1: 29, y1: 47 });
    const q = detectScreenQuad(a, w, h);
    expect(q).not.toBeNull();
    const [tl, tr, br, bl] = q;
    // corners (normalized) ~ screen rect
    expect(tl[0]).toBeCloseTo(10 / w, 1);
    expect(tl[1]).toBeCloseTo(12 / h, 1);
    expect(br[0]).toBeCloseTo(29 / w, 1);
    expect(br[1]).toBeCloseTo(47 / h, 1);
    expect(tr[0]).toBeGreaterThan(tl[0]);
    expect(bl[1]).toBeGreaterThan(tl[1]);
  });

  it("returns null when there is no enclosed screen (solid body)", () => {
    const w = 40, h = 60;
    const a = frame(w, h, { x0: 5, y0: 5, x1: 34, y1: 54 }, { x0: -1, y0: -1, x1: -1, y1: -1 });
    expect(detectScreenQuad(a, w, h)).toBeNull();
  });

  it("returns null for an all-transparent image", () => {
    expect(detectScreenQuad(new Uint8Array(100).fill(0), 10, 10)).toBeNull();
  });
});
