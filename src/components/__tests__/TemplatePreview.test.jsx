import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplatePreview } from "../TemplateGrid.jsx";
import { TEMPLATES } from "../../lib/galleryTemplates.js";

const noop = () => {};
const multi = TEMPLATES.find((t) => t.screens.length > 1) || TEMPLATES[0];

const render = (t) =>
  renderToStaticMarkup(<TemplatePreview template={t} onUse={noop} onClose={noop} />);

describe("TemplatePreview", () => {
  it("shows the template name and category", () => {
    const html = render(multi);
    expect(html).toContain(multi.name);
    expect(html).toContain(multi.category);
  });

  it("renders every screen of the template (not just the first)", () => {
    const html = render(multi);
    // each screen renders a ScreenCanvas; count the device frame wrappers via the
    // headline text occurrences (each screen's heading appears once)
    const headings = multi.screens.map((s) => s.heading).filter(Boolean);
    for (const hdg of headings) expect(html).toContain(hdg);
    expect(multi.screens.length).toBeGreaterThan(1);
  });

  it("offers an apply action", () => {
    expect(render(multi)).toContain("Use this template");
  });

  it("reports the screen count", () => {
    expect(render(multi)).toContain(`${multi.screens.length} screen`);
  });
});
