import { toPng } from "html-to-image";

/**
 * Render a DOM node to a PNG at the device's true store dimensions.
 * The node is displayed scaled-down in the editor; we compute a pixelRatio
 * so the export matches the canonical store size.
 */
export async function exportNodeToPng(node, targetWidth, filename = "screenshot.png") {
  const rect = node.getBoundingClientRect();
  const ratio = targetWidth / rect.width;
  const dataUrl = await toPng(node, {
    pixelRatio: ratio,
    cacheBust: true,
    skipFonts: false,
  });
  triggerDownload(dataUrl, filename);
  return dataUrl;
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
