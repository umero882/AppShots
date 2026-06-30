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
    canvas: { w: 1080, h: 2400 },
    screen: { radius: 44, inset: 12 },
    bezel: { radius: 54, color: "#0b0b0e" },
    notch: "punch-hole",
    buttons: true,
  },
  {
    id: "galaxy-s24",
    store: "android",
    name: "Galaxy S24",
    canvas: { w: 1080, h: 2340 },
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

export function getDevice(id) {
  return DEVICES.find((d) => d.id === id) || DEVICES[0];
}
