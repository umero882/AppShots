/**
 * WCAG 2.1 relative-luminance contrast helpers. Accepts 3- or 6-digit hex.
 */
function normalize(hex) {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return h;
}

function luminance(hex) {
  const h = normalize(hex);
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const la = luminance(hexA);
  const lb = luminance(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export function passesAA(fg, bg) {
  return contrastRatio(fg, bg) >= 4.5;
}

export function passesLargeAA(fg, bg) {
  return contrastRatio(fg, bg) >= 3;
}

/**
 * RGB triplet (e.g. "0,0,0") for a halo/shadow that contrasts the given text
 * color, so headline text stays legible on ANY background — including a
 * background whose color matches the text (dark-on-dark / light-on-light).
 * Light text → dark halo; dark text → light halo.
 */
export function legibilityHalo(textColor) {
  return contrastRatio(textColor, "#000000") >= contrastRatio(textColor, "#ffffff")
    ? "0,0,0"
    : "255,255,255";
}
