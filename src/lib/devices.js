/**
 * Device frame definitions. Each frame is drawn purely with CSS/SVG (no image
 * assets) so it scales crisply and exports cleanly. Sizes are the canonical
 * store screenshot dimensions; the editor scales them down to fit.
 *
 * `buttons: true` draws side buttons (phones); tablets omit them.
 */

export const STORES = {
  ios: { label: "App Store (iOS)", id: "ios" },
  android: { label: "Google Play (Android)", id: "android" },
};

export const DEVICES = [
  {
    id: "iphone-69",
    store: "ios",
    name: 'iPhone 6.9"',
    canvas: { w: 1290, h: 2796 },
    screen: { radius: 60, inset: 16 },
    bezel: { radius: 76, color: "#0b0b0e" },
    notch: "dynamic-island",
    buttons: true,
  },
  {
    id: "iphone-69-max",
    store: "ios",
    name: 'iPhone 6.9" Max',
    // iPhone 16 Pro Max — the other App Store-accepted 6.9" size.
    canvas: { w: 1320, h: 2868 },
    screen: { radius: 62, inset: 16 },
    bezel: { radius: 78, color: "#0b0b0e" },
    notch: "dynamic-island",
    buttons: true,
  },
  {
    id: "iphone-65",
    store: "ios",
    name: 'iPhone 6.5"',
    canvas: { w: 1284, h: 2778 },
    screen: { radius: 52, inset: 14 },
    bezel: { radius: 66, color: "#0b0b0e" },
    notch: "notch",
    buttons: true,
  },
  {
    id: "iphone-55",
    store: "ios",
    name: 'iPhone 5.5"',
    canvas: { w: 1242, h: 2208 },
    screen: { radius: 8, inset: 10 },
    bezel: { radius: 26, color: "#0b0b0e" },
    notch: "none",
    buttons: true,
  },
  {
    id: "ipad-13",
    store: "ios",
    name: 'iPad 13"',
    // iPad Pro 13" (M4) — the current App Store-required iPad size.
    canvas: { w: 2064, h: 2752 },
    screen: { radius: 24, inset: 28 },
    bezel: { radius: 40, color: "#0b0b0e" },
    notch: "none",
    buttons: false,
  },
  {
    id: "ipad-129",
    store: "ios",
    name: 'iPad 12.9"',
    // Legacy iPad Pro 12.9" — still accepted by the App Store.
    canvas: { w: 2048, h: 2732 },
    screen: { radius: 24, inset: 28 },
    bezel: { radius: 40, color: "#0b0b0e" },
    notch: "none",
    buttons: false,
  },
  {
    id: "ipad-11",
    store: "ios",
    name: 'iPad 11"',
    canvas: { w: 1668, h: 2388 },
    screen: { radius: 22, inset: 24 },
    bezel: { radius: 36, color: "#0b0b0e" },
    notch: "none",
    buttons: false,
  },
  {
    id: "pixel-8",
    store: "android",
    name: "Pixel 8 Pro",
    // Capped to Google Play's max 2:1 aspect (native 1080×2400 = 2.22:1 is
    // rejected). Width stays 1080 so text scaling + element positions are stable.
    canvas: { w: 1080, h: 2160 },
    screen: { radius: 44, inset: 12 },
    bezel: { radius: 54, color: "#0b0b0e" },
    notch: "punch-hole",
    buttons: true,
  },
  {
    id: "galaxy-s24",
    store: "android",
    name: "Galaxy S24",
    // Capped to Google Play's max 2:1 aspect (native 1080×2340 = 2.17:1 is
    // rejected). Width stays 1080 so text scaling + element positions are stable.
    canvas: { w: 1080, h: 2160 },
    screen: { radius: 40, inset: 11 },
    bezel: { radius: 50, color: "#0b0b0e" },
    notch: "punch-hole",
    buttons: true,
  },
  {
    id: "android-phone",
    store: "android",
    name: "Android Phone",
    canvas: { w: 1080, h: 1920 },
    screen: { radius: 36, inset: 12 },
    bezel: { radius: 46, color: "#0b0b0e" },
    notch: "punch-hole",
    buttons: true,
  },
  {
    id: "android-tablet",
    store: "android",
    name: "Android Tablet",
    canvas: { w: 1600, h: 2560 },
    screen: { radius: 22, inset: 22 },
    bezel: { radius: 34, color: "#0b0b0e" },
    notch: "none",
    buttons: false,
  },
];

/**
 * App Store creative assets (iOS 27 / iPadOS 27): the product-page header and
 * the search-results card. These are landscape marketing canvases, not device
 * screenshots — one image serves every iPhone/iPad and orientation, and each
 * device clips the edges differently, so text and the focal point must stay
 * inside `safe` (canvas px, measured from Apple's official templates).
 *
 * The canvas is fixed (orientation never swaps it). Phone mockups placed on it
 * are drawn as `mockup` (overridable per project via `state.mockupDeviceId`).
 * `mockupK` × canvas height is the length a mockup's `scale` multiplies — tuned
 * per format so the default phone plus a headline fit the safe area side by side.
 * `textBase` is the width the headline size is measured against. Header and
 * search cards both display at about phone width, so a phone-like base keeps a
 * template's headline the same apparent size; the universal 16:9's safe area is
 * a small centre crop, so its base is larger (smaller text) to fit the column.
 * `pngOnly`: Apple accepts the 16:9 universal size as .png only.
 * `video`: header/search accept a 5–30 s muted looping video at the exact size
 * (`maxLong` = the long side to record at, `minMs` = shortest allowed length);
 * the universal size is image-only.
 * `group`: "placement" (header / search results) or "event" (In-App Events).
 * `layout`: "row" (default) puts the headline beside the phone on landscape
 * banners; "column" stacks it above, for the portrait event-details page.
 *
 * In-App Event media: card 16:9 (1920×1080 – 3840×2160), details page 9:16
 * (1080×1920 – 2160×3840), video 15–30 s. Apple publishes no safe area; ours
 * follow observed crops — the card loses ~75 px per side at 1920 wide, and the
 * details page's title / description / Get button cover the bottom ~510 px of
 * 1920. The App Store prints the event name and description itself, so event
 * artwork should carry little or no text.
 *
 * https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/
 */
export const CREATIVE_FORMATS = [
  {
    id: "aso-header",
    kind: "creative",
    group: "placement",
    store: "ios",
    name: "Product page header",
    short: "Header 21:9",
    canvas: { w: 3840, h: 1646 },
    safe: { x: 1097, y: 493, w: 1646, h: 661 },
    textBase: 1300,
    video: { maxLong: 3840 },
    mockupK: 0.36,
    mockup: "iphone-69",
  },
  {
    id: "aso-search",
    kind: "creative",
    group: "placement",
    store: "ios",
    name: "Search results",
    short: "Search 3:2",
    canvas: { w: 3840, h: 2560 },
    safe: { x: 836, y: 765, w: 2168, h: 1030 },
    textBase: 1300,
    video: { maxLong: 1920 }, // 1920×1280 — Apple's 3:2 minimum, light to record
    mockupK: 0.3,
    mockup: "iphone-69",
  },
  {
    id: "aso-search-min",
    kind: "creative",
    group: "placement",
    store: "ios",
    name: "Search results (min)",
    short: "Search 3:2 · 1920",
    // Same 3:2 placement at Apple's minimum size; safe area scaled by 0.5.
    canvas: { w: 1920, h: 1280 },
    safe: { x: 418, y: 383, w: 1084, h: 515 },
    textBase: 650,
    video: { maxLong: 1920 },
    mockupK: 0.3,
    mockup: "iphone-69",
  },
  {
    id: "aso-universal",
    kind: "creative",
    group: "placement",
    store: "ios",
    name: "Universal (header + search)",
    short: "Universal 16:9",
    canvas: { w: 5244, h: 2950 },
    safe: { x: 1921, y: 660, w: 1402, h: 962 },
    textBase: 2600,
    pngOnly: true,
    video: null,
    mockupK: 0.2,
    mockup: "iphone-69",
  },
  {
    id: "iae-card",
    kind: "creative",
    group: "event",
    store: "ios",
    name: "In-App Event card",
    short: "Event card 16:9",
    canvas: { w: 3840, h: 2160 },
    safe: { x: 150, y: 108, w: 3540, h: 1944 },
    textBase: 1300,
    video: { maxLong: 1920, minMs: 15000 }, // 1920×1080 — Apple's minimum
    mockupK: 0.36,
    mockup: "iphone-69",
  },
  {
    id: "iae-detail",
    kind: "creative",
    group: "event",
    layout: "column",
    store: "ios",
    name: "In-App Event details page",
    short: "Event details 9:16",
    canvas: { w: 2160, h: 3840 },
    // Top clears the close button; the bottom 1020 px sit under the event's
    // title, description and Get button.
    safe: { x: 108, y: 216, w: 1944, h: 2604 },
    textBase: 1100,
    video: { maxLong: 1920, minMs: 15000 }, // 1080×1920 — Apple's minimum
    mockupK: 0.34,
    mockup: "iphone-69",
  },
];

/** Creative formats in one picker group ("placement" | "event"). */
export function creativeGroup(group) {
  return CREATIVE_FORMATS.filter((d) => (d.group || "placement") === group);
}

export function getDevice(id) {
  return DEVICES.find((d) => d.id === id) || CREATIVE_FORMATS.find((d) => d.id === id) || DEVICES[0];
}

/** True for an App Store creative-asset canvas (header / search results). */
export function isCreative(idOrDevice) {
  const id = typeof idOrDevice === "string" ? idOrDevice : idOrDevice?.id;
  return CREATIVE_FORMATS.some((d) => d.id === id);
}

/**
 * The device a project's default mockup is drawn as. On a store screenshot it
 * is the output device itself; on a creative-asset canvas it is a phone
 * (`state.mockupDeviceId`, else the format's default) — a banner is not a device.
 */
export function mockupDeviceId(state) {
  const out = state?.deviceId;
  if (!isCreative(out)) return out;
  const pick = state?.mockupDeviceId;
  return DEVICES.some((d) => d.id === pick) ? pick : getDevice(out).mockup;
}

/** Width the headline / subheading sizes are measured against. */
export function textBaseOf(device) {
  return device?.textBase || device?.canvas?.w || 1290;
}

/**
 * True for the iPad family. Its wide 3:4 screen letterboxes a phone-shaped
 * screenshot badly (big blurred side-bars), so the editor can force these to
 * fill edge-to-edge.
 */
export function isIpad(id) {
  return typeof id === "string" && id.startsWith("ipad");
}
