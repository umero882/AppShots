/**
 * AI background — pure helpers shared by the browser client AND the server proxy.
 *
 * NOTHING in this module reads env vars, secrets, or the network. It is safe to
 * import from both the client bundle and the Node-side proxy handlers.
 *
 * Concept = { name, rationale, style: "linear"|"mesh", angle, stops: string[],
 *             suggestedTextColor }
 */

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const ONE_HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const AI_MODELS = [
  { id: "claude-haiku-4-5-20251001", name: "Haiku (fast)" },
  { id: "claude-opus-4-8", name: "Opus (best)" },
];

/** Parse a GitHub URL or "owner/repo" shorthand → { owner, repo } | null. */
export function parseGithubUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  const m = trimmed.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i);
  let owner, repo;
  if (m) {
    owner = m[1];
    repo = m[2];
  } else {
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
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
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

/** Build the translation prompt: texts (ordered) → JSON keyed by locale code. */
export function buildTranslatePrompt(texts, targets) {
  const list = texts.map((t, i) => `${i}: ${JSON.stringify(t ?? "")}`).join("\n");
  const langs = targets.map((t) => `"${t.code}" (${t.name})`).join(", ");
  return [
    "You are localizing App Store / Google Play screenshot captions for a mobile app.",
    "Translate each text idiomatically — keep the marketing punch and a similar length,",
    "do NOT translate brand or product names, and preserve any emoji.",
    "",
    "TEXTS (index: value):",
    list,
    "",
    `TARGET LOCALES: ${langs}`,
    "",
    `Return ONLY a JSON object mapping each locale code to an array of exactly ${texts.length} ` +
      `translated strings, in the SAME ORDER as the indices above. No prose, no markdown fences.`,
    `Example: { "es": ["…", "…"], "fr": ["…", "…"] }`,
  ].join("\n");
}

/**
 * Parse a translation response into { [code]: string[] } with exactly `count`
 * strings per locale (padded/trimmed). Throws "ai-parse" on malformed output.
 */
export function parseTranslations(rawText, targetCodes, count) {
  if (!rawText || typeof rawText !== "string") throw new Error("ai-parse");
  let text = rawText.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  if (text[0] !== "{") {
    const obj = text.match(/\{[\s\S]*\}/);
    if (obj) text = obj[0];
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("ai-parse");
  }
  const out = {};
  for (const code of targetCodes) {
    const arr = parsed[code];
    if (!Array.isArray(arr)) throw new Error("ai-parse");
    out[code] = Array.from({ length: count }, (_, i) => (typeof arr[i] === "string" ? arr[i] : ""));
  }
  return out;
}

/** Build the Claude user prompt from optional repo context + a user prompt. */
export function buildPrompt({ repoContext, prompt }) {
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
