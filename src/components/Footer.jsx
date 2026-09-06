import { Link } from "react-router-dom";
import Logo from "./Logo";

export default function Footer() {
  const cols = [
    {
      title: "Product",
      links: [
        { label: "Features", href: "/#features" },
        { label: "How it works", href: "/#how" },
        { label: "Pricing", to: "/pricing" },
        { label: "Inspiration", to: "/inspiration" },
      ],
    },
    {
      title: "Account",
      links: [
        { label: "Log in", to: "/login" },
        { label: "Create an account", to: "/signup" },
        { label: "Dashboard", to: "/dashboard" },
        { label: "Settings", to: "/settings" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "Next Tech Labs", href: "https://nextechlabs.org", external: true },
        { label: "Contact", href: "mailto:nextechlabs.dev@gmail.com" },
        { label: "Privacy Policy", to: "/privacy" },
        { label: "Terms of Service", to: "/terms" },
      ],
    },
  ];

  const linkClass = "text-sm text-slate-400 hover:text-white transition";

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
                  <li key={l.label}>
                    {l.to ? (
                      <Link to={l.to} className={linkClass}>
                        {l.label}
                      </Link>
                    ) : (
                      <a
                        href={l.href}
                        className={linkClass}
                        {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
                      >
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 sm:flex-row">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} Next Tech Labs. All rights reserved.
          </p>
          <p className="text-xs text-slate-500">
            Not affiliated with Apple or Google. App Store and Google Play are trademarks of their owners.
          </p>
        </div>
      </div>
    </footer>
  );
}
