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

/* ------------------------------ copywriter ------------------------------- */
/**
 * AI headline + subheading writer. Same rules as the rest of this module: pure,
 * no network, shared by the browser panel and the server proxy.
 *
 * Idea = { heading: string, subheading: string }
 */

/** Voice presets offered in the editor; `hint` is what the model is told. */
export const COPY_TONES = [
  { id: "punchy", name: "Punchy", hint: "short, bold, benefit-first" },
  { id: "friendly", name: "Friendly", hint: "warm and conversational, speaks to 'you'" },
  { id: "professional", name: "Professional", hint: "clear and credible, no hype" },
  { id: "playful", name: "Playful", hint: "light and fun, a little cheeky" },
  { id: "minimal", name: "Minimal", hint: "as few words as possible" },
];

/** "screen" = alternatives for one screen; "set" = one idea per screen, in order. */
export const COPY_MODES = ["screen", "set"];

/** Hard limits — the store shows a headline at ~40 chars before it wraps twice. */
export const COPY_LIMITS = {
  brief: 1500, // user's description of the app/screen
  appName: 80,
  language: 40,
  screens: 12, // a store listing allows 10; leave headroom for drafts
  existing: 200, // each existing heading/subheading sent as context
  heading: 60,
  subheading: 120,
  alternatives: 4, // ideas returned in "screen" mode
};

const tidy = (s, max) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Coerce one raw idea → Idea | null. Drops empty headings and stray quotes. */
export function normalizeCopyIdea(obj) {
  if (!obj || typeof obj !== "object") return null;
  const heading = tidy(obj.heading, COPY_LIMITS.heading).replace(/^["'“”‘’]+|["'“”‘’.]+$/g, "");
  const subheading = tidy(obj.subheading, COPY_LIMITS.subheading).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  if (!heading) return null;
  return { heading, subheading };
}

/**
 * Build the copywriter prompt.
 *   mode "screen": `count` alternatives for `screens[activeIndex]`.
 *   mode "set":    one idea per screen, telling one story across the set.
 * `screens` is [{ heading, subheading }] in listing order — existing copy is
 * context (what the neighbours say), never something to repeat.
 */
export function buildCopyPrompt({
  appName = "",
  brief = "",
  tone = "punchy",
  language = "English",
  mode = "screen",
  screens = [],
  activeIndex = 0,
  count = COPY_LIMITS.alternatives,
  hasImage = false,
} = {}) {
  const voice = COPY_TONES.find((t) => t.id === tone) || COPY_TONES[0];
  const total = screens.length || 1;
  const parts = [];

  parts.push(
    "You write App Store / Google Play screenshot captions: the big headline over " +
      "each screenshot and its optional supporting line. Captions sell one benefit " +
      "per screen, in plain words a shopper skims in a second."
  );
  if (appName) parts.push(`\nAPP: ${appName}`);
  if (brief) parts.push(`ABOUT THE APP / THIS SCREEN: ${brief}`);
  if (hasImage) {
    parts.push(
      "A screenshot of the screen is attached. Read what the UI actually does and " +
        "write about that — do not describe the picture, sell the benefit it shows."
    );
  }

  if (screens.length) {
    parts.push(`\nTHE SET (${total} screen${total === 1 ? "" : "s"}, in store order):`);
    screens.forEach((s, i) => {
      const here = mode === "screen" && i === activeIndex ? "  ← write for this one" : "";
      const sub = s.subheading ? ` / ${JSON.stringify(s.subheading)}` : "";
      parts.push(`${i + 1}. ${JSON.stringify(s.heading || "")}${sub}${here}`);
    });
  }

  parts.push(`\nVOICE: ${voice.name} — ${voice.hint}.`);
  parts.push(`LANGUAGE: write in ${language}.`);
  parts.push(
    "RULES: headline 2–6 words, at most 40 characters, no trailing period, no " +
      "emoji, no exclamation marks unless the voice is Playful. Subheading is one " +
      "short sentence under 80 characters, or an empty string when the headline " +
      "stands alone. Never repeat the app name in the headline. Do not reuse a " +
      "headline that already appears in the set."
  );

  if (mode === "set") {
    parts.push(
      `\nWrite ONE headline + subheading for EACH of the ${total} screens, in order, ` +
        "so the set tells one story: screen 1 states the core promise, the rest " +
        "each cover a different feature or benefit, and the last one closes " +
        "(social proof, a nudge, or the outcome)."
    );
    parts.push(
      `Return ONLY a JSON array of exactly ${total} objects, no prose, no markdown ` +
        `fences: [{ "heading": string, "subheading": string }, …] — index i is screen i+1.`
    );
  } else {
    parts.push(
      `\nWrite ${count} DIFFERENT options for screen ${Math.min(activeIndex, total - 1) + 1}. ` +
        "Vary the angle (outcome, feature, feeling, contrast with the old way) — " +
        "not just the wording."
    );
    parts.push(
      `Return ONLY a JSON array of exactly ${count} objects, no prose, no markdown ` +
        `fences: [{ "heading": string, "subheading": string }, …].`
    );
  }
  return parts.join("\n");
}

/**
 * Parse the copywriter response into exactly `count` ideas. Throws "ai-parse"
 * when the model gave fewer usable ideas than asked — the caller retries once
 * with a stricter nudge, the same way the other parsers do.
 */
export function parseCopy(rawText, count) {
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
  const ideas = list.map(normalizeCopyIdea).filter(Boolean).slice(0, count);
  if (ideas.length < count) throw new Error("ai-parse");
  return ideas;
}
