/**
 * AI background generator.
 *
 * An LLM (Anthropic Claude) reads a project's brand context (from a GitHub repo
 * and/or a free-text prompt) and proposes 2 background concepts at a time. Each
 * concept renders instantly as a pure-CSS gradient (exports cleanly via
 * html-to-image) and can optionally be turned into a real image via a separate
 * image-generation API.
 *
 * SECURITY: VITE_* keys are bundled into the client and visible on any deployed
 * build. Fine for local dev; for production, proxy these behind a server or use a
 * strictly spend-capped key.
 *
 * Concept = { name, rationale, style: "linear"|"mesh", angle, stops: string[],
 *             suggestedTextColor }
 */

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const ONE_HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Read keys lazily (not at import time) so they reflect the current env and are
// testable. Vite still replaces these references in production builds.
const anthropicKey = () => import.meta.env.VITE_ANTHROPIC_API_KEY;
const openaiKey = () => import.meta.env.VITE_OPENAI_API_KEY;
const stabilityKey = () => import.meta.env.VITE_STABILITY_API_KEY;

export const AI_MODELS = [
  { id: "claude-haiku-4-5-20251001", name: "Haiku (fast)" },
  { id: "claude-opus-4-8", name: "Opus (best)" },
];

/* ----------------------------- pure helpers ----------------------------- */

/** Parse a GitHub URL or "owner/repo" shorthand → { owner, repo } | null. */
export function parseGithubUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  // Full URL form
  const m = trimmed.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i);
  let owner, repo;
  if (m) {
    owner = m[1];
    repo = m[2];
  } else {
    // owner/repo shorthand (no scheme, no host)
    const s = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!s) return null;
    owner = s[1];
    repo = s[2];
  }
  repo = repo.replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function expandHex(h) {
  let s = h.toLowerCase();
  if (s.length === 4) s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return s;
}

/** Find up to 6 unique hex colors in arbitrary text, normalized to 6-digit. */
export function extractHexColors(text) {
  if (!text || typeof text !== "string") return [];
  const found = text.match(HEX_RE) || [];
  const out = [];
  for (const raw of found) {
    const hex = expandHex(raw);
    if (!out.includes(hex)) out.push(hex);
    if (out.length >= 6) break;
  }
  return out;
}

function isHex(c) {
  return typeof c === "string" && ONE_HEX_RE.test(c.trim());
}

/** Build a pure-CSS background string for a concept (no SVG data-URIs). */
export function aiGradientCss(concept) {
  const angle = Number.isFinite(concept.angle) ? concept.angle : 135;
  const stops = (concept.stops || []).map((c) => expandHex(c));
  const base = `linear-gradient(${angle}deg, ${stops.join(", ")})`;
  if (concept.style !== "mesh") return base;
  // Mesh: scatter radial blooms (one per stop) over the base linear gradient.
  const spots = [
    "at 18% 22%",
    "at 82% 8%",
    "at 75% 80%",
    "at 12% 78%",
    "at 50% 45%",
    "at 92% 50%",
  ];
  const layers = stops.map(
    (c, i) => `radial-gradient(${spots[i % spots.length]}, ${c} 0%, transparent 55%)`
  );
  return [...layers, base].join(", ");
}

/** Coerce/validate one raw concept object → Concept | null. */
export function normalizeConcept(obj) {
  if (!obj || typeof obj !== "object") return null;
  const stops = Array.isArray(obj.stops)
    ? obj.stops.filter(isHex).map((c) => expandHex(c.trim()))
    : [];
  if (stops.length < 2) return null;
  let angle = Number(obj.angle);
  if (!Number.isFinite(angle)) angle = 135;
  angle = Math.max(0, Math.min(360, angle));
  const style = obj.style === "mesh" ? "mesh" : "linear";
  const suggestedTextColor = isHex(obj.suggestedTextColor)
    ? expandHex(String(obj.suggestedTextColor).trim())
    : "#ffffff";
  return {
    name: typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "Concept",
    rationale: typeof obj.rationale === "string" ? obj.rationale.trim() : "",
    style,
    angle,
    stops,
    suggestedTextColor,
  };
}

/** Parse an LLM response into exactly 2 valid concepts (throws otherwise). */
export function parseConcepts(rawText) {
  if (!rawText || typeof rawText !== "string") throw new Error("ai-parse");
  let text = rawText.trim();
  // Strip ```json ... ``` (or plain ```) fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Fall back to the first [...] block if there's surrounding prose.
  if (text[0] !== "[") {
    const arr = text.match(/\[[\s\S]*\]/);
    if (arr) text = arr[0];
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("ai-parse");
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const concepts = list.map(normalizeConcept).filter(Boolean).slice(0, 2);
  if (concepts.length < 2) throw new Error("ai-parse");
  return concepts;
}

/* ----------------------------- providers ----------------------------- */

export function aiProvider() {
  return anthropicKey() ? "Anthropic" : null;
}

export function imageProvider() {
  if (openaiKey()) return "OpenAI";
  if (stabilityKey()) return "Stability";
  return null;
}

/* ----------------------------- network ----------------------------- */

const GH_API = "https://api.github.com";

/** Fetch brand context for a repo from the public GitHub API (no auth). */
export async function fetchRepoContext(url) {
  const parsed = parseGithubUrl(url);
  if (!parsed) throw new Error("github-bad-url");
  const { owner, repo } = parsed;

  const repoResp = await fetch(`${GH_API}/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!repoResp.ok) {
    if (repoResp.status === 404) throw new Error("github-not-found");
    if (repoResp.status === 403) throw new Error("github-rate-limit");
    throw new Error("github-error");
  }
  const meta = await repoResp.json();

  let readme = "";
  try {
    const rmResp = await fetch(`${GH_API}/repos/${owner}/${repo}/readme`, {
      headers: { Accept: "application/vnd.github.raw" },
    });
    if (rmResp.ok) readme = (await rmResp.text()).slice(0, 4000);
  } catch {
    // README is best-effort; ignore failures.
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

function buildPrompt({ repoContext, prompt }) {
  const parts = [];
  if (repoContext) {
    parts.push("PROJECT CONTEXT (from its GitHub repository):");
    parts.push(`- Name: ${repoContext.name}`);
    if (repoContext.description) parts.push(`- Description: ${repoContext.description}`);
    if (repoContext.topics?.length) parts.push(`- Topics: ${repoContext.topics.join(", ")}`);
    if (repoContext.language) parts.push(`- Primary language: ${repoContext.language}`);
    if (repoContext.hexColors?.length)
      parts.push(`- Brand colors found: ${repoContext.hexColors.join(", ")}`);
    if (repoContext.readme)
      parts.push(`- README excerpt:\n${repoContext.readme.slice(0, 1500)}`);
  }
  if (prompt) parts.push(`\nUSER DIRECTION: ${prompt}`);
  parts.push(
    `\nDesign exactly 2 distinct app-store screenshot BACKGROUNDS that fit this ` +
      `brand. Return ONLY a JSON array of 2 objects, no prose, no markdown fences. ` +
      `Each object: { "name": string (2-3 words), "rationale": string (one short ` +
      `sentence on why it fits the brand), "style": "linear" | "mesh", "angle": ` +
      `number 0-360, "stops": array of 2-4 hex colors like "#1a2b3c", ` +
      `"suggestedTextColor": "#ffffff" or "#0b1020" — whichever has strong WCAG ` +
      `contrast against the stops }. Make the two options visually different.`
  );
  return parts.join("\n");
}

/** Ask Claude for 2 background concepts. Retries the parse once. */
export async function suggestBackgrounds({ repoContext = null, prompt = "", model } = {}) {
  const key = anthropicKey();
  if (!key) throw new Error("no-llm-key");
  const useModel = model || AI_MODELS[0].id;
  const userPrompt = buildPrompt({ repoContext, prompt });

  async function callOnce(extra) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
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

/** Generate a real image for a concept via an optional image-gen API. */
export async function generateImage({ concept, prompt = "" }) {
  const provider = imageProvider();
  if (!provider) throw new Error("no-image-key");
  const desc =
    `App store screenshot background. ${concept?.name || ""}. ` +
    `${concept?.rationale || ""} ${prompt}`.trim() +
    ". Abstract, premium, no text, no logos, vertical phone wallpaper.";

  if (provider === "OpenAI") {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${openaiKey()}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: desc,
        size: "1024x1536",
        n: 1,
      }),
    });
    if (!resp.ok) throw new Error("image-error");
    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("image-error");
    return `data:image/png;base64,${b64}`;
  }

  // Stability AI (SD3 core) — returns base64 image.
  const form = new FormData();
  form.append("prompt", desc);
  form.append("aspect_ratio", "9:16");
  form.append("output_format", "png");
  const resp = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { Authorization: `Bearer ${stabilityKey()}`, Accept: "application/json" },
    body: form,
  });
  if (!resp.ok) throw new Error("image-error");
  const data = await resp.json();
  if (!data?.image) throw new Error("image-error");
  return `data:image/png;base64,${data.image}`;
}
