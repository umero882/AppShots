import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Smartphone, Languages, Download, Layers, Palette,
  Zap, MousePointerClick, Check, ArrowRight, Megaphone, CalendarDays, Upload,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import AppRestyle from "../components/AppRestyle";
import ScreenCanvas from "../components/ScreenCanvas";
import { defaultProjectState, GRADIENTS } from "../lib/templates";
import { saveLandingDraft, fileToDataUrl, accentFromImage, brandBackground } from "../lib/landingDraft";
import { getDevice } from "../lib/devices";
import { mockDashboard, mockStats, mockChat } from "../lib/mockScreens";
import { useAuth } from "../lib/auth";

const lookChoices = ["indigo", "sunset", "ocean", "forest", "grape", "peach"];
const heroMocks = { indigo: mockStats, sunset: mockDashboard, ocean: mockChat, forest: mockStats, grape: mockDashboard, peach: mockChat };

// Live studio: the visitor styles a real screenshot before signing up, and the
// result carries into their first project (see lib/landingDraft).
function TryItLive({ ctaTo }) {
  // On a phone the preview goes first and smaller, so the visitor sees each edit
  // land instead of scrolling past a button to find it.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [heading, setHeading] = useState("Plan your week");
  const [subheading, setSubheading] = useState("Calm, focused, done");
  const [gradient, setGradient] = useState("sunset");
  const [image, setImage] = useState(null);
  // "Match my app": a backdrop built from the uploaded screenshot's accent colour.
  const [brandBg, setBrandBg] = useState(null);
  const [useBrand, setUseBrand] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const g = GRADIENTS.find((x) => x.id === gradient) || GRADIENTS[0];

  async function take(file) {
    setError("");
    try {
      const url = await fileToDataUrl(file);
      setImage(url);
      const accent = await accentFromImage(url);
      setBrandBg(accent ? brandBackground(accent) : null);
      setUseBrand(!!accent);
    } catch {
      setError("That file isn't an image. Try a PNG or JPG.");
    }
  }

  const state = {
    ...defaultProjectState(),
    background: useBrand && brandBg ? brandBg : { type: "gradient", gradient, solid: "" },
    deviceScale: 0.84,
    _textPos: "top",
    text: { font: "inter", color: "#ffffff", size: 66, weight: 800, align: "center" },
  };
  const screen = {
    id: "try",
    heading: heading || " ",
    subheading,
    image: image || heroMocks[gradient](g.from, { dark: false }),
  };

  return (
    <div className="mx-auto grid max-w-4xl items-center gap-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-left shadow-glow sm:p-8 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Try it now · no signup</p>
          <p className="mt-1 text-sm text-slate-400">Type your headline, pick a look, drop in your own screenshot.</p>
        </div>
        <label className="block text-xs font-medium text-slate-400">
          Headline
          <input
            value={heading}
            maxLength={40}
            onChange={(e) => setHeading(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2.5 text-base text-white outline-none focus:border-brand-500"
          />
        </label>
        <label className="block text-xs font-medium text-slate-400">
          Subheading
          <input
            value={subheading}
            maxLength={50}
            onChange={(e) => setSubheading(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-500"
          />
        </label>
        <div>
          <p className="text-xs font-medium text-slate-400">Look</p>
          <div className="mt-2 flex gap-2.5">
            {brandBg && (
              <button
                type="button"
                aria-label="Match my app"
                title="Match my app"
                aria-pressed={useBrand}
                onClick={() => setUseBrand(true)}
                className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-ink-950 transition ${useBrand ? "ring-white" : "ring-transparent hover:ring-white/40"}`}
                style={{ background: brandBg.aiGradient.css }}
              />
            )}
            {lookChoices.map((id) => {
              const x = GRADIENTS.find((q) => q.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={x.name}
                  aria-pressed={!useBrand && gradient === id}
                  onClick={() => { setGradient(id); setUseBrand(false); }}
                  className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-ink-950 transition ${!useBrand && gradient === id ? "ring-white" : "ring-transparent hover:ring-white/40"}`}
                  style={{ background: `linear-gradient(${x.angle}deg, ${x.from}, ${x.to})` }}
                />
              );
            })}
          </div>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
          className={`flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm transition ${over ? "border-brand-400 bg-brand-500/10" : "border-white/15"}`}
        >
          <Upload size={18} className="shrink-0 text-brand-300" />
          <span className="min-w-0 flex-1 text-slate-300">
            {image ? "Your screenshot is in." : "Drop your app screenshot here"}
          </span>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost px-3 py-1.5 text-xs">
            {image ? "Replace" : "Browse"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
        </div>
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        <Link
          to={ctaTo}
          onClick={() => saveLandingDraft({ heading, subheading, gradient, image, ...(useBrand && brandBg ? { background: brandBg } : {}) })}
          className="btn-primary w-full justify-center px-6 py-3 text-base"
        >
          Finish &amp; download free <ArrowRight size={18} />
        </Link>
        <p className="text-center text-xs text-slate-500">We keep your design and open it in the editor.</p>
      </div>
      <div className="order-first mx-auto drop-shadow-[0_28px_45px_rgba(0,0,0,0.45)] md:order-none">
        <ScreenCanvas state={state} screen={screen} width={narrow ? 168 : 248} />
      </div>
    </div>
  );
}

// Width of an element, so a fixed-pixel ScreenCanvas can fill a fluid column.
function useWidth(fallback) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth || fallback);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width];
}

// The iOS 27 product-page placements and In-App Event media, drawn by the
// same ScreenCanvas the editor exports with.
const creativeShowcase = [
  {
    deviceId: "aso-header", gradient: "indigo", heading: "Plan your week", sub: "Calm, focused, done",
    mock: mockDashboard, accent: "#6366f1",
  },
  {
    deviceId: "aso-search", gradient: "ocean", heading: "Stay in flow", sub: "",
    mock: mockChat, accent: "#0ea5e9",
  },
  {
    deviceId: "iae-card", gradient: "sunset", heading: "Starts Friday", sub: "Double streak points",
    mock: mockStats, accent: "#fb7185",
  },
];

const creativeFormats = [
  { icon: Megaphone, label: "Product page header", size: "21:9 · 3840×1646" },
  { icon: Megaphone, label: "Search results card", size: "3:2 · 3840×2560 / 1920×1280" },
  { icon: Megaphone, label: "Universal header + search", size: "16:9 · 5244×2950 PNG" },
  { icon: CalendarDays, label: "In-App Event card", size: "16:9 · 3840×2160" },
  { icon: CalendarDays, label: "In-App Event details", size: "9:16 · 2160×3840" },
];

function CreativePreview({ item, className = "" }) {
  const [ref, width] = useWidth(320);
  const device = getDevice(item.deviceId);
  const state = {
    ...defaultProjectState(),
    deviceId: item.deviceId,
    background: { type: "gradient", gradient: item.gradient, solid: "" },
    text: { font: "inter", color: "#ffffff", size: 70, weight: 800, align: "left" },
  };
  const screen = { id: item.deviceId, heading: item.heading, subheading: item.sub, image: item.mock(item.accent, { dark: false }) };
  return (
    <figure className={className}>
      <div ref={ref} className="overflow-hidden rounded-xl ring-1 ring-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
        <ScreenCanvas state={state} screen={screen} width={width} />
      </div>
      <figcaption className="mt-2 text-xs text-slate-500">
        {device.name} · {device.canvas.w}×{device.canvas.h}
      </figcaption>
    </figure>
  );
}

function CreativeAssetsSection({ ctaTo }) {
  const [header, search, event] = creativeShowcase;
  return (
    <section id="creative-assets" className="border-t border-white/5">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
        <div>
          <span className="chip">New · iOS 27</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Header, search &amp; In-App Event art
          </h2>
          <p className="mt-4 text-slate-400">
            The App Store now shows a banner across the top of your product page and a
            creative card in search results. Design both — plus In-App Event media — in the
            same editor, at Apple&apos;s exact sizes, with the safe area marked so nothing
            important gets cropped on iPhone or iPad.
          </p>
          <ul className="mt-6 space-y-2.5">
            {creativeFormats.map((f) => (
              <li key={f.label} className="flex items-start gap-3 text-sm">
                <f.icon size={16} className="mt-0.5 shrink-0 text-brand-300" />
                <span className="text-slate-200">
                  {f.label} <span className="text-slate-500">— {f.size}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-400">
            Export PNG/JPG or a looping video, and let the AI copywriter write
            short lines sized for each placement.
          </p>
          <Link to={ctaTo} className="btn-primary mt-8 px-5 py-2.5">
            Make your banner <ArrowRight size={16} />
          </Link>
        </div>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <CreativePreview item={header} className="sm:col-span-2" />
          <CreativePreview item={search} />
          <CreativePreview item={event} />
        </div>
      </div>
    </section>
  );
}

const features = [
  { icon: Smartphone, title: "Real device frames", desc: "Pixel-perfect iPhone, iPad and Android frames at exact store dimensions." },
  { icon: Palette, title: "Gradients & themes", desc: "Hand-tuned gradient palettes and solid backgrounds with one click." },
  { icon: Layers, title: "Multi-screen sets", desc: "Build a full set of screenshots and keep your styling consistent." },
  { icon: Languages, title: "Localization ready", desc: "Duplicate a set and swap copy for every language you ship in." },
  { icon: Download, title: "Store-ready export", desc: "Export crisp PNGs sized correctly for App Store and Google Play — plus iOS 27 header, search and In-App Event art." },
  { icon: Zap, title: "Fast by design", desc: "No bloated editor — go from upload to export in under a minute." },
];

const steps = [
  { icon: MousePointerClick, title: "Upload your screenshot", desc: "Drop in a raw capture from the simulator or your phone." },
  { icon: Palette, title: "Style it", desc: "Pick a device frame, background, headline and layout." },
  { icon: Download, title: "Export & ship", desc: "Download store-ready PNGs and upload to the stores." },
];

export default function Landing() {
  const { user } = useAuth();
  const ctaTo = user ? "/dashboard" : "/signup";

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* layered ambiance: radial glow + dot texture + drifting brand blobs */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-grid-fade" />
          <div className="absolute inset-0 bg-dot-grid opacity-60" />
          <div className="animate-blob absolute -left-24 top-8 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />
          <div
            className="animate-blob absolute -right-16 top-28 h-80 w-80 rounded-full bg-fuchsia-600/15 blur-3xl"
            style={{ animationDelay: "-7s" }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 pt-16 pb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="chip mx-auto">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
              </span>
              Free App Store &amp; Google Play screenshot generator
            </span>
            <a
              href="#creative-assets"
              className="mx-auto mt-3 block w-fit text-xs font-medium text-brand-300 hover:text-brand-200"
            >
              New: iOS 27 header, search &amp; In-App Event art →
            </a>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">
              Store screenshots that
              <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">
                {" "}sell your app
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-slate-400">
              Turn raw captures into polished App Store and Google Play
              screenshots in minutes. Device frames, gradients, and
              store-ready exports — no design skills needed.
            </p>
            <p className="mt-3 text-xs text-slate-500">No credit card required · Free plan forever</p>
          </motion.div>

          <div className="mt-14">
            <TryItLive ctaTo={ctaTo} />
          </div>
        </div>
      </section>

      {/* Logos / trust strip */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-6">
          <span className="hidden h-px flex-1 bg-gradient-to-r from-transparent to-white/10 sm:block" />
          <p className="text-center text-xs uppercase tracking-widest text-slate-500">
            Built for indie devs and product teams shipping on both stores
          </p>
          <span className="hidden h-px flex-1 bg-gradient-to-l from-transparent to-white/10 sm:block" />
        </div>
      </section>

      <AppRestyle ctaTo={ctaTo} />

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Everything you need to look professional
          </h2>
          <p className="mt-4 text-slate-400">
            A focused toolkit that does the boring parts for you, so your
            screenshots look like they came from a design team.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: (i % 3) * 0.06 }}
              className="card group relative overflow-hidden p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-glow"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500/15 text-brand-300 transition group-hover:bg-brand-500/25 group-hover:text-brand-200">
                <f.icon size={20} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <CreativeAssetsSection ctaTo={ctaTo} />

      {/* How it works */}
      <section id="how" className="border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Three steps to a finished set
            </h2>
            <p className="mt-4 text-slate-400">From raw capture to store upload without leaving the browser.</p>
          </div>
          <div className="relative mt-12 grid gap-6 md:grid-cols-3">
            {/* connective path threading the three steps on desktop */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[16%] top-[50px] hidden h-px bg-gradient-to-r from-brand-500/0 via-brand-500/30 to-brand-500/0 md:block"
            />
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="card relative p-7 transition duration-300 hover:-translate-y-1 hover:border-white/20"
              >
                <span className="absolute right-5 top-5 text-5xl font-black text-white/5">
                  {i + 1}
                </span>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                  <s.icon size={20} />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-5 py-20">
        <div className="card relative overflow-hidden p-10 text-center shadow-glow sm:p-16">
          <div className="absolute inset-0 bg-grid-fade" />
          <div className="animate-blob absolute -left-10 top-0 h-40 w-40 rounded-full bg-brand-600/25 blur-3xl" />
          <div
            className="animate-blob absolute -right-8 bottom-0 h-44 w-44 rounded-full bg-fuchsia-600/20 blur-3xl"
            style={{ animationDelay: "-6s" }}
          />
          <div className="relative">
            <h2 className="mx-auto max-w-xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to make your app stand out?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-slate-400">
              Create your first set of store screenshots in the next five minutes.
            </p>
            <Link to={ctaTo} className="btn-primary mt-8 text-base px-6 py-3">
              Get started free <ArrowRight size={18} />
            </Link>
            <ul className="mx-auto mt-6 flex max-w-md flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
              {["Free forever plan", "No watermark on Pro", "Both stores supported"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={15} className="text-brand-400" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
