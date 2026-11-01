import { describe, it, expect } from "vitest";
import { PRICING_FAQ, faqJsonLd } from "../pricingFaq";

describe("pricing FAQ", () => {
  it("structured data mirrors the visible questions exactly", () => {
    const ld = faqJsonLd();
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(PRICING_FAQ.length);
    ld.mainEntity.forEach((e, i) => {
      expect(e.name).toBe(PRICING_FAQ[i].q);
      expect(e.acceptedAnswer.text).toBe(PRICING_FAQ[i].a);
    });
  });
  it("states the prices the plans use", () => {
    const all = PRICING_FAQ.map((i) => i.a).join(" ");
    expect(all).toContain("$9 a month");
    expect(all).toContain("$84 a year");
    expect(all).toContain("$29 a month");
  });
  it("survives JSON embedding in a script tag", () => {
    expect(() => JSON.parse(JSON.stringify(faqJsonLd()))).not.toThrow();
  });
});
