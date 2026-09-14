import { describe, it, expect } from "vitest";
import { cleanInlineText, caretColorFor } from "../inlineText.js";

describe("cleanInlineText", () => {
  it("drops the trailing newline browsers pad innerText with", () => {
    expect(cleanInlineText("Hello\n")).toBe("Hello");
    expect(cleanInlineText("Hello\n\n", true)).toBe("Hello");
  });

  it("reads an emptied node as empty", () => {
    expect(cleanInlineText("\n")).toBe("");
    expect(cleanInlineText("")).toBe("");
    expect(cleanInlineText(null)).toBe("");
  });

  it("collapses line breaks to spaces for single-line fields", () => {
    expect(cleanInlineText("Track\nyour\n\nhabits")).toBe("Track your habits");
    expect(cleanInlineText("a\r\nb")).toBe("a b");
  });

  it("keeps interior line breaks for multiline text blocks", () => {
    expect(cleanInlineText("Track\nyour habits", true)).toBe("Track\nyour habits");
    expect(cleanInlineText("a\r\nb", true)).toBe("a\nb");
  });

  it("turns non-breaking spaces back into spaces", () => {
    expect(cleanInlineText("Hello world")).toBe("Hello world");
  });
});

describe("caretColorFor", () => {
  it("uses the text color for plain text", () => {
    expect(caretColorFor({ color: "#ff0000", effect: "none" })).toBe("#ff0000");
    expect(caretColorFor({ color: "#ff0000", effect: "glow" })).toBe("#ff0000");
  });

  it("borrows the gradient start for gradient text, whose fill is transparent", () => {
    expect(caretColorFor({ color: "#ff0000", effect: "gradient", gradientFrom: "#112233" })).toBe("#112233");
    expect(caretColorFor({ effect: "gradient" })).toBe("#ffffff");
  });

  it("is undefined without a text style", () => {
    expect(caretColorFor(null)).toBeUndefined();
    expect(caretColorFor({})).toBeUndefined();
  });
});
