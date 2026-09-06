/**
 * Tiny tar (ustar) writer/reader + gzip on Node built-ins, so the backup job needs
 * no `tar` binary or npm package. Handles regular files and directories with
 * paths up to 255 chars (ustar prefix/name split) — plenty for /app/data.
 */
import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { gzipSync, gunzipSync } from "zlib";

const BLOCK = 512;
const enc = (s) => Buffer.from(s, "utf8");

function header({ name, size, mtime, type, mode }) {
  const buf = Buffer.alloc(BLOCK, 0);
  let prefix = "";
  let base = name;
  if (enc(base).length > 100) {
    // Split at a "/" so name ≤ 100 and prefix ≤ 155 (ustar).
    const idx = name.lastIndexOf("/", 155);
    if (idx > 0 && enc(name.slice(idx + 1)).length <= 100) {
      prefix = name.slice(0, idx);
      base = name.slice(idx + 1);
    } else throw new Error(`tar-path-too-long: ${name}`);
  }
  buf.write(base, 0, 100, "utf8");
  buf.write((mode & 0o7777).toString(8).padStart(7, "0") + "\0", 100, 8, "ascii");
  buf.write("0000000\0", 108, 8, "ascii"); // uid
  buf.write("0000000\0", 116, 8, "ascii"); // gid
  buf.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  buf.write(Math.floor(mtime / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "ascii");
  buf.write("        ", 148, 8, "ascii"); // checksum placeholder (spaces)
  buf.write(type, 156, 1, "ascii"); // "0" file, "5" dir
  buf.write("ustar\0", 257, 6, "ascii");
  buf.write("00", 263, 2, "ascii");
  if (prefix) buf.write(prefix, 345, 155, "utf8");
  let sum = 0;
  for (const b of buf) sum += b;
  buf.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return buf;
}

/** Recursively pack `dir` into a gzipped tar Buffer. Entry names are relative to `dir`. */
export function packDirectory(dir, { filter = () => true } = {}) {
  const chunks = [];
  const walk = (abs, rel) => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const childAbs = path.join(abs, e.name);
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (!filter(childRel, e)) continue;
      if (e.isDirectory()) {
        const st = statSync(childAbs);
        chunks.push(header({ name: childRel + "/", size: 0, mtime: st.mtimeMs, type: "5", mode: 0o755 }));
        walk(childAbs, childRel);
      } else if (e.isFile()) {
        const data = readFileSync(childAbs);
        const st = statSync(childAbs);
        chunks.push(header({ name: childRel, size: data.length, mtime: st.mtimeMs, type: "0", mode: 0o644 }));
        chunks.push(data);
        const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
        if (pad) chunks.push(Buffer.alloc(pad, 0));
      }
    }
  };
  walk(dir, "");
  chunks.push(Buffer.alloc(BLOCK * 2, 0)); // end-of-archive
  return gzipSync(Buffer.concat(chunks), { level: 6 });
}

/** Parse a gzipped tar Buffer into [{ name, type, data }]. */
export function listArchive(gz) {
  const buf = gunzipSync(gz);
  const entries = [];
  let off = 0;
  const str = (start, len) => buf.toString("utf8", start, start + len).replace(/\0.*$/s, "");
  while (off + BLOCK <= buf.length) {
    const h = buf.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) break;
    const base = str(off, 100);
    const size = parseInt(str(off + 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(h[156]) || "0";
    const prefix = str(off + 345, 155);
    const name = prefix ? `${prefix}/${base}` : base;
    off += BLOCK;
    const data = buf.subarray(off, off + size);
    off += Math.ceil(size / BLOCK) * BLOCK;
    entries.push({ name, type: type === "5" ? "dir" : "file", data: Buffer.from(data) });
  }
  return entries;
}

/** Extract a gzipped tar into `dir` (creating it). Refuses paths that escape `dir`. */
export function extractArchive(gz, dir) {
  const root = path.resolve(dir);
  let files = 0;
  for (const e of listArchive(gz)) {
    const target = path.resolve(root, e.name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`tar-unsafe-path: ${e.name}`);
    if (e.type === "dir") mkdirSync(target, { recursive: true });
    else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, e.data);
      files++;
    }
  }
  return { files };
}
