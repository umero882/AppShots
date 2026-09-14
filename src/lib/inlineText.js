/**
 * Helpers for editing text in place on the canvas (contentEditable), kept pure
 * so the normalization rules are unit-testable without a DOM.
 */

/**
 * Normalize text read back from a contentEditable's `innerText`. Browsers pad
 * it with a trailing newline (an emptied node reads "\n") and swap spaces for
 * NBSP; single-line fields (headline, subheading, badge) must never carry a
 * line break, so those collapse to a space.
 */
export function cleanInlineText(raw, multiline = false) {
  let s = String(raw ?? "").replace(/\r\n?/g, "\n").replace(/ /g, " ");
  s = s.replace(/\n+$/, "");
  if (!multiline) s = s.replace(/\n+/g, " ");
  return s;
}

/**
 * The caret color to use while editing styled text. Gradient text paints its
 * fill transparent (background-clip), which would hide a currentColor caret,
 * so borrow the gradient's start color instead.
 */
export function caretColorFor(text) {
  if (!text) return undefined;
  if (text.effect === "gradient") return text.gradientFrom || "#ffffff";
  return text.color || undefined;
}
