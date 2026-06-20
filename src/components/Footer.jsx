import Logo from "./Logo";

export default function Footer() {
  const cols = [
    {
      title: "Product",
      links: ["Features", "Pricing", "Templates", "Device frames"],
    },
    {
      title: "Resources",
      links: ["Guides", "Store specs", "Changelog", "Status"],
    },
    {
      title: "Company",
      links: ["About", "Blog", "Privacy", "Terms"],
    },
  ];

  return (
    <footer className="border-t border-white/5 bg-ink-950">
      <div className="mx-auto max-w-7xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-slate-400">
              Create beautiful, store-ready App Store and Google Play screenshots
              in minutes — no design tools required.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-semibold text-white">{c.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-slate-400 hover:text-white transition">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 sm:flex-row">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} AppShots. A demo clone built for learning.
          </p>
          <p className="text-xs text-slate-500">Made with React, Vite & Tailwind</p>
        </div>
      </div>
    </footer>
  );
}
