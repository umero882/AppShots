/**
 * What the canvas toolbar is looking at. Resolves the editor's three
 * selection states (a headline line, an element, a device mockup) into one
 * descriptor so the bar can pick its controls without knowing the shapes.
 * Pure, so the mapping is unit-testable.
 */
import { resolveTextTarget } from "./textTarget";
import { screenDevices, LEGACY_DEVICE_ID } from "./deviceLayout";
import { getDevice } from "./devices";

const KIND_LABEL = {
  badge: "Badge", shape: "Shape", arrow: "Arrow", emoji: "Emoji", icon: "Icon", image: "Image",
};

export const OPACITY_SPEC = { min: 10, max: 100, step: 10, unit: "%" };
export const DEVICE_SCALE_SPEC = { min: 20, max: 160, step: 5, unit: "%" };

/** Which color fields an element exposes, in toolbar order. */
export function elementColors(el) {
  if (!el) return [];
  if (el.kind === "badge") {
    return [
      { key: "bg", label: "Fill", value: el.bg || "#111827" },
      { key: "fg", label: "Text", value: el.fg || "#ffffff" },
    ];
  }
  if (el.kind === "shape" || el.kind === "arrow" || el.kind === "icon") {
    return [{ key: "color", label: "Color", value: el.color || "#111827" }];
  }
  return [];
}

/**
 * @param sel { selectedEl, selectedText, selectedDevice }
 * @returns one of
 *   { kind: "text",    id?,  text }               — headline/subheading/text element (styled by the text bar)
 *   { kind: "element", id,   label, colors, opacity, isTop, isBottom }
 *   { kind: "device",  id,   label, scale, hasImage, count, legacy }
 *   null
 * `legacy` marks the synthesized single mockup of a screen that hasn't been
 * promoted to free mode: it can be sized and given a screenshot but not
 * deleted — the bar offers "position freely" instead.
 * A selected text element reports kind "text" (its typography is the point)
 * but still carries `id`, so the bar can offer layer/duplicate/delete too.
 */
export function resolveSelection(state, screen, sel = {}) {
  if (!state || !screen) return null;
  const { selectedEl, selectedText, selectedDevice } = sel;

  if (selectedEl) {
    const els = screen.elements || [];
    const idx = els.findIndex((e) => e.id === selectedEl);
    if (idx === -1) return null;
    const el = els[idx];
    const layer = { isTop: idx === els.length - 1, isBottom: idx === 0 };
    if (el.kind === "text") {
      const text = resolveTextTarget(state, screen, { kind: "element", id: el.id });
      return text ? { kind: "text", id: el.id, text, ...layer } : null;
    }
    return {
      kind: "element",
      id: el.id,
      label: KIND_LABEL[el.kind] || "Element",
      colors: elementColors(el),
      opacity: Math.round((el.opacity ?? 1) * 100),
      ...layer,
    };
  }

  if (selectedDevice) {
    const list = screenDevices(screen, state);
    const d = list.find((x) => x.id === selectedDevice);
    if (!d) return null;
    return {
      kind: "device",
      id: d.id,
      label: getDevice(d.deviceId)?.name || "Device",
      scale: Math.round((d.scale ?? 0.78) * 100),
      hasImage: !!d.image,
      count: list.length,
      legacy: d.id === LEGACY_DEVICE_ID,
    };
  }

  if (selectedText) {
    const text = resolveTextTarget(state, screen, { kind: selectedText });
    return text ? { kind: "text", text } : null;
  }

  return null;
}
