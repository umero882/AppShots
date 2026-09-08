import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { coverGradient, formatDate, isoDate, postSource } from "../lib/blog";
import { applySeo } from "../lib/head";
import { seoForPost } from "../lib/seo";
import useBlogResource from "../lib/useBlogResource";

/**
 * One article.
 *
 * The body is HTML that was produced at build time from the article's markdown
 * (scripts/blog/markdown.mjs), with raw markup dropped rather than filtered —
 * which is what makes setting it here safe. Nothing on this page renders
 * anything a reader supplied.
 */
export default function BlogPost() {
  const { slug } = useParams();
  const { status, data: post } = useBlogResource(postSource(slug), slug);

  // SeoSync deliberately leaves article routes alone, because the title lives
  // in the article and it has no way to know it. This is the other half: once
  // the article is here, its head goes in. On a first load the prerender has
  // already written exactly these values, so this changes nothing — it matters
  // when a reader arrives from the index without a page load.
  useEffect(() => {
    if (post) applySeo(seoForPost(post));
  }, [post]);

  if (status === "loading") {
    return (
      <Shell>
        <p className="text-sm text-slate-500">Loading…</p>
      </Shell>
    );
  }

  if (status !== "ready" || !post) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-white">That article isn&rsquo;t here</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-400">
          It may have been renamed. The index has everything that is published.
        </p>
        <Link to="/blog" className="btn-ghost mt-6">
          <ArrowLeft size={16} /> All articles
        </Link>
      </Shell>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 pt-14 pb-24">
        <Link to="/blog" className="text-sm text-slate-400 transition hover:text-white">
          <ArrowLeft size={14} className="mr-1 inline" /> All articles
        </Link>

        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="chip">{post.category}</span>
            <time dateTime={isoDate(post.publishedAt)}>{formatDate(post.publishedAt)}</time>
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {post.readingMinutes} min read
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
            {post.title}
          </h1>
          {/* The meta description, used as a standfirst. It is written to be the
              sentence someone reads before deciding to click, which is exactly
              the sentence they want first once they have. */}
          <p className="mt-4 text-lg leading-relaxed text-slate-300">{post.description}</p>
        </header>

        <div
          className="mt-8 h-48 overflow-hidden rounded-2xl border border-white/10 sm:h-64"
          style={post.coverImageUrl ? undefined : { backgroundImage: coverGradient(post.slug) }}
        >
          {post.coverImageUrl && (
            <picture>
              {post.coverWebpUrl && <source srcSet={post.coverWebpUrl} type="image/webp" />}
              <img
                src={post.coverImageUrl}
                alt=""
                decoding="async"
                className="h-full w-full object-cover"
              />
            </picture>
          )}
        </div>

        <div className="article mt-10" dangerouslySetInnerHTML={{ __html: post.html }} />

        {post.tags?.length > 0 && (
          <ul className="mt-10 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <li key={tag} className="chip">
                {tag}
              </li>
            ))}
          </ul>
        )}

        <aside className="card mt-12 p-8 text-center">
          <p className="text-lg font-bold text-white">Now go make the screenshots</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Device frames, templates and pixel-exact exports for both stores, in your browser. Free
            to start, no card.
          </p>
          <Link to="/signup" className="btn-primary mt-6">
            Start free <ArrowRight size={16} />
          </Link>
        </aside>
      </main>
      <Footer />
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 pt-20 pb-32">{children}</main>
      <Footer />
    </div>
  );
}
