/**
 * Device frame definitions. Each frame is drawn purely with CSS/SVG (no image
 * assets) so it scales crisply and exports cleanly. Sizes are the canonical
 * store screenshot dimensions; the editor scales them down to fit.
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
  },
  {
    id: "iphone-65",
    store: "ios",
    name: 'iPhone 6.5"',
    canvas: { w: 1242, h: 2688 },
    screen: { radius: 52, inset: 14 },
    bezel: { radius: 66, color: "#0b0b0e" },
    notch: "notch",
  },
  {
    id: "ipad-13",
    store: "ios",
    name: 'iPad 13"',
    canvas: { w: 2048, h: 2732 },
    screen: { radius: 24, inset: 28 },
    bezel: { radius: 40, color: "#0b0b0e" },
    notch: "none",
  },
  {
    id: "pixel-8",
    store: "android",
    name: "Pixel 8 Pro",
    canvas: { w: 1080, h: 2400 },
    screen: { radius: 44, inset: 12 },
    bezel: { radius: 54, color: "#0b0b0e" },
    notch: "punch-hole",
  },
  {
    id: "android-phone",
    store: "android",
    name: "Android Phone",
    canvas: { w: 1080, h: 1920 },
    screen: { radius: 36, inset: 12 },
    bezel: { radius: 46, color: "#0b0b0e" },
    notch: "punch-hole",
  },
];

export function getDevice(id) {
  return DEVICES.find((d) => d.id === id) || DEVICES[0];
}
