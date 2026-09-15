/**
 * Putting screenshots into the project from a drop or a paste. Pure, so the
 * fan-out rules are unit-testable.
 */
import { isFreeMode } from "./deviceLayout";
import { defaultScreen } from "./templates";

const freshId = () => Math.random().toString(36).slice(2, 9);

/**
 * Place `images` (data URLs) starting at the active screen: the first lands
 * there — in the mockup `deviceId` when it names one on that screen, else the
 * first mockup (legacy screens keep the single image) — and each further image
 * lands in the next screen, appending screens styled like the active one as
 * needed. So a folder of screenshots dropped at once becomes a whole set.
 */
export function placeScreenshots(state, activeIndex, images, { deviceId = null } = {}) {
  if (!state?.screens?.length || !images?.length) return state;
  const screens = [...state.screens];
  const template = screens[activeIndex] || screens[screens.length - 1];
  images.forEach((image, i) => {
    const idx = activeIndex + i;
    if (idx >= screens.length) screens.push(screenLike(template));
    screens[idx] = withScreenshot(screens[idx], image, i === 0 ? deviceId : null);
  });
  return { ...state, screens };
}

/** The screen with `image` in the named mockup (or the first / the legacy slot). */
export function withScreenshot(screen, image, deviceId = null) {
  if (isFreeMode(screen)) {
    const id = deviceId && screen.devices.some((d) => d.id === deviceId) ? deviceId : screen.devices[0].id;
    return { ...screen, devices: screen.devices.map((d) => (d.id === id ? { ...d, image } : d)) };
  }
  return { ...screen, image };
}

/**
 * A new screen that looks like `src` — same background and the same mockup
 * arrangement (fresh ids, no screenshots) — with default copy and no elements,
 * so a dropped set reads as one design.
 */
export function screenLike(src) {
  const next = defaultScreen();
  if (src?.background) next.background = { ...src.background };
  if (isFreeMode(src)) next.devices = src.devices.map((d) => ({ ...d, id: freshId(), image: null }));
  return next;
}
