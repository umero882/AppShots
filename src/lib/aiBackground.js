/**
 * AI background generator — BROWSER client.
 *
 * This module holds NO API keys and makes NO third-party calls. It talks only to
 * the same-origin proxy (`/api/*`), which runs server-side (Vite dev middleware
 * now; a Node/serverless wrapper later) and is the sole holder of the keys.
 *
 * Pure helpers (gradient CSS, model list, etc.) come from ./aiCore, shared with
 * the server.
 */
import { apiFetch } from "./apiClient";

export { aiGradientCss, AI_MODELS, parseGithubUrl } from "./aiCore";

/** Cached capability flags from the server (booleans, never keys). */
let capsPromise = null;
export function getCapabilities() {
  if (!capsPromise) {
    capsPromise = fetch("/api/capabilities")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({ ai: false, image: false, github: false, pexels: false }));
  }
  return capsPromise;
}

async function postJson(path, body) {
  // apiFetch attaches the Firebase ID token: these endpoints are metered and
  // reject anonymous callers. It throws ApiError, which carries the quota
  // details describeApiError() turns into a message.
  return apiFetch(path, { method: "POST", body });
}

/**
 * Ask the proxy for 2 background concepts.
 * @returns {Promise<{ concepts: Concept[], repoNotice: string|null }>}
 */
export async function suggestBackgrounds({ url = "", prompt = "", model } = {}) {
  return postJson("/api/ai/suggest", { url, prompt, model });
}

/** Generate a real image for a concept. Returns a data-URL string. */
export async function generateImage({ concept, prompt = "" }) {
  const data = await postJson("/api/ai/image", { concept, prompt });
  return data.image;
}

/**
 * Translate ordered caption strings into the target locales.
 * @returns {Promise<{ translations: { [code]: string[] } }>}
 */
export async function translateTexts({ texts = [], targets = [], model } = {}) {
  return postJson("/api/ai/translate", { texts, targets, model });
}
