import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Smartphone, Languages, Download, Layers, Palette,
  Zap, MousePointerClick, Check, ArrowRight,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScreenCanvas from "../components/ScreenCanvas";
import { defaultProjectState } from "../lib/templates";
import { mockDashboard, mockStats, mockChat } from "../lib/mockScreens";
import { useAuth } from "../lib/auth";

// Hero devices show believable app UI (via mockScreens) instead of empty frames,
// fanned with a lifted centre. rotate/lift build the fan; mock+accent fill the screen.
const heroScreens = [
  {
    gradient: "indigo", heading: "Track every habit", sub: "Build streaks that stick",
    mock: mockStats, accent: "#6366f1", rotate: -8, lift: 12,
  },
  {
    gradient: "sunset", heading: "Plan your week", sub: "Calm, focused, done",
    mock: mockDashboard, accent: "#fb7185", rotate: 0, lift: -14, center: true,
  },
  {
    gradient: "ocean", heading: "Stay in flow", sub: "Less noise, more focus",
    mock: mockChat, accent: "#0ea5e9", rotate: 8, lift: 12,
  },
];

function HeroPreview() {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex items-end justify-center gap-3 sm:gap-6">
      {/* soft spotlight pooled beneath the devices */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto h-40 max-w-2xl rounded-[100%] bg-brand-500/25 blur-3xl"
      />
      {heroScreens.map((s, i) => {
        const state = {
          ...defaultProjectState(),
          background: { type: "gradient", gradient: s.gradient, solid: "" },
          deviceScale: 0.82,
          _textPos: "top",
          text: { font: "inter", color: "#ffffff", size: 70, weight: 800, align: "center" },
        };
        const screen = {
          id: i,
          heading: s.heading,
          subheading: s.sub,
          image: s.mock(s.accent, { dark: false }),
        };
        const w = s.center ? 212 : 172;
        return (
          <motion.div
            key={i}
            className={`relative ${s.center ? "z-10" : "z-[1]"}`}
            initial={{ opacity: 0, y: 46 }}
            animate={{ opacity: 1, y: s.lift }}
            transition={{ delay: 0.12 * i, duration: 0.6, ease: "easeOut" }}
            style={{ rotate: s.rotate }}
          >
            <motion.div
              animate={reduce ? undefined : { y: [0, s.center ? -9 : -6, 0] }}
              transition={
                reduce ? undefined : { duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.6 }
              }
              className="drop-shadow-[0_28px_45px_rgba(0,0,0,0.45)]"
            >
              <ScreenCanvas state={state} screen={screen} width={w} />
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

const features = [
  { icon: Smartphone, title: "Real device frames", desc: "Pixel-perfect iPhone, iPad and Android frames at exact store dimensions." },
  { icon: Palette, title: "Gradients & themes", desc: "Hand-tuned gradient palettes and solid backgrounds with one click." },
  { icon: Layers, title: "Multi-screen sets", desc: "Build a full set of screenshots and keep your styling consistent." },
  { icon: Languages, title: "Localization ready", desc: "Duplicate a set and swap copy for every language you ship in." },
  { icon: Download, title: "Store-ready export", desc: "Export crisp PNGs sized correctly for App Store and Google Play." },
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
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to={ctaTo} className="btn-primary text-base px-6 py-3">
                Start creating free <ArrowRight size={18} />
              </Link>
              <a href="#features" className="btn-ghost text-base px-6 py-3">
                See features
              </a>
            </div>
            <p className="mt-3 text-xs text-slate-500">No credit card required · Free plan forever</p>
          </motion.div>

          <div className="mt-16">
            <HeroPreview />
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
