/**
 * Background-image search. Uses Pexels (studio-grade curated stock) when a key
 * is configured, otherwise falls back to Openverse (Creative Commons, no key).
 *
 * NOTE: this is a client-side app, so VITE_PEXELS_API_KEY is bundled and visible
 * to anyone who loads the site. Use a free, rate-limited key — never a secret.
 *
 * Each result: { id, thumb, full, title }
 *  - thumb: small image for the results grid
 *  - full:  higher-res, phone-cropped image to use as the background
 */
const PEXELS_KEY = import.meta.env.VITE_PEXELS_API_KEY;

export function searchProvider() {
  return PEXELS_KEY ? "Pexels" : "Openverse";
}

export async function searchImages(term) {
  return PEXELS_KEY ? searchPexels(term) : searchOpenverse(term);
}

async function searchPexels(term) {
  const resp = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(term)}` +
      `&per_page=20&orientation=portrait`,
    { headers: { Authorization: PEXELS_KEY } }
  );
  if (!resp.ok) throw new Error("pexels " + resp.status);
  const data = await resp.json();
  return (data.photos || []).map((p) => ({
    id: String(p.id),
    thumb: p.src.medium,
    full: `${p.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=720&h=1480`,
    title: p.alt || term,
  }));
}

async function searchOpenverse(term) {
  const resp = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(term)}` +
      `&page_size=20&mature=false&category=photograph`
  );
  if (!resp.ok) throw new Error("openverse " + resp.status);
  const data = await resp.json();
  // Rank title matches first — the CC corpus is noisy.
  const terms = term.toLowerCase().split(/\s+/).filter(Boolean);
  const score = (title) => {
    const t = (title || "").toLowerCase();
    return terms.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
  };
  return (data.results || [])
    .filter((r) => r.thumbnail)
    .map((r) => ({ id: r.id, thumb: r.thumbnail, full: r.thumbnail, title: r.title || term, s: score(r.title) }))
    .sort((a, b) => b.s - a.s);
}
