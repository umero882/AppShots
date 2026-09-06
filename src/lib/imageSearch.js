/**
 * Background-image search — BROWSER client. Calls the same-origin proxy, which
 * uses Pexels when a key is configured (server-side) and otherwise falls back to
 * Openverse (no key). No keys live here.
 *
 * Metered server-side, so the call carries the signed-in user's ID token.
 *
 * @returns {Promise<{ provider: string, results: Array<{id,thumb,full,title}> }>}
 */
import { apiFetch } from "./apiClient";

export async function searchImages(term) {
  return apiFetch(`/api/search?q=${encodeURIComponent(term || "")}`);
}
