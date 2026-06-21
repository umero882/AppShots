import { legibilityHalo } from "./contrast";

/**
 * Headline text effects. Each returns a partial CSS style object that the canvas
 * merges over the base headline style (so it overrides textShadow/color where
 * relevant). All effects render with pure CSS so they export via html-to-image.
 */
export const TEXT_EFFECTS = [
  { id: "none", name: "None" },
  { id: "shadow", name: "Shadow" },
  { id: "glow", name: "Glow" },
  { id: "outline", name: "Outline" },
  { id: "gradient", name: "Gradient" },
];

export const GRADIENT_DEFAULT = { from: "#ffffff", to: "#a5b4fc" };

/**
 * @param {object} text  the project's text config (effect, color, gradientFrom/To)
 * @param {number} scaledSize  the on-screen font size in px (drives effect scale)
 */
export function textEffectStyle(text, scaledSize) {
  const effect = text?.effect || "none";
  const color = text?.color || "#ffffff";
  const s = Number.isFinite(scaledSize) ? scaledSize : 32;

  switch (effect) {
    case "shadow":
      return { textShadow: `0 ${(s * 0.06).toFixed(1)}px ${(s * 0.12).toFixed(1)}px rgba(0,0,0,0.45)` };
    case "glow":
      return { textShadow: `0 0 ${(s * 0.25).toFixed(1)}px ${color}, 0 0 ${(s * 0.5).toFixed(1)}px ${color}` };
    case "outline": {
      const stroke = legibilityHalo(color) === "0,0,0" ? "#000000" : "#ffffff";
      const w = Math.max(1, s * 0.025);
      return {
        WebkitTextStroke: `${w.toFixed(1)}px ${stroke}`,
        paintOrder: "stroke fill",
        textShadow: "none",
      };
    }
    case "gradient": {
      const from = text?.gradientFrom || GRADIENT_DEFAULT.from;
      const to = text?.gradientTo || GRADIENT_DEFAULT.to;
      return {
        backgroundImage: `linear-gradient(180deg, ${from}, ${to})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        textShadow: "none",
      };
    }
    default:
      return {};
  }
}
