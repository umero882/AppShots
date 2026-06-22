import { describe, it, expect } from "vitest";
import { SHORTCUTS } from "../shortcuts.js";

describe("SHORTCUTS", () => {
  it("documents the core editor shortcuts", () => {
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(8);
    for (const s of SHORTCUTS) {
      expect(s.keys && s.desc).toBeTruthy();
    }
  });
  it("covers undo, redo, duplicate, delete and layer order", () => {
    const descs = SHORTCUTS.map((s) => s.desc.toLowerCase()).join(" | ");
    expect(descs).toContain("undo");
    expect(descs).toContain("redo");
    expect(descs).toContain("duplicate");
    expect(descs).toContain("delete");
    expect(descs).toMatch(/backward|forward/);
  });
});
