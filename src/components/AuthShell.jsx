import { Link } from "react-router-dom";
import Logo from "./Logo";

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* form side */}
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
            <div className="mt-7">{children}</div>
            <div className="mt-6 text-sm text-slate-400">{footer}</div>
          </div>
        </div>
      </div>

      {/* art side */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 lg:block">
        <div className="absolute inset-0 bg-grid-fade" />
        <div className="relative flex h-full flex-col items-center justify-center px-12 text-center">
          <h2 className="max-w-sm text-3xl font-extrabold leading-tight text-white">
            Beautiful store screenshots, minutes away.
          </h2>
          <p className="mt-3 max-w-xs text-brand-100">
            Join developers shipping polished App Store and Google Play listings
            without a designer.
          </p>
          <div className="mt-10 flex items-end gap-3">
            {["from-white/90 to-white/70", "from-white to-white/80", "from-white/80 to-white/60"].map(
              (g, i) => (
                <div
                  key={i}
                  className={`rounded-2xl bg-gradient-to-b ${g} shadow-2xl`}
                  style={{ width: 70, height: i === 1 ? 150 : 130 }}
                />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
