import { describe, it, expect } from "vitest";
import { imageFiles } from "../landingDraft";

const f = (name, type) => new File(["x"], name, { type });

describe("imageFiles", () => {
  it("keeps only images, in order", () => {
    const out = imageFiles([f("a.png", "image/png"), f("n.txt", "text/plain"), f("b.jpg", "image/jpeg")]);
    expect(out.map((x) => x.name)).toEqual(["a.png", "b.jpg"]);
  });
  it("returns nothing for a folder drop (empty list) or non-images", () => {
    expect(imageFiles([])).toEqual([]);
    expect(imageFiles([f("dir", "")])).toEqual([]);
    expect(imageFiles(null)).toEqual([]);
    expect(imageFiles(undefined)).toEqual([]);
  });
  it("finds the image even when the first dropped file is not one", () => {
    expect(imageFiles([f("readme.md", "text/markdown"), f("shot.png", "image/png")])).toHaveLength(1);
  });
});
