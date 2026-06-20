import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles, Smartphone, Languages, Download, Layers, Palette,
  Zap, MousePointerClick, Check, ArrowRight,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScreenCanvas from "../components/ScreenCanvas";
import { defaultProjectState } from "../lib/templates";
import { useAuth } from "../lib/auth";

const heroScreens = [
  {
    bg: { type: "gradient", gradient: "indigo", solid: "" },
    heading: "Track every habit",
    sub: "Build streaks that stick",
  },
  {
    bg: { type: "gradient", gradient: "sunset", solid: "" },
    heading: "Plan your week",
    sub: "Calm, focused, done",
  },
  {
    bg: { type: "gradient", gradient: "ocean", solid: "" },
    heading: "Stay in flow",
    sub: "Less noise, more focus",
  },
];

function HeroPreview() {
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-5">
      {heroScreens.map((s, i) => {
        const state = {
          ...defaultProjectState(),
          background: s.bg,
          deviceScale: 0.82,
          _textPos: "top",
          text: { font: "inter", color: "#ffffff", size: 70, weight: 800, align: "center" },
        };
        const screen = { id: i, heading: s.heading, subheading: s.sub, image: null };
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: i === 1 ? -12 : 0 }}
            transition={{ delay: 0.15 * i, duration: 0.6 }}
            className={i === 1 ? "z-10" : "opacity-90"}
          >
            <ScreenCanvas state={state} screen={screen} width={i === 1 ? 200 : 168} />
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
        <div className="absolute inset-0 bg-grid-fade pointer-events-none" />
        <div className="mx-auto max-w-7xl px-5 pt-16 pb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="chip mx-auto">
              <Sparkles size={14} className="text-brand-400" />
              Free App Store & Google Play screenshot generator
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
        <div className="mx-auto max-w-7xl px-5 py-6">
          <p className="text-center text-xs uppercase tracking-widest text-slate-500">
            Built for indie devs and product teams shipping on both stores
          </p>
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
              className="card p-6"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
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
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="card relative p-7">
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
        <div className="card relative overflow-hidden p-10 text-center sm:p-16">
          <div className="absolute inset-0 bg-grid-fade" />
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
