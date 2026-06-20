import { describe, it, expect } from "vitest";
import * as M from "../mockScreens.js";

const gens = [
  M.mockDashboard, M.mockFeed, M.mockProfile, M.mockOnboarding,
  M.mockStats, M.mockChat, M.mockMusic, M.mockMap,
];

describe("mock screen generators", () => {
  it("MOCKS exports all eight generators", () => {
    expect(M.MOCKS).toHaveLength(8);
  });

  for (const gen of gens) {
    it(`${gen.name} returns a valid svg data-uri embedding the accent`, () => {
      const uri = gen("#ff0066");
      expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
      const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
      expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
      expect(svg).toContain("#ff0066");
    });

    it(`${gen.name} honors the dark option`, () => {
      const light = gen("#ff0066", { dark: false });
      const dark = gen("#ff0066", { dark: true });
      expect(light).not.toEqual(dark);
    });
  }
});
