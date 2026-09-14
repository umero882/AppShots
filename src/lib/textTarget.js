/**
 * A uniform view of whichever text is active on the canvas — the headline,
 * the subheading, or a text element — so one toolbar can style all three.
 *
 * The three live in different shapes: the headline is `state.text` (canvas
 * px), the subheading is `state.subtext` sharing the headline's font and
 * alignment, and a text element carries its own style with a fractional
 * size. Both functions are pure so the mapping is unit-testable.
 */

const SUB_DEFAULT_WEIGHT = 500;

/** The subheading's effective style (older projects predate `subtext`). */
function subtextOf(state) {
  const t = state.text;
  return {
    color: t.color,
    size: Math.round(t.size * 0.45),
    weight: SUB_DEFAULT_WEIGHT,
    ...(state.subtext || {}),
  };
}

/**
 * Resolve `sel` ({ kind: "heading" | "subheading" | "element", id }) against
 * the project. Returns null when nothing is targetable (e.g. the id points at
 * a badge, or no longer exists).
 *
 * @returns {{ label, values, sizeSpec, caps } | null}
 *   values  — { font, size, weight, align, color, effect, gradientFrom, gradientTo }
 *   sizeSpec — { min, max, step, unit } for the size stepper, in the target's own units
 *   caps    — which controls apply: { font, align, effect }
 */
export function resolveTextTarget(state, screen, sel) {
  if (!state || !sel) return null;
  const t = state.text;
  if (sel.kind === "heading") {
    return {
      label: "Headline",
      values: {
        font: t.font, size: t.size, weight: t.weight, align: t.align, color: t.color,
        effect: t.effect || "none", gradientFrom: t.gradientFrom, gradientTo: t.gradientTo,
      },
      sizeSpec: { min: 36, max: 110, step: 2, unit: "px" },
      caps: { font: true, align: true, effect: true },
    };
  }
  if (sel.kind === "subheading") {
    const sub = subtextOf(state);
    return {
      label: "Subheading",
      values: { font: t.font, size: sub.size, weight: sub.weight, align: t.align, color: sub.color, effect: "none" },
      sizeSpec: { min: 18, max: 90, step: 2, unit: "px" },
      caps: { font: true, align: true, effect: false },
    };
  }
  if (sel.kind === "element") {
    const el = (screen?.elements || []).find((e) => e.id === sel.id);
    if (!el || el.kind !== "text") return null;
    return {
      label: "Text",
      values: {
        font: el.font, size: Math.round((el.size ?? 0.06) * 100 * 2) / 2, weight: el.weight ?? 700,
        align: el.align || "center", color: el.color || "#ffffff", effect: el.effect || "none",
        gradientFrom: el.gradientFrom, gradientTo: el.gradientTo,
      },
      sizeSpec: { min: 2, max: 16, step: 0.5, unit: "" },
      caps: { font: true, align: true, effect: true },
    };
  }
  return null;
}

/**
 * Apply a toolbar patch ({ font | size | weight | align | color | effect }) to
 * the target and return the next project state. `size` is in the target's own
 * units (px for headline/subheading, hundredths for an element). Unknown
 * targets return `state` unchanged.
 */
export function applyTextStyle(state, screenIndex, sel, patch) {
  if (!state || !sel || !patch) return state;
  if (sel.kind === "heading") {
    return { ...state, text: { ...state.text, ...patch } };
  }
  if (sel.kind === "subheading") {
    // Font and alignment are shared with the headline; the rest is the
    // subheading's own. Materialize `subtext` so the fallbacks stop drifting.
    const { font, align, effect: _ignored, ...own } = patch;
    let next = state;
    if (font !== undefined || align !== undefined) {
      next = { ...next, text: { ...next.text, ...(font !== undefined && { font }), ...(align !== undefined && { align }) } };
    }
    if (Object.keys(own).length) {
      next = { ...next, subtext: { ...subtextOf(next), ...own } };
    }
    return next;
  }
  if (sel.kind === "element") {
    const { size, ...rest } = patch;
    const elPatch = { ...rest, ...(size !== undefined && { size: size / 100 }) };
    return {
      ...state,
      screens: state.screens.map((s, i) =>
        i === screenIndex
          ? { ...s, elements: (s.elements || []).map((e) => (e.id === sel.id ? { ...e, ...elPatch } : e)) }
          : s
      ),
    };
  }
  return state;
}

/** Step a size within its spec, snapping to the step grid. */
export function stepSize(value, spec, direction) {
  const v = (Number(value) || spec.min) + direction * spec.step;
  const snapped = Math.round(v / spec.step) * spec.step;
  return Math.min(spec.max, Math.max(spec.min, Number(snapped.toFixed(2))));
}
