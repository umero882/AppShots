/**
 * The editor's in-app clipboard for elements and device mockups: Ctrl/⌘ C/X/V
 * across screens, so a badge or arrow made once lands on every screen. Pure
 * functions over the project state; the editor holds the clip itself.
 *
 * A clip is { kind: "element", item, from } or { kind: "device", item, from },
 * `from` being the screen index it was copied on.
 */
import { duplicateElement } from "./elements";
import { duplicateDeviceInstance, isFreeMode } from "./deviceLayout";

/** What Ctrl+C would take from the current selection, or null. */
export function clipFromSelection(screen, screenIndex, { selectedEl, selectedDevice } = {}) {
  if (!screen) return null;
  if (selectedEl) {
    const item = (screen.elements || []).find((e) => e.id === selectedEl);
    return item ? { kind: "element", item: { ...item }, from: screenIndex } : null;
  }
  // Only a real instance can be copied; the legacy single mockup has none.
  if (selectedDevice && isFreeMode(screen)) {
    const item = screen.devices.find((d) => d.id === selectedDevice);
    return item ? { kind: "device", item: { ...item }, from: screenIndex } : null;
  }
  return null;
}

/**
 * The copy to insert on `screenIndex`: a fresh id always; nudged when pasting
 * back onto the screen it came from (so it doesn't hide under the original),
 * at the same spot when pasting onto another screen (so a set lines up).
 */
export function pasteItem(clip, screenIndex) {
  if (!clip) return null;
  const same = clip.from === screenIndex;
  if (clip.kind === "element") return duplicateElement(clip.item, same ? 0.04 : 0);
  const d = duplicateDeviceInstance(clip.item);
  return same ? d : { ...d, x: clip.item.x, y: clip.item.y };
}
