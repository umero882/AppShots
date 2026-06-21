/**
 * Background-image search — BROWSER client. Calls the same-origin proxy, which
 * uses Pexels when a key is configured (server-side) and otherwise falls back to
 * Openverse (no key). No keys live here.
 *
 * @returns {Promise<{ provider: string, results: Array<{id,thumb,full,title}> }>}
 */
export async function searchImages(term) {
  const resp = await fetch(`/api/search?q=${encodeURIComponent(term || "")}`);
  if (!resp.ok) throw new Error("search " + resp.status);
  return resp.json();
}
