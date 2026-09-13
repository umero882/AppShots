/**
 * One public hostname. The site moved from appshots.nextechlabs.tech to
 * appshotspreview.com; every link that was ever shared, indexed by Google, or
 * baked into a Stripe return URL still names the old host, so the old host has
 * to answer — with a 301 to the same path on the new one, which is what search
 * engines need to carry the ranking over and what a person's bookmark needs.
 * `www.` collapses onto the bare domain the same way.
 *
 * `CANONICAL_HOST` (e.g. "appshotspreview.com") turns this on; unset — local
 * dev, tests — nothing redirects. Deliberately narrow:
 *   - GET/HEAD only. A POST is a form or a webhook; Stripe does not follow
 *     redirects, it counts one as a failed delivery, so /api/stripe/webhook on
 *     the old host keeps working until the endpoint URL is changed in Stripe.
 *   - never /api/*, /healthz or /readyz. API calls are same-origin from a page
 *     that already got redirected; the health checks arrive from the Docker
 *     daemon and from Traefik with whatever Host they please.
 *   - never for localhost or an IP literal — that is a health check or someone
 *     on the box, not a visitor.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Host header without the port, lower-cased; "" when absent. */
export function bareHost(header) {
  const h = String(header || "")
    .trim()
    .toLowerCase();
  if (!h) return "";
  // "[::1]:3000" — an IPv6 literal keeps its brackets; strip only a trailing port.
  if (h.startsWith("[")) return h.replace(/\]:\d+$/, "]");
  return h.replace(/:\d+$/, "");
}

/**
 * The absolute URL to 301 to, or null to serve the request as-is.
 * `url` is the request's path + query as Node hands it over (`req.url`).
 */
export function canonicalRedirect({ method, host, url }, canonicalHost = process.env.CANONICAL_HOST) {
  const target = bareHost(canonicalHost);
  if (!target) return null;
  if (method !== "GET" && method !== "HEAD") return null;

  const pathname = String(url || "/").split("?")[0];
  if (pathname === "/healthz" || pathname === "/readyz" || pathname.startsWith("/api/")) return null;

  const from = bareHost(host);
  if (!from || from === target) return null;
  if (LOCAL_HOSTS.has(from) || IPV4.test(from)) return null;

  const rest = String(url || "/").startsWith("/") ? String(url || "/") : `/${url || ""}`;
  return `https://${target}${rest}`;
}
