import { toPng, toJpeg } from "html-to-image";

/**
 * Render a DOM node to an image data-URL at the device's true store dimensions.
 * The node is shown scaled-down in the editor; we compute a pixelRatio so the
 * export matches the canonical store size.
 */
export async function renderNode(node, targetWidth, { format = "png", scale = 1 } = {}) {
  const rect = node.getBoundingClientRect();
  const ratio = (targetWidth / rect.width) * scale;
  const opts = { pixelRatio: ratio, cacheBust: true, skipFonts: false };
  return format === "jpeg"
    ? toJpeg(node, { ...opts, quality: 0.95, backgroundColor: "#ffffff" })
    : toPng(node, opts);
}

const extFor = (format) => (format === "jpeg" ? "jpg" : "png");

/** Render + download. `filename` should be the base name (extension is added). */
export async function exportNode(node, targetWidth, { filename = "screenshot", format = "png", scale = 1 } = {}) {
  const dataUrl = await renderNode(node, targetWidth, { format, scale });
  triggerDownload(dataUrl, `${filename}.${extFor(format)}`);
  return dataUrl;
}

/** Render the node as a PNG and copy it to the clipboard. */
export async function copyNodeToClipboard(node, targetWidth) {
  const dataUrl = await renderNode(node, targetWidth, { format: "png" });
  const blob = await (await fetch(dataUrl)).blob();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Back-compat thin wrapper. */
export async function exportNodeToPng(node, targetWidth, filename = "screenshot.png") {
  const base = filename.replace(/\.png$/i, "");
  return exportNode(node, targetWidth, { filename: base, format: "png" });
}

export function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
