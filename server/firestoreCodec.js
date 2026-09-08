/**
 * Firestore REST value codec — plain JS objects <-> Firestore typed `Value`s.
 *
 * The browser backend carries its own copy (src/lib/backend.js) because it is
 * bundled; importing that here would drag the Firebase client SDK into a server
 * whose whole point is having no runtime dependencies. Same rules, both sides:
 * the shapes below are dictated by the REST API, not by us.
 */

export function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  const t = typeof v;
  if (t === "string") return { stringValue: v };
  if (t === "boolean") return { booleanValue: v };
  if (t === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (t === "object") return { mapValue: { fields: toFirestoreFields(v) } };
  return { nullValue: null };
}

export function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, val] of Object.entries(obj || {})) {
    if (val === undefined) continue; // Firestore cannot store undefined
    fields[k] = toFirestoreValue(val);
  }
  return fields;
}

export function fromFirestoreValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}

export function fromFirestoreFields(fields) {
  const obj = {};
  for (const [k, val] of Object.entries(fields || {})) obj[k] = fromFirestoreValue(val);
  return obj;
}
