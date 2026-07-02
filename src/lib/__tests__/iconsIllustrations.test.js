import { describe, it, expect } from "vitest";
import { ICONS, ICON_TAGS, searchIcons } from "../elements.js";
import { ILLUSTRATIONS } from "../illustrations.js";

describe("icon search", () => {
  it("returns the full set for an empty query", () => {
    expect(searchIcons("")).toHaveLength(ICONS.length);
    expect(searchIcons("   ")).toHaveLength(ICONS.length);
  });

  it("matches by icon name (case-insensitive)", () => {
    expect(searchIcons("star")).toContain("Star");
    expect(searchIcons("HEART")).toContain("Heart");
  });

  it("matches by keyword tags, not just the name", () => {
    // "money" isn't in the name "Wallet"/"Coins" but is a tag
    const money = searchIcons("money");
    expect(money).toContain("Wallet");
    // "ai" is a tag on Bot/Brain/Cpu
    expect(searchIcons("ai")).toEqual(expect.arrayContaining(["Bot", "Brain"]));
  });

  it("returns empty for a nonsense query", () => {
    expect(searchIcons("zzznope")).toHaveLength(0);
  });

  it("every ICON_TAGS key is a real icon in ICONS", () => {
    for (const name of Object.keys(ICON_TAGS)) {
      expect(ICONS, `${name} tagged but not in ICONS`).toContain(name);
    }
  });
});

describe("illustrations", () => {
  it("every illustration is a valid svg data-uri with no bad values", () => {
    for (const ill of ILLUSTRATIONS) {
      const uri = ill.make();
      expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
      const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
      expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("illustration ids are unique", () => {
    const ids = ILLUSTRATIONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
