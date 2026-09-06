/**
 * Regenerates public/og-cover.png (1200x630) — the OpenGraph / Twitter card.
 *
 *   npm run og:image
 *
 * Renders a card in headless Chrome and commits the PNG, so the running app has
 * no image-generation dependency. Fonts and the logo are inlined as data URIs
 * because a file:// page cannot fetch its siblings.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "public", "og-cover.png");
const b64 = (p) => fs.readFileSync(p).toString("base64");
const font = (w) => b64(path.join(ROOT, `node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400;src:url(data:font/woff2;base64,${font(400)}) format("woff2")}
@font-face{font-family:Inter;font-weight:600;src:url(data:font/woff2;base64,${font(600)}) format("woff2")}
@font-face{font-family:Inter;font-weight:800;src:url(data:font/woff2;base64,${font(800)}) format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{
  font-family:Inter,system-ui,sans-serif;background:#0b0b12;color:#e2e8f0;
  display:flex;flex-direction:column;justify-content:center;padding:0 86px;position:relative;
}
.glow{position:absolute;inset:0;background:
  radial-gradient(760px 460px at 50% -14%,rgba(99,102,241,.42),transparent 62%),
  radial-gradient(560px 380px at 108% 118%,rgba(79,70,229,.28),transparent 60%);}
.grid{position:absolute;inset:0;opacity:.18;
  background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);
  background-size:64px 64px;
  -webkit-mask-image:radial-gradient(900px 520px at 50% 30%,#000,transparent 72%);}
.inner{position:relative}
.brand{display:flex;align-items:center;gap:20px;margin-bottom:40px}
.brand img{width:76px;height:76px;border-radius:19px}
.brand span{font-weight:800;font-size:40px;letter-spacing:-.02em;color:#fff}
h1{font-weight:800;font-size:74px;line-height:1.06;letter-spacing:-.035em;color:#fff;max-width:15ch}
h1 em{font-style:normal;background:linear-gradient(96deg,#a5b4fc,#818cf8 45%,#6366f1);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{margin-top:26px;font-size:29px;line-height:1.45;color:#94a3b8;max-width:34ch;font-weight:400}
.foot{position:absolute;left:86px;right:86px;bottom:52px;display:flex;align-items:center;
  justify-content:space-between;font-size:23px;color:#64748b}
.pills{display:flex;gap:11px}
.pill{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);
  border-radius:999px;padding:9px 19px;font-size:20px;font-weight:600;color:#c7d2fe}
</style></head><body>
<div class="glow"></div><div class="grid"></div>
<div class="inner">
  <div class="brand"><img src="data:image/png;base64,${b64(path.join(ROOT, "public", "logo.png"))}"><span>AppShots</span></div>
  <h1>Store screenshots, <em>done in minutes</em></h1>
  <p>Templates, device frames and pixel-exact exports for the App Store and Google Play.</p>
</div>
<div class="foot">
  <div>appshots.nextechlabs.tech</div>
  <div class="pills"><div class="pill">iOS</div><div class="pill">Android</div><div class="pill">Exact sizes</div></div>
</div>
</body></html>`;

const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && fs.existsSync(p));
if (!CHROME) throw new Error("Chrome not found — set CHROME_PATH");

const tmp = path.join(os.tmpdir(), "appshots-og-card.html");
fs.writeFileSync(tmp, html);
// A throwaway profile keeps this from attaching to the user's running Chrome,
// which otherwise leaves the headless process hanging after the screenshot.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "appshots-og-"));

execFileSync(CHROME, [
  "--headless=new",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1200,630",
  "--virtual-time-budget=4000",
  `--screenshot=${OUT}`,
  "file:///" + tmp.replace(/\\/g, "/"),
], { stdio: "inherit" });

const png = fs.readFileSync(OUT);
console.log(`og-cover.png ${png.readUInt32BE(16)}x${png.readUInt32BE(20)} ${(png.length / 1024).toFixed(1)} KB`);
