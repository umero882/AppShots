import { Link } from "react-router-dom";

export default function Logo({ to = "/" }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 group">
      <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="7" y="3" width="10" height="18" rx="2.5" fill="white" />
          <rect x="9" y="5.5" width="6" height="11" rx="1" fill="#4f46e5" />
          <circle cx="12" cy="18.5" r="0.9" fill="#4f46e5" />
        </svg>
      </span>
      <span className="text-lg font-extrabold tracking-tight text-white">
        App<span className="text-brand-400">Shots</span>
      </span>
    </Link>
  );
}
