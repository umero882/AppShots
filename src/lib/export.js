import { toPng, toJpeg } from "html-to-image";

/**
 * Render a DOM node to an image data-URL at the device's true store dimensions.
 * The node is shown scaled-down in the editor; we force the output canvas to the
 * EXACT store size so the App Store's strict dimension check passes.
 *
 * We pin `canvasWidth`/`canvasHeight` (with pixelRatio 1) rather than relying on
 * `pixelRatio × node.offsetSize`: the on-screen node width is a fractional CSS
 * pixel value, so the derived raster was coming out off-by-a-few-pixels (e.g.
 * 1283×2776 for a 1284×2778 device), which Apple rejects. The node is a vector
 * foreignObject, so rasterizing straight to the target size stays crisp.
 *
 * `targetHeight` is the canonical store height; when omitted we keep the node's
 * own aspect ratio (used by the video reel, which controls its own size).
 */
export async function renderNode(node, targetWidth, { format = "png", scale = 1, targetHeight } = {}) {
  const rect = node.getBoundingClientRect();
  const outW = Math.round(targetWidth * scale);
  const outH = Math.round(
    (targetHeight != null ? targetHeight : (rect.height / rect.width) * targetWidth) * scale
  );
  const opts = { pixelRatio: 1, canvasWidth: outW, canvasHeight: outH, cacheBust: true, skipFonts: false };
  const raw = format === "jpeg"
    ? await toJpeg(node, { ...opts, quality: 0.95, backgroundColor: "#ffffff" })
    : await toPng(node, { ...opts, backgroundColor: "#ffffff" });
  if (typeof document === "undefined") return raw; // SSR/tests
  // Flatten onto an opaque canvas first (drops any transparency).
  const canvas = await drawOpaque(raw, outW, outH);
  if (format === "jpeg") return canvas.toDataURL("image/jpeg", 0.95); // JPEG has no alpha
  // PNG: browser canvas.toDataURL always writes truecolor+ALPHA (colorType 6),
  // and App Store Connect rejects screenshots that contain an alpha channel.
  // Re-encode ourselves as a truecolor RGB PNG (colorType 2 — no alpha).
  try {
    const rgb = await encodeRgbPng(canvas);
    if (rgb) return rgb;
  } catch {
    // fall through to the (RGBA) canvas PNG if anything is unsupported/tainted
  }
  return canvas.toDataURL("image/png");
}

/** Draw a data-URL onto an opaque white canvas (flattens transparency). */
function drawOpaque(dataUrl, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ---- minimal truecolor (RGB, no-alpha) PNG encoder ------------------------
// html-to-image / canvas only emit RGBA PNGs; Apple rejects an alpha channel.
// We rebuild the file as colorType 2 (RGB) using the browser's CompressionStream
// for the zlib (IDAT) deflate — no external dependency.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = data.length;
  const out = new Uint8Array(12 + len);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  dv.setUint32(8 + len, crc32(out.subarray(4, 8 + len)));
  return out;
}

async function zlibDeflate(bytes) {
  const cs = new CompressionStream("deflate"); // zlib-wrapped (RFC 1950), as PNG requires
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

function bytesToBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function encodeRgbPng(canvas) {
  if (typeof CompressionStream === "undefined") return null;
  const w = canvas.width;
  const h = canvas.height;
  const { data } = canvas.getContext("2d").getImageData(0, 0, w, h); // RGBA, A=255 (opaque)
  // Scanlines: each row is [filter=0, R,G,B, R,G,B, ...] — drop the alpha byte.
  const raw = new Uint8Array(h * (1 + w * 3));
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    let s = y * w * 4;
    for (let x = 0; x < w; x++) {
      raw[p++] = data[s];
      raw[p++] = data[s + 1];
      raw[p++] = data[s + 2];
      s += 4;
    }
  }
  const idat = await zlibDeflate(raw);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = truecolor (RGB, no alpha)
  // bytes 10–12 (compression/filter/interlace) stay 0
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    png.set(c, off);
    off += c.length;
  }
  return "data:image/png;base64," + bytesToBase64(png);
}

const extFor = (format) => (format === "jpeg" ? "jpg" : "png");

/** Render + download. `filename` should be the base name (extension is added). */
export async function exportNode(node, targetWidth, { filename = "screenshot", format = "png", scale = 1, targetHeight } = {}) {
  const dataUrl = await renderNode(node, targetWidth, { format, scale, targetHeight });
  triggerDownload(dataUrl, `${filename}.${extFor(format)}`);
  return dataUrl;
}

/** Render the node as a PNG and copy it to the clipboard. */
export async function copyNodeToClipboard(node, targetWidth, { targetHeight } = {}) {
  const dataUrl = await renderNode(node, targetWidth, { format: "png", targetHeight });
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

/** Convert a data-URL (or blob URL) to raw bytes for zipping. */
export async function dataUrlToBytes(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return new Uint8Array(await blob.arrayBuffer());
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
