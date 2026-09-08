/**
 * Shared templates — the style half of a project, saved for the whole workspace.
 *
 * A template carries LOOK, never CONTENT: background, type, layout, device. No
 * screenshots and no headlines, which keeps two promises at once —
 *
 *   - nobody publishes an unreleased app design to the rest of the company by
 *     saving a template, and
 *   - every value stays well under Firestore's 1500-byte indexed-field limit, so
 *     the write cannot fail on a pasted data-URL.
 *
 * Pure functions only; the storage calls live on the backend object.
 */

/** Fields a template is allowed to carry, in the shape applyTemplateStyle wants. */
const STYLE_KEYS = ["deviceId", "layoutId", "deviceScale", "background", "text", "subtext"];

// Anything longer than this is a data-URL in disguise and cannot be indexed.
const MAX_VALUE = 1200;

const tooLong = (v) => typeof v === "string" && v.length > MAX_VALUE;

/**
 * Strip a background down to something storable.
 *
 * An uploaded or AI-generated background is a data-URL held in the project, not
 * a reusable style — so a template made from one falls back to its gradient
 * rather than silently failing the save.
 */
export function storableBackground(background = {}) {
  const bg = { ...background };
  if (tooLong(bg.image)) {
    bg.image = null;
    if (bg.type === "image") bg.type = bg.gradient ? "gradient" : "solid";
  }
  for (const [k, v] of Object.entries(bg)) if (tooLong(v)) delete bg[k];
  return bg;
}

/** The reusable style of a project state, ready to save as a team template. */
export function styleFromState(state = {}) {
  const style = {};
  for (const k of STYLE_KEYS) {
    if (state[k] === undefined) continue;
    style[k] = k === "background" ? storableBackground(state[k]) : state[k];
  }
  return style;
}

/**
 * Apply a saved template to the project, keeping every screen's own content.
 *
 * Unset fields are LEFT ALONE rather than blanked: a template saved before a
 * field existed must not erase it from a project that has one.
 */
export function applyTeamTemplate(prevState, template) {
  const style = template?.style || {};
  const next = { ...prevState };
  for (const k of STYLE_KEYS) {
    if (style[k] === undefined || style[k] === null) continue;
    next[k] = typeof style[k] === "object" && !Array.isArray(style[k]) ? { ...style[k] } : style[k];
  }
  return next;
}

/** A short, human name for a template made from the current project. */
export function suggestTemplateName(projectName = "", existing = []) {
  const base = (projectName || "Team style").trim().slice(0, 40) || "Team style";
  const taken = new Set(existing.map((t) => (t.name || "").toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 50; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/** Can this person delete this template? Authors always; managers for tidying up. */
export function canDeleteTemplate(template, uid, role) {
  return template?.createdBy === uid || role === "owner" || role === "admin";
}
