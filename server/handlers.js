/**
 * Server-side proxy handlers. These run in Node (Vite dev middleware now; any
 * serverless/Node host later) and are the ONLY place the real API keys are read.
 *
 * Keys come from server-only env vars (NO `VITE_` prefix, so Vite never bundles
 * them into the browser):
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY, STABILITY_API_KEY, GITHUB_TOKEN, PEXELS_API_KEY
 *
 * Each handler returns a plain JSON-able object, or throws an Error whose message
 * is a typed code the transport maps to an HTTP status.
 */
import {
  buildPrompt, parseConcepts, extractHexColors, buildTranslatePrompt, parseTranslations,
} from "../src/lib/aiCore.js";

const AI_MODEL_DEFAULT = "claude-haiku-4-5-20251001";
const GH_API = "https://api.github.com";

const env = (k) => process.env[k];

/* ----------------------------- capabilities ----------------------------- */

export function capabilities() {
  return {
    ai: !!env("ANTHROPIC_API_KEY"),
    image: !!(env("OPENAI_API_KEY") || env("STABILITY_API_KEY")),
    github: !!env("GITHUB_TOKEN"),
    pexels: !!env("PEXELS_API_KEY"),
  };
}

/* ----------------------------- github ----------------------------- */

function ghHeaders(accept) {
  const headers = { Accept: accept, "User-Agent": "appshots" };
  const token = env("GITHUB_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchRepoContext(owner, repo) {
  const repoResp = await fetch(`${GH_API}/repos/${owner}/${repo}`, {
    headers: ghHeaders("application/vnd.github+json"),
  });
  if (!repoResp.ok) {
    if (repoResp.status === 404) {
      throw new Error(env("GITHUB_TOKEN") ? "github-not-found" : "github-private");
    }
    if (repoResp.status === 403) throw new Error("github-rate-limit");
    if (repoResp.status === 401) throw new Error("github-bad-token");
    throw new Error("github-error");
  }
  const meta = await repoResp.json();

  let readme = "";
  try {
    const rmResp = await fetch(`${GH_API}/repos/${owner}/${repo}/readme`, {
      headers: ghHeaders("application/vnd.github.raw"),
    });
    if (rmResp.ok) readme = (await rmResp.text()).slice(0, 4000);
  } catch {
    // best-effort
  }

  return {
    name: meta.name || repo,
    description: meta.description || "",
    topics: Array.isArray(meta.topics) ? meta.topics : [],
    language: meta.language || "",
    readme,
    hexColors: extractHexColors(`${meta.description || ""}\n${readme}`),
  };
}

/* ----------------------------- suggest (Claude) ----------------------------- */

async function callClaude({ repoContext, prompt, model }) {
  const key = env("ANTHROPIC_API_KEY");
  const useModel = model || AI_MODEL_DEFAULT;
  const userPrompt = buildPrompt({ repoContext, prompt });

  async function callOnce(extra) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 1024,
        messages: [{ role: "user", content: userPrompt + (extra || "") }],
      }),
    });
    if (!resp.ok) throw new Error("llm-error");
    const data = await resp.json();
    const text = (data.content || []).map((b) => b.text || "").join("");
    return parseConcepts(text);
  }

  try {
    return await callOnce("");
  } catch (e) {
    if (e.message === "ai-parse") {
      return callOnce("\n\nRespond with ONLY the JSON array — nothing else.");
    }
    throw e;
  }
}

export async function suggest({ url, prompt = "", model } = {}) {
  if (!env("ANTHROPIC_API_KEY")) throw new Error("no-llm-key");
  let repoContext = null;
  let repoNotice = null;
  if (url && url.trim()) {
    try {
      const parsed = parseRepo(url.trim());
      repoContext = await fetchRepoContext(parsed.owner, parsed.repo);
    } catch (e) {
      repoNotice = e.message;
    }
  }
  const concepts = await callClaude({ repoContext, prompt, model });
  return { concepts, repoNotice };
}

// Local parse (avoids importing the client's parseGithubUrl name collision).
function parseRepo(url) {
  const m = url.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i);
  let owner, repo;
  if (m) {
    owner = m[1];
    repo = m[2];
  } else {
    const s = url.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!s) throw new Error("github-bad-url");
    owner = s[1];
    repo = s[2];
  }
  repo = repo.replace(/\.git$/i, "");
  return { owner, repo };
}

/* ----------------------------- translate (Claude) ----------------------------- */

export async function translate({ texts = [], targets = [], model } = {}) {
  if (!env("ANTHROPIC_API_KEY")) throw new Error("no-llm-key");
  const clean = (Array.isArray(texts) ? texts : []).map((t) => (typeof t === "string" ? t : ""));
  const langs = (Array.isArray(targets) ? targets : []).filter((t) => t && t.code);
  const codes = langs.map((t) => t.code);
  if (!clean.length || !codes.length) return { translations: {} };

  const key = env("ANTHROPIC_API_KEY");
  const useModel = model || AI_MODEL_DEFAULT;
  const prompt = buildTranslatePrompt(clean, langs);

  async function callOnce(extra) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt + (extra || "") }],
      }),
    });
    if (!resp.ok) throw new Error("llm-error");
    const data = await resp.json();
    const text = (data.content || []).map((b) => b.text || "").join("");
    return parseTranslations(text, codes, clean.length);
  }

  try {
    return { translations: await callOnce("") };
  } catch (e) {
    if (e.message === "ai-parse") {
      return { translations: await callOnce("\n\nRespond with ONLY the JSON object — nothing else.") };
    }
    throw e;
  }
}

/* ----------------------------- image gen ----------------------------- */

export async function image({ concept, prompt = "" } = {}) {
  const useOpenAI = !!env("OPENAI_API_KEY");
  const useStability = !useOpenAI && !!env("STABILITY_API_KEY");
  if (!useOpenAI && !useStability) throw new Error("no-image-key");

  const desc =
    `App store screenshot background. ${concept?.name || ""}. ` +
    `${concept?.rationale || ""} ${prompt}`.trim() +
    ". Abstract, premium, no text, no logos, vertical phone wallpaper.";

  if (useOpenAI) {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${env("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify({ model: "gpt-image-1", prompt: desc, size: "1024x1536", n: 1 }),
    });
    if (!resp.ok) throw new Error("image-error");
    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("image-error");
    return { image: `data:image/png;base64,${b64}` };
  }

  const form = new FormData();
  form.append("prompt", desc);
  form.append("aspect_ratio", "9:16");
  form.append("output_format", "png");
  const resp = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("STABILITY_API_KEY")}`, Accept: "application/json" },
    body: form,
  });
  if (!resp.ok) throw new Error("image-error");
  const data = await resp.json();
  if (!data?.image) throw new Error("image-error");
  return { image: `data:image/png;base64,${data.image}` };
}

/* ----------------------------- image search ----------------------------- */

export async function search(term) {
  const q = (term || "").trim();
  if (!q) return { provider: env("PEXELS_API_KEY") ? "Pexels" : "Openverse", results: [] };
  return env("PEXELS_API_KEY") ? searchPexels(q) : searchOpenverse(q);
}

async function searchPexels(term) {
  const resp = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(term)}` +
      `&per_page=20&orientation=portrait`,
    { headers: { Authorization: env("PEXELS_API_KEY") } }
  );
  if (!resp.ok) throw new Error("search-error");
  const data = await resp.json();
  return {
    provider: "Pexels",
    results: (data.photos || []).map((p) => ({
      id: String(p.id),
      thumb: p.src.medium,
      full: `${p.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=720&h=1480`,
      title: p.alt || term,
    })),
  };
}

async function searchOpenverse(term) {
  const resp = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(term)}` +
      `&page_size=20&mature=false&category=photograph`
  );
  if (!resp.ok) throw new Error("search-error");
  const data = await resp.json();
  const terms = term.toLowerCase().split(/\s+/).filter(Boolean);
  const score = (title) => {
    const t = (title || "").toLowerCase();
    return terms.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
  };
  return {
    provider: "Openverse",
    results: (data.results || [])
      .filter((r) => r.thumbnail)
      .map((r) => ({ id: r.id, thumb: r.thumbnail, full: r.thumbnail, title: r.title || term, s: score(r.title) }))
      .sort((a, b) => b.s - a.s),
  };
}

/** Map a handler error code to an HTTP status. */
export function statusForError(code) {
  if (code === "no-llm-key" || code === "no-image-key") return 503;
  if (code === "github-bad-url") return 400;
  return 502; // upstream/other
}
