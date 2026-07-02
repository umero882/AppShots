/**
 * App Store tracker — BROWSER client. Calls the same-origin proxy, which hits
 * Apple's public iTunes Search API server-side (no key, official). Used to look
 * up a competitor app's own App Store listing (screenshots + metadata) for
 * research and inspiration.
 *
 * @returns {Promise<{ results: Array<object>, country: string }>}
 */
export async function searchApps({ q = "", id = "", country = "us" } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (id) params.set("id", id);
  if (country) params.set("country", country);
  const resp = await fetch(`/api/app-store?${params.toString()}`);
  if (!resp.ok) {
    const code = resp.status;
    throw new Error(code === 400 ? "bad-query" : "unavailable");
  }
  return resp.json();
}

// Common App Store storefronts for the country picker.
export const STOREFRONTS = [
  { cc: "us", label: "United States" },
  { cc: "gb", label: "United Kingdom" },
  { cc: "ca", label: "Canada" },
  { cc: "au", label: "Australia" },
  { cc: "de", label: "Germany" },
  { cc: "fr", label: "France" },
  { cc: "es", label: "Spain" },
  { cc: "it", label: "Italy" },
  { cc: "br", label: "Brazil" },
  { cc: "in", label: "India" },
  { cc: "jp", label: "Japan" },
  { cc: "kr", label: "South Korea" },
  { cc: "sa", label: "Saudi Arabia" },
  { cc: "ae", label: "United Arab Emirates" },
];
