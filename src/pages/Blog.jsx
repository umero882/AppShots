import { Link } from "react-router-dom";
import { ArrowRight, Clock } from "lucide-react";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { coverGradient, formatDate, indexSource, isoDate, postPath } from "../lib/blog";
import useBlogResource from "../lib/useBlogResource";

/**
 * The article index.
 *
 * Rendered from data the prerender wrote into this page, so the HTML a crawler
 * receives already lists every article with its own link — which is how the
 * articles get discovered at all. The fetch path only runs for someone who
 * arrives here by clicking within the app.
 */
export default function Blog() {
  const { status, data } = useBlogResource(indexSource(), "index");
  const posts = Array.isArray(data) ? data : [];

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-5xl px-5 pt-14 pb-24">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-300">Blog</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
          Screenshots that earn the install
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-400">
          Store listings are read in about six seconds, and most of that goes to the first two
          screenshots. These are the sizes, layouts and words that make those seconds count.
        </p>

        {status === "loading" && <p className="mt-12 text-sm text-slate-500">Loading articles…</p>}

        {status === "error" && (
          <p className="mt-12 text-sm text-slate-500">
            The articles could not be loaded just now. Please try again in a moment.
          </p>
        )}

        {status === "ready" && posts.length === 0 && (
          <div className="card mt-12 p-8 text-center">
            <p className="text-base font-semibold text-white">Nothing published yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              The first articles are being written. In the meantime, the fastest way to see what
              AppShots does is to make a set of screenshots — it takes a few minutes and costs
              nothing.
            </p>
            <Link to="/signup" className="btn-primary mt-6">
              Start free <ArrowRight size={16} />
            </Link>
          </div>
        )}

        {status === "ready" && posts.length > 0 && (
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {posts.map((post, i) => (
              <ArticleCard key={post.slug} post={post} featured={i === 0 && posts.length > 2} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

/**
 * One article. The newest gets the full width when there are enough others for
 * the asymmetry to read as a choice rather than an odd gap.
 */
function ArticleCard({ post, featured }) {
  return (
    <article
      className={`card group overflow-hidden transition hover:border-white/20 ${
        featured ? "sm:col-span-2" : ""
      }`}
    >
      <Link to={postPath(post.slug)} className="block">
        <div
          className={featured ? "h-44 sm:h-56" : "h-36"}
          style={
            post.coverImageUrl ? undefined : { backgroundImage: coverGradient(post.slug) }
          }
        >
          {post.coverImageUrl && (
            <img
              src={post.coverImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="chip">{post.category}</span>
            <time dateTime={isoDate(post.publishedAt)}>{formatDate(post.publishedAt)}</time>
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {post.readingMinutes} min
            </span>
          </div>
          <h2
            className={`mt-3 font-bold text-white group-hover:text-brand-200 ${
              featured ? "text-2xl" : "text-lg"
            }`}
          >
            {post.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{post.description}</p>
        </div>
      </Link>
    </article>
  );
}
