/**
 * Background patterns rendered as pure CSS `background` shorthands (repeating /
 * layered gradients). CSS gradients rasterize reliably through html-to-image, so
 * these export cleanly — no SVG data-URI or external asset needed.
 *
 * A pattern background is stored as:
 *   { type: "pattern", pattern: <id>, patternFg, patternBg, patternScale }
 * and rendered by patternCss() into the canvas `background` property.
 */

export const PATTERN_DEFAULTS = {
  pattern: "dots",
  patternFg: "#6366f1",
  patternBg: "#0b1020",
  patternScale: 26, // tile size in px (design space)
};

export const PATTERNS = [
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "stripes", label: "Stripes" },
  { id: "diagonal", label: "Diagonal" },
  { id: "checker", label: "Checker" },
  { id: "crosshatch", label: "Crosshatch" },
];

/** Build the CSS `background` shorthand for a pattern background. */
export function patternCss(bg = {}) {
  const id = bg.pattern || PATTERN_DEFAULTS.pattern;
  const fg = bg.patternFg || PATTERN_DEFAULTS.patternFg;
  const base = bg.patternBg || PATTERN_DEFAULTS.patternBg;
  const s = Math.max(6, bg.patternScale || PATTERN_DEFAULTS.patternScale);
  const tile = `${s}px ${s}px`;

  switch (id) {
    case "grid":
      return (
        `linear-gradient(${fg} 1px, transparent 1px) 0 0 / ${tile}, ` +
        `linear-gradient(90deg, ${fg} 1px, transparent 1px) 0 0 / ${tile}, ` +
        base
      );
    case "stripes":
      return `repeating-linear-gradient(0deg, ${fg} 0 ${Math.max(1, s * 0.18)}px, ${base} ${Math.max(1, s * 0.18)}px ${s}px)`;
    case "diagonal":
      return `repeating-linear-gradient(45deg, ${fg} 0 ${Math.max(1, s * 0.18)}px, ${base} ${Math.max(1, s * 0.18)}px ${s}px)`;
    case "checker":
      return (
        `linear-gradient(45deg, ${fg} 25%, transparent 25%) 0 0 / ${tile}, ` +
        `linear-gradient(-45deg, ${fg} 25%, transparent 25%) 0 0 / ${tile}, ` +
        `linear-gradient(45deg, transparent 75%, ${fg} 75%) 0 0 / ${tile}, ` +
        `linear-gradient(-45deg, transparent 75%, ${fg} 75%) 0 0 / ${tile}, ` +
        base
      );
    case "crosshatch":
      return (
        `repeating-linear-gradient(45deg, ${fg} 0 1px, transparent 1px ${s}px), ` +
        `repeating-linear-gradient(-45deg, ${fg} 0 1px, transparent 1px ${s}px), ` +
        base
      );
    case "dots":
    default: {
      const r = Math.max(1, s * 0.14);
      return `radial-gradient(circle at center, ${fg} ${r}px, transparent ${r + 0.5}px) 0 0 / ${tile}, ${base}`;
    }
  }
}
