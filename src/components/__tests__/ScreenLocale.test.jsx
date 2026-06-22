import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ScreenCanvas from "../ScreenCanvas.jsx";
import { defaultProjectState, defaultScreen } from "../../lib/templates.js";

const state = { ...defaultProjectState(), _textPos: "top" };
const screen = {
  ...defaultScreen(),
  heading: "Track your day",
  subheading: "Stay focused",
  i18n: { es: { heading: "Organiza tu día", subheading: "Mantén el foco" } },
};

const render = (locale) =>
  renderToStaticMarkup(<ScreenCanvas state={state} screen={screen} width={300} locale={locale} />);

describe("ScreenCanvas localization", () => {
  it("shows the base heading by default / for the base locale", () => {
    expect(render(null)).toContain("Track your day");
    expect(render("en")).toContain("Track your day");
  });
  it("shows the translated heading + subheading for a target locale", () => {
    const html = render("es");
    expect(html).toContain("Organiza tu día");
    expect(html).toContain("Mantén el foco");
    expect(html).not.toContain("Track your day");
  });
  it("falls back to base text when a locale has no translation", () => {
    expect(render("fr")).toContain("Track your day");
  });
});
