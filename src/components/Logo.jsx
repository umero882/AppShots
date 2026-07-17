import { Link } from "react-router-dom";

export default function Logo({ to = "/" }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 group">
      <img
        src="/logo.png"
        alt="AppShots"
        width="36"
        height="36"
        className="h-9 w-9 rounded-xl shadow-glow"
      />
      <span className="text-lg font-extrabold tracking-tight text-white">
        App<span className="text-brand-400">Shots</span>
      </span>
    </Link>
  );
}
