import { useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";

/**
 * Shared shell for long-form legal documents (Privacy Policy, Terms of Service).
 * Renders a title block, a jump list, and the prose (styled via `.legal` rules in
 * index.css so the documents can be written as plain headings/paragraphs/lists).
 */
export default function LegalPage({ title, updated, intro, sections, related }) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — AppShots`;
    return () => {
      document.title = prev;
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 pt-14 pb-24">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-300">Legal</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: {updated}</p>
        {intro && <div className="legal mt-6">{intro}</div>}

        <nav aria-label="Contents" className="mt-8 rounded-2xl border border-white/5 bg-ink-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contents</p>
          <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-slate-300 hover:text-white">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2>
                {i + 1}. {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>

        {related && (
          <p className="mt-12 border-t border-white/5 pt-6 text-sm text-slate-400">
            See also:{" "}
            {related.map((r, i) => (
              <span key={r.to}>
                {i > 0 && " · "}
                <Link to={r.to} className="font-semibold text-brand-300 hover:text-brand-200">
                  {r.label}
                </Link>
              </span>
            ))}
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
